import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { enqueueClassifyRetry, type ClaimedJob, type JobHandler } from "../homesend/retry-queue";
import { ingestWhatsAppMedia, ingestWhatsAppText, IngestRejected, type IngestDeps, type IngestOutcome } from "../homesend/ingest";
import { FAILURE_REASON_COPY } from "../homesend/items";
import { sendWhatsAppText, type WhatsAppConfig } from "../notifications/whatsapp";
import { log } from "../observability/logger";
import { hitRateLimit } from "../security/rate-limit";
import { recordWhatsAppEvents, type WhatsAppEvent } from "./events";
import { isForHomeTalk, isQuestionForWonderHome } from "./hometalk";
import type { WhatsAppInboundMessage, WhatsAppMessageType } from "./inbound";
import { completeLink, findActiveIdentity, LINK_REPLIES, readConnectCode, UNKNOWN_SENDER_REPLY } from "./linking";
import { downloadWhatsAppMedia, type MediaDownload } from "./media";

/**
 * WhatsApp into HomeSend (the WhatsApp HomeSend spec §5, §12–§16).
 *
 * The webhook does only what must happen at once, and quickly:
 *   - "CONNECT <code>" completes a link, and is answered;
 *   - a number with no live link gets one plain reply (rate limited) and
 *     nothing it sent is kept;
 *   - a message from a linked number is recorded once, by WhatsApp's own
 *     message id, and a `whatsapp.process` job is queued for it.
 * The job then does the slow part — fetching a file, understanding it — and
 * the job queue brings retries with backoff and a dead state, so a provider
 * outage never loses a message and a retried delivery never makes a second
 * item.
 *
 * Processing ends in a HomeSend item, never a domain record: from there it
 * is reviewed and confirmed exactly like an upload or a forwarded email,
 * under the same gates. The member and household are the verified link's;
 * nothing in a message can say otherwise. What is sent back on WhatsApp is
 * short, and never echoes an amount, a health detail or a number.
 */

export const WHATSAPP_PROCESS_KIND = "whatsapp.process";
const MAX_PROCESS_ATTEMPTS = 5;

export type WhatsAppIntakeDeps = {
  config: WhatsAppConfig;
  fetch?: typeof fetch;
  ingest?: IngestDeps;
  now?: () => Date;
  /** Media download, replaceable in tests. */
  download?: (mediaId: string) => Promise<MediaDownload>;
  /**
   * HomeTalk for a linked member's question or request, under their own
   * session (`apps/web/app/_lib/whatsapp-hometalk.ts`). Returns the reply to
   * send, or null when it could not answer.
   */
  ask?: (input: { householdId: string; memberId: string; text: string; requestId: string }) => Promise<string | null>;
  /** Waiting for what the person sends straight after; replaceable in tests. */
  sleep?: (ms: number) => Promise<void>;
};

export type ReceiveOutcome = { linked: number; queued: string[]; duplicates: number; unknown: number };

