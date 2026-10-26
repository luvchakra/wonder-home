import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { openIntakeQuestion } from "../hometalk/intake-questions";
import { enqueueClassifyRetry, type ClaimedJob, type JobHandler } from "../homesend/retry-queue";
import { gateTranscript } from "../homesend/audio";
import { hearWhatsAppVoiceNote, ingestWhatsAppMedia, ingestWhatsAppText, IngestRejected, type IngestDeps, type IngestOutcome, type TranscribeResult } from "../homesend/ingest";
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
  ask?: (input: { householdId: string; memberId: string; text: string; requestId: string; spoken?: { confidence: number } }) => Promise<string | null>;
  /** Waiting for what the person sends straight after; replaceable in tests. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Adds an item on its own where the household allows it (the outcome is
   * "Pre Approved" and the reading is above its bar), under the member's own
   * session, through the same governed write the app uses
   * (`apps/web/app/_lib/whatsapp-hometalk.ts`). Null when it must wait for a
   * person. WhatsApp itself never confirms anything: the household decided
   * this in advance (the owner, 2026-10-26).
   */
  addOnItsOwn?: (input: { householdId: string; memberId: string; itemId: string }) => Promise<{ title: string; where: string } | null>;
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

  // An answer to the question HomeTalk just asked on WhatsApp ("Should I use
  // coconut oil, mustard oil or sunflower oil?" — "coconut oil", the owner,
  // 2026-10-26) goes back to HomeTalk, which finishes what was asked. Before
  // this it became a new HomeSend item, without the 2 litres and waiting.
  // HomeTalk's questions about something just sent ("When is it due?",
  // "Who is it for — Asmi or Manan?") are answered the same way: HomeTalk
  // asks every question, and the answer goes back onto the item.
  if (!together && row.message_type === "text" && row.text_content && deps.ask && !row.reply_to_provider_message_id && row.text_content.trim().length <= 160) {
    if (await homeTalkAwaitsAnswer(admin, row, now).catch(() => false)) {
      const answer = await deps.ask({ householdId: row.household_id, memberId: row.member_id, text: row.text_content, requestId: row.provider_message_id }).catch(() => null);
      if (answer) {
        events.push({ kind: "question_answered", householdId: row.household_id });
        await settle({ processing_status: "ignored" });
        await say(answer);
        await recordWhatsAppEvents(admin, events);
        return "read";
      }
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

  // A voice note is written down first, then read exactly like a typed
  // message (the owner, 2026-10-26: "What are upcoming events", spoken, ended
  // in Failed safely). A spoken question, request or answer goes to HomeTalk
  // as speech, under the same WhatsApp scopes, so paying and ordering stay
  // out; nothing is kept in HomeSend. Only a transcript heard surely enough
  // goes there: an unsure one is checked in HomeSend as before, and a note
  // read aloud stays HomeSend content, heard once.
  const download = deps.download ?? ((id: string) => downloadWhatsAppMedia(deps.config, id, { fetch: deps.fetch }));
  let voiceFile: MediaDownload | null = null;
  let heard: TranscribeResult | null = null;
  if (!together && row.message_type === "audio") {
    voiceFile = await download(row.media_id ?? "").catch(() => null);
    if (voiceFile?.ok) {
      heard = await hearWhatsAppVoiceNote(
        admin,
        row.household_id,
        { bytes: voiceFile.bytes, claimedType: row.media_mime_type ?? voiceFile.mimeType ?? "application/octet-stream", filename: row.media_filename },
        deps.ingest,
      );
      const gate = heard?.status === "transcribed" ? gateTranscript(heard) : null;
      if (gate?.outcome === "confident") {
        const spoken = gate.text;
        const forHomeTalk = deps.ask ? isForHomeTalk(spoken) : isQuestionForWonderHome(spoken);
        const awaited =
          !forHomeTalk && deps.ask && !row.reply_to_provider_message_id && spoken.length <= 160 ? await homeTalkAwaitsAnswer(admin, row, now).catch(() => false) : false;
        if (forHomeTalk || awaited) {
          const answer = deps.ask
            ? await deps.ask({ householdId: row.household_id, memberId: row.member_id, text: spoken, requestId: row.provider_message_id, spoken: { confidence: gate.confidence } }).catch(() => null)
            : null;
          if (answer || forHomeTalk) {
            events.push({ kind: answer ? "question_answered" : "question_redirected", householdId: row.household_id });
            await settle({ processing_status: "ignored" });
            await say(answer ?? QUESTION_REPLY);
            await recordWhatsAppEvents(admin, events);
            return "read";
          }
        }
      }
    }
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
      const file = voiceFile ?? (await download(row.media_id ?? ""));
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
        // Already written down above: heard once, never twice.
        heard ? { ...deps.ingest, transcribe: async () => heard } : deps.ingest,
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
  // What it still lacks is asked by HomeTalk, in this person's WhatsApp
  // conversation with it, one question at a time (`hometalk/intake-questions.ts`,
  // the owner 2026-10-26). HomeSend only says what it found.
  const question =
    deps.ask && !outcome.duplicate && outcome.state === "needs_review"
      ? await openIntakeQuestion(admin, { householdId: row.household_id, memberId: row.member_id, itemId: outcome.itemId, surface: "whatsapp" }).catch(() => null)
      : null;
  const ack = acknowledgementFor(outcome, { question });
  if (ack.asks) events.push({ kind: "clarification_requested", householdId: row.household_id });
  // Nothing left to ask: added now where the household allows it, else the acknowledgement says where it waits.
  const added =
    !ack.asks && !outcome.duplicate && outcome.state !== "failed" && deps.addOnItsOwn
      ? await deps.addOnItsOwn({ householdId: row.household_id, memberId: row.member_id, itemId: outcome.itemId }).catch(() => null)
      : null;
  await say(added ? addedReply(added) : ack.text);
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
 * Said when an item was added on its own: what, where, and that it can be
 * taken back in HomeSend. Never an amount or a health detail, which are never
 * added on their own anyway.
 */
export function addedReply(added: { title: string; where: string }, forName?: string): string {
  const title = shortTitle(added.title) ?? "it";
  return `Added *${title}*${forName ? ` for ${forName}` : ""} to ${added.where} — your household lets WonderHome add these on its own. You can undo it in HomeSend.`;
}

/** How long a question HomeTalk asked on WhatsApp still takes the person's next message as its answer. */
const HOMETALK_ANSWER_WINDOW_MS = 15 * 60 * 1000;

/**
 * Whether the last thing said in this person's WhatsApp conversation with
 * HomeTalk is a question still waiting for them — HomeTalk asked which one
 * or whether, and nothing else has happened since — and their last WhatsApp
 * message before this one went to HomeTalk, not to HomeSend.
 */
export async function homeTalkAwaitsAnswer(admin: SupabaseClient, row: Pick<MessageRow, "id" | "household_id" | "member_id">, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - HOMETALK_ANSWER_WINDOW_MS).toISOString();
  const [{ data: previous }, { data: session }] = await Promise.all([
    admin
      .from("whatsapp_messages")
      .select("homesend_item_id, processing_status, message_type")
      .eq("household_id", row.household_id)
      .eq("member_id", row.member_id)
      .neq("id", row.id)
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(1),
    admin
      .from("conversation_sessions")
      .select("id")
      .eq("household_id", row.household_id)
      .eq("member_id", row.member_id)
      .eq("surface", "whatsapp")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const last = ((previous ?? []) as { homesend_item_id: string | null; processing_status: string; message_type: string }[])[0];
  if (!last) return false;
  const sessionId = ((session ?? []) as { id: string }[])[0]?.id;
  if (!sessionId) return false;
  const { data: said } = await admin
    .from("conversation_messages")
    .select("role, metadata, created_at")
    .eq("household_id", row.household_id)
    .eq("session_id", sessionId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  const latest = ((said ?? []) as { role: string; metadata: { mode?: unknown; proposal?: unknown; clarify?: { action?: unknown; parameters?: { itemId?: unknown } } } | null }[])[0];
  if (latest?.role !== "assistant" || (latest.metadata?.mode !== "clarify" && latest.metadata?.proposal !== "clarify")) return false;
  // HomeTalk's question about what was just sent waits for this reply; any
  // other open question only when the last message went to HomeTalk too, not
  // to HomeSend (a fresh forward is never an answer to an older question).
  const about = latest.metadata?.clarify?.action === "complete_homesend_item" ? latest.metadata.clarify.parameters?.itemId : null;
  if (about) return last.homesend_item_id === about;
  return !last.homesend_item_id && last.message_type === "text";
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
 * because saying back what was understood is the point.
 * HomeTalk's question about what it still lacks follows, when there is one.
 */
export function acknowledgementFor(outcome: IngestOutcome, options: { question?: string | null } = {}): { text: string; asks: boolean } {
  if (outcome.duplicate) return { text: "Got it — that's already in HomeSend.", asks: false };
  if (outcome.state === "failed") {
    const why = outcome.failureReason ? FAILURE_REASON_COPY[outcome.failureReason] : "WonderHome couldn't read it.";
    return { text: `I kept that. ${why} It's in HomeSend under Failed safely.`, asks: false };
  }
  if (outcome.state === "check_transcript") {
    return { text: "Got it 👍 I'm not sure I heard that voice note right — please check what it says in HomeSend.", asks: false };
  }

  const extracted = outcome.item.extracted;
  const closing = "It's waiting in HomeSend for you to check.";
  let found: string;
  switch (outcome.item.classifiedKind) {
    case "school_item": {
      const title = shortTitle(extracted?.title);
      found = title ? `I found a school item: *${title}*.` : "I found a school item.";
      break;
    }
    case "activity_item": {
      const title = shortTitle(extracted?.title);
      found = title ? `I found something for a class outside school: *${title}*.` : "I found something for a class outside school.";
      break;
    }
    case "event": {
      const title = shortTitle(extracted?.title);
      found = title ? `I found an event: *${title}*.` : "I found an event.";
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
  // HomeTalk's question about it, worded by HomeTalk (`hometalk/intake-questions.ts`), follows what was found.
  if (options.question) return { text: `Got it 👍 ${found} ${options.question}`, asks: true };
  return { text: `Got it 👍 ${found} ${closing}`, asks: false };
}

function shortTitle(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/[*_~`]/g, "").trim();
  if (!trimmed) return null;
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}
