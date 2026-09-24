import type { SupabaseClient } from "@supabase/supabase-js";

import { enqueueClassifyRetry, type ClaimedJob, type JobHandler } from "../homesend/retry-queue";
import { ingestWhatsAppMedia, ingestWhatsAppText, IngestRejected, type IngestDeps, type IngestOutcome } from "../homesend/ingest";
import { FAILURE_REASON_COPY } from "../homesend/items";
import { sendWhatsAppText, type WhatsAppConfig } from "../notifications/whatsapp";
import { log } from "../observability/logger";
import { hitRateLimit } from "../security/rate-limit";
import { recordWhatsAppEvents, type WhatsAppEvent } from "./events";
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
      if (result.outcome === "linked") outcome.linked += 1;
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
  media_filename: string | null;
  received_at: string;
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
      "id, household_id, member_id, provider_message_id, message_type, text_content, media_id, media_mime_type, media_filename, received_at, processing_status, attempts, homesend_item_id, acknowledged_at, identity:whatsapp_identities!whatsapp_messages_identity_id_fkey(phone_number, status)",
    )
    .eq("id", messageId)
    .maybeSingle();
  const row = data as MessageRow | null;
  if (!row || row.processing_status === "processed" || row.processing_status === "ignored") return "skipped";
  if (row.attempts >= MAX_PROCESS_ATTEMPTS) return "skipped";

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

  await settle({ processing_status: "processing", attempts: row.attempts + 1 });

  // Too many from one member in an hour: kept, and picked up again when the
  // job queue retries it — slower, never lost, and nothing is said until it
  // is actually in HomeSend.
  if (row.attempts === 0 && !(await hitRateLimit(admin, "homesend.whatsapp", row.member_id))) {
    events.push({ kind: "rate_limited", householdId: row.household_id });
    await settle({ processing_status: "received" });
    await recordWhatsAppEvents(admin, events);
    return "failed";
  }

  if (row.message_type === "video" || row.message_type === "unsupported") {
    events.push({ kind: "unsupported_type", householdId: row.household_id });
    await settle({ processing_status: "ignored" });
    await say(UNSUPPORTED_REPLY);
    await recordWhatsAppEvents(admin, events);
    return "read";
  }

  const externalId = `whatsapp:${row.provider_message_id}`.slice(0, 200);
  let outcome: IngestOutcome;
  try {
    if (row.message_type === "text") {
      outcome = await ingestWhatsAppText(admin, { householdId: row.household_id, memberId: row.member_id, externalId, text: row.text_content ?? "" }, deps.ingest);
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
          caption: row.text_content,
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
  events.push({ kind: "message_processed", householdId: row.household_id, latencyMs: now.getTime() - new Date(row.received_at).getTime() });
  if (!outcome.duplicate) events.push({ kind: "homesend_created", householdId: row.household_id });
  const ack = acknowledgementFor(outcome);
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

export const UNSUPPORTED_REPLY = "WonderHome can take text, photos, PDFs, text files and voice notes on WhatsApp for now — that one it can't read yet.";

/**
 * What WonderHome says back once a message is in HomeSend. Short, and never
 * an amount, a health detail or a phone number: a bill is "a bill", and the
 * details wait in the app. A school notice or a grocery list may be named,
 * because saying back what was understood is the point. When the item names
 * someone WonderHome can't place, the question is asked here too.
 */
export function acknowledgementFor(outcome: IngestOutcome): { text: string; asks: boolean } {
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
  return { text: `Got it 👍 ${found} ${closing}`, asks: false };
}

function shortTitle(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/[*_~`]/g, "").trim();
  if (!trimmed) return null;
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}