/** The webhook's part: link, refuse, or record and queue. Each message independently. */
export async function receiveWhatsAppMessages(admin: SupabaseClient, messages: readonly WhatsAppInboundMessage[], deps: WhatsAppIntakeDeps): Promise<ReceiveOutcome> {
  const outcome: ReceiveOutcome = { linked: 0, queued: [], duplicates: 0, unknown: 0 };
  const events: WhatsAppEvent[] = [];
  const reply = (to: string, text: string) => sendWhatsAppText(deps.config, to, text, deps.fetch).catch(() => undefined);

  for (const message of messages) {
    const code = message.type === "text" ? readConnectCode(message.text) : null;
    if (code) {
      // A few tries per number per hour: a code is ten characters from a
      // 31-letter alphabet, and nobody gets to guess at them.
      if (!(await hitRateLimit(admin, "whatsapp.unlinked", message.waUserId))) {
        events.push({ kind: "rate_limited" });
        continue;
      }
      const result = await completeLink(admin, { code, waUserId: message.waUserId, phone: message.phone, displayName: message.profileName });
      const ok = result.outcome === "linked" || result.outcome === "already_linked";
      events.push({ kind: ok ? "connection_completed" : "connection_failed", householdId: result.householdId });
      if (result.outcome === "linked" && result.householdId) {
        outcome.linked += 1;
        await auditChange({ householdId: result.householdId, actorMemberId: result.memberId, eventType: "whatsapp.linked", targetTable: "whatsapp_identities", targetId: result.identityId });
      }
      await reply(message.phone, LINK_REPLIES[result.outcome]);
      continue;
    }

    const identity = await findActiveIdentity(admin, message.waUserId);
    if (!identity) {
      outcome.unknown += 1;
      events.push({ kind: "unknown_sender" });
      if (await hitRateLimit(admin, "whatsapp.unlinked", message.waUserId)) await reply(message.phone, UNKNOWN_SENDER_REPLY);
      continue;
    }

    const { data: inserted, error } = await admin
      .from("whatsapp_messages")
      .upsert(
        {
          provider_message_id: message.providerMessageId,
          identity_id: identity.id,
          household_id: identity.householdId,
          member_id: identity.memberId,
          message_type: message.type,
          text_content: message.text,
          media_id: message.media?.id ?? null,
          media_mime_type: message.media?.mimeType ?? null,
          media_filename: message.media?.filename ?? null,
          reply_to_provider_message_id: message.replyTo ?? null,
          forwarded: message.forwarded ?? false,
          received_at: message.receivedAt.toISOString(),
        },
        { onConflict: "provider_message_id", ignoreDuplicates: true },
      )
      .select("id");
    if (error) throw new Error(`whatsapp_messages insert failed: ${error.code ?? "unknown"}`);
    const row = (inserted ?? [])[0] as { id: string } | undefined;
    if (!row) {
      // WhatsApp delivered it again: it is already recorded, and already queued or done.
      outcome.duplicates += 1;
      events.push({ kind: "duplicate", householdId: identity.householdId });
      continue;
    }

    events.push({ kind: message.media ? "media_received" : "message_received", householdId: identity.householdId });
    await admin.from("whatsapp_identities").update({ last_message_at: message.receivedAt.toISOString() }).eq("id", identity.id);
    await enqueueProcessing(admin, { householdId: identity.householdId, messageId: row.id });
    outcome.queued.push(row.id);
  }

  await recordWhatsAppEvents(admin, events);
  return outcome;
}

async function enqueueProcessing(admin: SupabaseClient, input: { householdId: string; messageId: string }): Promise<void> {
  const { error } = await admin.from("jobs").insert({
    household_id: input.householdId,
    kind: WHATSAPP_PROCESS_KIND,
    payload: { messageId: input.messageId },
    dedupe_key: input.messageId,
  });
  if (error && error.code !== "23505") throw new Error(`enqueue whatsapp.process failed: ${error.code ?? "unknown"}`);
}

type MessageRow = {
  id: string;
  household_id: string;
  member_id: string;
  provider_message_id: string;
  message_type: WhatsAppMessageType;
  text_content: string | null;
  media_id: string | null;
  media_mime_type: string | null;
  reply_to_provider_message_id?: string | null;
  media_filename: string | null;
  forwarded?: boolean | null;
  received_at: string;
  created_at?: string;
  processing_status: "received" | "processing" | "processed" | "failed" | "ignored";
  attempts: number;
  homesend_item_id: string | null;
  acknowledged_at: string | null;
  identity: { phone_number: string; status: string } | null;
};

export type ProcessResult = "read" | "skipped" | "failed";

/**
 * Turns one recorded message into a HomeSend item and says so on WhatsApp.
 * Safe to run again: a message already processed is skipped, the item is
 * keyed by WhatsApp's message id, and the acknowledgement is sent once.
 */
export async function processWhatsAppMessage(admin: SupabaseClient, messageId: string, deps: WhatsAppIntakeDeps): Promise<ProcessResult> {
  const { data } = await admin
    .from("whatsapp_messages")
    .select(
      `${MESSAGE_COLUMNS}, identity:whatsapp_identities!whatsapp_messages_identity_id_fkey(phone_number, status)`,
    )
    .eq("id", messageId)
    .maybeSingle();
  const found = data as MessageRow | null;
  if (!found || found.processing_status === "processed" || found.processing_status === "ignored") return "skipped";
  if (found.attempts >= MAX_PROCESS_ATTEMPTS) return "skipped";
  // The message this run reads: this one, or the one its burst is about.
  let row: MessageRow = found;

  const now = deps.now?.() ?? new Date();
  const to = row.identity?.phone_number ?? null;
  const events: WhatsAppEvent[] = [];
  const say = async (text: string) => {
    if (!to || row.acknowledged_at) return;
    const sent = await sendWhatsAppText(deps.config, to, text, deps.fetch).catch(() => ({ ok: false as const }));
    events.push({ kind: sent.ok ? "ack_sent" : "ack_failed", householdId: row.household_id });
    if (sent.ok) await admin.from("whatsapp_messages").update({ acknowledged_at: now.toISOString() }).eq("id", row.id);
  };
  const settle = async (patch: Record<string, unknown>) => {
    await admin.from("whatsapp_messages").update(patch).eq("id", row.id);
  };

  // Messages sent together are one thing (the owner's forward followed by
  // "asmi Karate Sunday", 2026-10-24): a forward, a photo or a note and what
  // the person types straight after. WhatsApp stamps them to the second and
  // may deliver them in either order, often at the same moment, so a fresh
  // message waits for the rest, then claims the whole burst in one update.
  // Whichever run's update lands first reads it; every other run finds its
  // own message already taken and stops.
  let burst: MessageRow[] = [];
  if (row.attempts === 0 && row.processing_status === "received") {
    const wait = Math.max(0, new Date(row.received_at).getTime() + BURST_SETTLE_MS - now.getTime());
    if (wait > 0) await (deps.sleep ?? defaultSleep)(Math.min(wait, BURST_SETTLE_MS));
    const claimed = await claimBurst(admin, row);
    if (!claimed) return "skipped";
    row = claimed.lead;
    burst = claimed.rest;
    await settle({ attempts: row.attempts + 1 });
  } else {
    await settle({ processing_status: "processing", attempts: row.attempts + 1 });
  }
  const together = burst.length > 0;
  const settleBurst = async (patch: Record<string, unknown>) => {
    if (together) await admin.from("whatsapp_messages").update(patch).in("id", burst.map((entry) => entry.id));
  };

  // Too many from one member in an hour: kept, and picked up again when the
  // job queue retries it — slower, never lost, and nothing is said until it
  // is actually in HomeSend.
  if (row.attempts === 0 && !(await hitRateLimit(admin, "homesend.whatsapp", row.member_id))) {
    events.push({ kind: "rate_limited", householdId: row.household_id });
    await settle({ processing_status: "received" });
    await settleBurst({ processing_status: "received" });
    await recordWhatsAppEvents(admin, events);
    return "failed";
  }

  if (row.message_type === "video" || row.message_type === "unsupported") {
    events.push({ kind: "unsupported_type", householdId: row.household_id });
    await settle({ processing_status: "ignored" });
    await settleBurst({ processing_status: "received" });
    await say(UNSUPPORTED_REPLY);
    await recordWhatsAppEvents(admin, events);
    return "read";
  }

  // A reply to one of the person's own items that names someone in the
  // household answers that item's "who is this for?" (the owner's "asmi",
  // 2026-10-24): the item waits for them with that person picked, and the
  // reply is never a new item of its own.
  if (!together && row.message_type === "text" && row.text_content && (row.reply_to_provider_message_id || row.text_content.trim().length <= 60)) {
    const answered = await answerWhoFor(admin, row, row.text_content, now);
    if (answered) {
      events.push({ kind: "clarification_answered", householdId: row.household_id });
      await settle({ processing_status: "ignored" });
      await say(`Got it — that's for ${answered}. It's waiting in HomeSend for you to check.`);
      await recordWhatsAppEvents(admin, events);
      return "read";
    }
  }

  // A question or an everyday request is asked of WonderHome, not handed to
  // it to keep: HomeTalk answers it (through `deps.ask`, the same gateway as
  // Alexa), and it is never a HomeSend item. Without HomeTalk wired in, the
  // reply says where to ask.
  const text = row.message_type === "text" ? (row.text_content ?? "") : "";
  if (!together && text && (deps.ask ? isForHomeTalk(text) : isQuestionForWonderHome(text))) {
    const answer = deps.ask
      ? await deps.ask({ householdId: row.household_id, memberId: row.member_id, text, requestId: row.provider_message_id }).catch(() => null)
      : null;
    events.push({ kind: answer ? "question_answered" : "question_redirected", householdId: row.household_id });
    await settle({ processing_status: "ignored" });
    await say(answer ?? QUESTION_REPLY);
    await recordWhatsAppEvents(admin, events);
    return "read";
  }

  const externalId = `whatsapp:${row.provider_message_id}`.slice(0, 200);
  let outcome: IngestOutcome;
  try {
    // Other forwarded texts are more of the content; the person's own texts are their note on it.
    const passedOn = burst.filter((entry) => entry.forwarded).map((entry) => entry.text_content?.trim() ?? "").filter(Boolean);
    const added = burst.filter((entry) => !entry.forwarded || row.message_type !== "text").map((entry) => entry.text_content?.trim() ?? "").filter(Boolean);
    if (row.message_type === "text") {
      const content = [row.text_content?.trim() ?? "", ...passedOn].filter(Boolean).join("\n\n");
      outcome = await ingestWhatsAppText(admin, { householdId: row.household_id, memberId: row.member_id, externalId, text: withAdded(content, added) }, deps.ingest);
    } else {
      const download = deps.download ?? ((id: string) => downloadWhatsAppMedia(deps.config, id, { fetch: deps.fetch }));
      const file = await download(row.media_id ?? "");
      if (!file.ok) {
        if (file.reason === "too_large") {
          await settle({ processing_status: "failed", failure_reason: "too_large" });
          events.push({ kind: "message_failed", householdId: row.household_id });
          await say("That file is too large for WonderHome — please send one under 10MB.");
          await recordWhatsAppEvents(admin, events);
          return "read";
        }
        // WhatsApp's media service didn't answer: the job tries again later.
        await settle({ processing_status: "failed", failure_reason: "media_unavailable" });
        events.push({ kind: "retry_queued", householdId: row.household_id });
        await recordWhatsAppEvents(admin, events);
        return "failed";
      }
      outcome = await ingestWhatsAppMedia(
        admin,
        {
          householdId: row.household_id,
          memberId: row.member_id,
          externalId,
          bytes: file.bytes,
          claimedType: row.media_mime_type ?? file.mimeType ?? "application/octet-stream",
          filename: row.media_filename,
          caption: [row.text_content?.trim(), ...added].filter(Boolean).join("\n") || null,
        },
        deps.ingest,
      );
    }
  } catch (thrown) {
    if (thrown instanceof IngestRejected) {
      await settle({ processing_status: "failed", failure_reason: "rejected" });
      events.push({ kind: "message_failed", householdId: row.household_id });
      await say(thrown.message);
      await recordWhatsAppEvents(admin, events);
      return "read";
    }
    log.warn("whatsapp message processing failed", { reason: thrown instanceof Error ? thrown.name : "unknown", detail: thrown instanceof Error ? thrown.message : "unknown", allow: ["reason"] });
    await settle({ processing_status: "failed", failure_reason: "processing_error" });
    events.push({ kind: "retry_queued", householdId: row.household_id });
    await recordWhatsAppEvents(admin, events);
    return "failed";
  }

  if (outcome.classifyFailed) await enqueueClassifyRetry(admin, { householdId: row.household_id, itemId: outcome.itemId, now }).catch(() => false);
  await settle({ processing_status: "processed", failure_reason: null, homesend_item_id: outcome.itemId });
  // The rest of the burst is part of this item, answered by this one reply.
  await settleBurst({ processing_status: "processed", failure_reason: null, homesend_item_id: outcome.itemId, acknowledged_at: now.toISOString() });
  events.push({ kind: "message_processed", householdId: row.household_id, latencyMs: now.getTime() - new Date(row.received_at).getTime() });
  if (!outcome.duplicate) events.push({ kind: "homesend_created", householdId: row.household_id });
  const ack = acknowledgementFor(outcome, { whoFor: await whoForChoices(admin, row.household_id, outcome).catch(() => []) });
  if (ack.asks) events.push({ kind: "clarification_requested", householdId: row.household_id });
  await say(ack.text);
  await recordWhatsAppEvents(admin, events);
  return "read";
}

/** The `whatsapp.process` job, for `drainJobs`. */
export function whatsappJobHandler(deps: WhatsAppIntakeDeps): JobHandler {
  return async (client: SupabaseClient, job: ClaimedJob) => {
    const messageId = typeof job.payload?.messageId === "string" ? job.payload.messageId : null;
    if (!messageId) return "skipped";
    return processWhatsAppMessage(client, messageId, deps);
  };
}

/**
 * The household member a short reply names, when exactly one fits: their
 * name, their first name or their nickname, ignoring case. Pure.
 */
export function memberNamedInReply(text: string, members: readonly { id: string; displayName: string; nickname?: string | null }[]): { id: string; displayName: string } | null {
  const said = text.trim().toLowerCase().replace(/^(?:for|it's for|its for|this is for)\s+/, "").replace(/[.!]+$/, "").trim();
  if (!said || said.length > 60) return null;
  const fits = members.filter((member) => {
    const name = member.displayName.trim().toLowerCase();
    return name === said || name.split(/\s+/)[0] === said || member.nickname?.trim().toLowerCase() === said;
  });
  return fits.length === 1 ? { id: fits[0]!.id, displayName: fits[0]!.displayName } : null;
}

/**
 * Sets who an item the person sent is for, from their reply to it. Only
 * their own item, in their household, still waiting for a person; the
 * choice is written as the name the item is read as being for, so the
 * review opens with that person picked and nothing is applied.
 */
async function answerWhoFor(admin: SupabaseClient, row: MessageRow, text: string, now: Date): Promise<string | null> {
  // The item it answers: the one the person swiped to reply to, or else the
  // last thing they sent in the past half hour that is still waiting to
  // know who it is for (a plain "asmi" straight after the photo).
  const replying = Boolean(row.reply_to_provider_message_id);
  let quotedQuery = admin
    .from("whatsapp_messages")
    .select("homesend_item_id")
    .eq("household_id", row.household_id)
    .eq("member_id", row.member_id);
  quotedQuery = replying
    ? quotedQuery.eq("provider_message_id", row.reply_to_provider_message_id!)
    : quotedQuery.neq("id", row.id).not("homesend_item_id", "is", null).gte("received_at", new Date(now.getTime() - WHO_FOR_WINDOW_MS).toISOString()).order("received_at", { ascending: false }).limit(1);
  const { data: quotedRows } = await quotedQuery;
  const quoted = (Array.isArray(quotedRows) ? quotedRows[0] : quotedRows) as { homesend_item_id: string | null } | undefined;
  const itemId = quoted?.homesend_item_id ?? null;
  if (!itemId) return null;
  const [{ data: item }, { data: members }] = await Promise.all([
    admin.from("home_send_items").select("id, status, classified_kind, extracted, understanding").eq("household_id", row.household_id).eq("id", itemId).maybeSingle(),
    admin.from("household_members").select("id, display_name, nickname, member_type").eq("household_id", row.household_id).eq("status", "active").limit(50),
  ]);
  const waiting = item as { id: string; status: string; classified_kind: string | null; extracted: Record<string, unknown> | null; understanding: Record<string, unknown> | null } | null;
  if (!waiting || waiting.status !== "classified" || !PERSONAL_KINDS.has(waiting.classified_kind ?? "")) return null;
  // Without a swipe-reply, only an item that does not know yet.
  if (!replying && personOf(waiting.extracted)) return null;
  const eligible = ((members ?? []) as { id: string; display_name: string; nickname: string | null; member_type: string }[])
    .filter((entry) => (waiting.classified_kind === "school_item" ? entry.member_type === "child" : entry.member_type !== "helper"))
    .map((entry) => ({ id: entry.id, displayName: entry.display_name, nickname: entry.nickname }));
  const member = memberNamedInReply(text, eligible);
  if (!member) return null;
  const extracted = { ...(waiting.extracted ?? {}), subjectMemberName: member.displayName, people: [member.displayName] };
  // The review reads who an item is for from its understanding's references
  // (`homesend/resolve.ts`), the same as a name the document itself said.
  const understanding = waiting.understanding ? { ...waiting.understanding, references: [{ text: member.displayName, candidates: [], confidence: 0 }] } : null;
  const { error } = await admin
    .from("home_send_items")
    .update({ extracted, ...(understanding ? { understanding } : {}) })
    .eq("household_id", row.household_id)
    .eq("id", waiting.id);
  return error ? null : member.displayName;
}

/** How long after sending something a plain name still answers who it is for. */
const WHO_FOR_WINDOW_MS = 30 * 60 * 1000;

/** The kinds that are about one person: a school item is a child's, a health document someone's. */
const PERSONAL_KINDS = new Set(["school_item", "health_document"]);

function personOf(extracted: Record<string, unknown> | null): string | null {
  const named = typeof extracted?.subjectMemberName === "string" ? extracted.subjectMemberName : null;
  const people = Array.isArray(extracted?.people) ? (extracted!.people as unknown[]).filter((entry): entry is string => typeof entry === "string") : [];
  return named ?? people[0] ?? null;
}

/**
 * Who a new item could be for, when it says nobody and more than one person
 * fits: the household's children for a school item, its people (not
 * helpers) for a health document. Asked on WhatsApp straight away, so a
 * plain reply settles it.
 */
async function whoForChoices(admin: SupabaseClient, householdId: string, outcome: IngestOutcome): Promise<string[]> {
  if (outcome.state === "failed" || outcome.duplicate || !PERSONAL_KINDS.has(outcome.item.classifiedKind ?? "")) return [];
  if (personOf((outcome.item.extracted ?? null) as Record<string, unknown> | null)) return [];
  const { data } = await admin.from("household_members").select("display_name, member_type").eq("household_id", householdId).eq("status", "active").limit(50);
  const names = ((data ?? []) as { display_name: string; member_type: string }[])
    .filter((entry) => (outcome.item.classifiedKind === "school_item" ? entry.member_type === "child" : entry.member_type !== "helper"))
    .map((entry) => entry.display_name.split(/\s+/)[0]!);
  return names.length >= 2 && names.length <= 6 ? names : [];
}

/** How close together messages must be to be read as one: a forward and the note typed straight after it. */
export const BURST_WINDOW_MS = 30_000;
/** How long a fresh message waits for the rest of its burst before it is read. */
export const BURST_SETTLE_MS = 8_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Every column a run reads of a message, apart from the sender's identity. */
const MESSAGE_COLUMNS =
  "id, household_id, member_id, provider_message_id, message_type, text_content, media_id, media_mime_type, media_filename, reply_to_provider_message_id, forwarded, received_at, created_at, processing_status, attempts, homesend_item_id, acknowledged_at";

/**
 * Claims this message and the rest of its burst in one update, so two runs
 * can never each take a part: the person's other fresh messages within the
 * window either side of it. A burst holding more than one photo or file is
 * not joined (each file is its own item), and neither is an empty text.
 * Null when another run already took this message.
 */
async function claimBurst(admin: SupabaseClient, row: MessageRow): Promise<{ lead: MessageRow; rest: MessageRow[] } | null> {
  const at = new Date(row.received_at).getTime();
  const { data } = await admin
    .from("whatsapp_messages")
    .select(MESSAGE_COLUMNS)
    .eq("household_id", row.household_id)
    .eq("member_id", row.member_id)
    .eq("processing_status", "received")
    .eq("attempts", 0)
    .neq("id", row.id)
    .gte("received_at", new Date(at - BURST_WINDOW_MS).toISOString())
    .lte("received_at", new Date(at + BURST_WINDOW_MS).toISOString())
    .limit(10);
  const others = ((data ?? []) as MessageRow[]).filter((entry) => entry.message_type !== "unsupported" && entry.message_type !== "video" && (entry.message_type !== "text" || entry.text_content?.trim()));
  const files = [row, ...others].filter((entry) => entry.message_type !== "text").length;
  const ids = [row.id, ...(files <= 1 ? others.map((entry) => entry.id) : [])];
  const { data: claimed } = await admin
    .from("whatsapp_messages")
    .update({ processing_status: "processing" })
    .in("id", ids)
    .eq("processing_status", "received")
    .select(MESSAGE_COLUMNS);
  const taken = (claimed ?? []) as MessageRow[];
  if (!taken.some((entry) => entry.id === row.id)) return null;
  const lead = leadOf(taken);
  return {
    lead: { ...lead, identity: row.identity },
    rest: taken.filter((entry) => entry.id !== lead.id).sort(sentOrder),
  };
}

/** Sent order: WhatsApp's time to the second, then the order they arrived in. */
function sentOrder(a: MessageRow, b: MessageRow): number {
  return a.received_at.localeCompare(b.received_at) || (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id);
}

/**
 * What a burst is about: its photo or file, else the first forwarded text,
 * else its longest text (a short note is about something longer). Pure.
 */
export function leadOf<T extends { id: string; message_type: string; text_content: string | null; forwarded?: boolean | null; received_at: string; created_at?: string }>(messages: readonly T[]): T {
  const ordered = [...messages].sort((a, b) => sentOrder(a as unknown as MessageRow, b as unknown as MessageRow));
  return (
    ordered.find((entry) => entry.message_type !== "text") ??
    ordered.find((entry) => entry.forwarded) ??
    ordered.reduce((best, entry) => ((entry.text_content?.trim().length ?? 0) > (best.text_content?.trim().length ?? 0) ? entry : best))
  );
}

/** A message and what the person added straight after it, as one piece of content. */
export function withAdded(text: string, added: readonly string[]): string {
  return [text.trim(), ...added.map((note) => `The sender added: ${note}`)].filter(Boolean).join("\n\n");
}

export const QUESTION_REPLY =
  "I can't answer questions on WhatsApp yet. Ask HomeTalk in the app: https://home.wonderapps.biz/ai — and send me things to keep here, like a school notice, a bill, a photo or a grocery list.";

export const UNSUPPORTED_REPLY = "WonderHome can take text, photos, PDFs, text files and voice notes on WhatsApp for now — that one it can't read yet.";

/**
 * What WonderHome says back once a message is in HomeSend. Short, and never
 * an amount, a health detail or a phone number: a bill is "a bill", and the
 * details wait in the app. A school notice or a grocery list may be named,
 * because saying back what was understood is the point. When the item names
 * someone WonderHome can't place, the question is asked here too.
 */
export function acknowledgementFor(outcome: IngestOutcome, options: { whoFor?: readonly string[] } = {}): { text: string; asks: boolean } {
  if (outcome.duplicate) return { text: "Got it — that's already in HomeSend.", asks: false };
  if (outcome.state === "failed") {
    const why = outcome.failureReason ? FAILURE_REASON_COPY[outcome.failureReason] : "WonderHome couldn't read it.";
    return { text: `I kept that. ${why} It's in HomeSend under Failed safely.`, asks: false };
  }
  if (outcome.state === "check_transcript") {
    return { text: "Got it 👍 I'm not sure I heard that voice note right — please check what it says in HomeSend.", asks: false };
  }

  const extracted = outcome.item.extracted;
  const understanding = outcome.item.understanding;
  const question = understanding?.references.find((reference) => reference.candidates.length > 1) ?? null;
  const closing = "It's waiting in HomeSend for you to check.";
  let found: string;
  switch (outcome.item.classifiedKind) {
    case "school_item": {
      const title = shortTitle(extracted?.title);
      found = title ? `I found a school item: *${title}*.` : "I found a school item.";
      break;
    }
    case "grocery_item": {
      const names = [extracted?.title ?? null, ...(extracted?.needs ?? []).map((need) => need.title)]
        .map((name) => shortTitle(name))
        .filter((name): name is string => Boolean(name));
      const unique = [...new Set(names)].slice(0, 5);
      found = unique.length > 0 ? `I found groceries: ${unique.join(", ")}.` : "I found something for the grocery list.";
      break;
    }
    case "bill":
      found = "I found a bill.";
      break;
    case "receipt":
      found = "I found a receipt.";
      break;
    case "health_document":
      found = "I found a health document.";
      break;
    default:
      found = "I kept it, but I couldn't tell what it's about.";
  }
  if (question) {
    const options = question.candidates.slice(0, 3);
    const who = options.length === 2 ? `${options[0]} or ${options[1]}` : `${options.slice(0, -1).join(", ")} or ${options[options.length - 1]}`;
    return { text: `Got it 👍 ${found} I'm not sure whether it's for ${who} — you can choose in HomeSend.`, asks: true };
  }
  const whoFor = options.whoFor ?? [];
  if (whoFor.length >= 2) {
    const choices = `${whoFor.slice(0, -1).join(", ")} or ${whoFor[whoFor.length - 1]}`;
    return { text: `Got it 👍 ${found} Who is it for — ${choices}? Reply with their name.`, asks: true };
  }
  return { text: `Got it 👍 ${found} ${closing}`, asks: false };
}

function shortTitle(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/[*_~`]/g, "").trim();
  if (!trimmed) return null;
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}
