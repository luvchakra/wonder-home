import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { isLeaveIt } from "../conversation/leave-it";
import { searchWords } from "../commerce/catalog-curated";
import { parseHouseholdSettings, parseMemberChoices, resolvePreferences } from "../i18n/preferences";
import { en } from "../i18n/messages/en";
import { translator, translatorFor, type Translate, type TranslationKey } from "../i18n/translate";
import { openIntakeQuestion } from "../hometalk/intake-questions";
import { enqueueClassifyRetry, type ClaimedJob, type JobHandler } from "../homesend/retry-queue";
import { gateTranscript, TRANSCRIPT_CONFIDENCE_FLOOR, type TranscriptGate } from "../homesend/audio";
import { amountWords, sureClause, type AddedOnItsOwn, type WaitingInHomeSend } from "../homesend/auto-add";
import { hearWhatsAppVoiceNote, ingestWhatsAppMedia, ingestWhatsAppText, IngestRejected, type IngestDeps, type IngestOutcome, type TranscribeResult } from "../homesend/ingest";
import { COMPLETENESS } from "../homesend/completeness";
import { FAILURE_REASON_COPY, type HomeSendKind } from "../homesend/items";
import { contentHash, normalizeText } from "../homesend/normalize";
import { PENDING_STATUSES } from "../homesend/repository";
import { readDetailAnswer } from "../hometalk/detail-answers";
import { sendWhatsAppChoices, sendWhatsAppText, showWhatsAppTyping, type WhatsAppChoice, type WhatsAppConfig } from "../notifications/whatsapp";
import { log } from "../observability/logger";
import { hitRateLimit, hitRateLimitFair } from "../security/rate-limit";
import { recordWhatsAppEvents, type WhatsAppEvent } from "./events";
import { groceryListNames, isForHomeTalk, isQuestionForWonderHome, namesTheSameThing } from "./hometalk";
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
   * (`apps/web/app/_lib/whatsapp-hometalk.ts`). When it must wait for a
   * person, why — if it would otherwise have been added (I-27) — else null.
   * WhatsApp itself never confirms anything: the household decided this in
   * advance (the owner, 2026-10-26).
   */
  addOnItsOwn?: (input: { householdId: string; memberId: string; itemId: string }) => Promise<AddedOnItsOwn | WaitingInHomeSend | null>;
  /** When "typing…" is shown once more while the work is still running; replaceable in tests. */
  typingRefreshMs?: number;
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
      // In the member's own language once the code says who they are (14-051); English for a code that names nobody.
      const t = result.householdId && result.memberId ? await memberWords(admin, result.householdId, result.memberId) : ENGLISH;
      await reply(message.phone, t(`whatsapp.link.${result.outcome}`));
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
  const typing = typingIndicator(deps);
  try {
    return await readMessage(admin, messageId, deps, typing);
  } finally {
    // Done, answered or failed: "typing…" is never shown again after this.
    typing.stop();
  }
}

async function readMessage(admin: SupabaseClient, messageId: string, deps: WhatsAppIntakeDeps, typing: TypingIndicator): Promise<ProcessResult> {
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

  const clock = () => deps.now?.() ?? new Date();
  const now = clock();
  // From WhatsApp's time on the message to this moment: the reply's latency, not the run's start (5.7 s
  // recorded for the owner's voice note of 2026-10-26, 20:19 IST, answered about 27 s after it was sent).
  const elapsed = () => clock().getTime() - new Date(row.received_at).getTime();
  const to = row.identity?.phone_number ?? null;
  const events: WhatsAppEvent[] = [];
  const say = async (text: string) => {
    typing.stop();
    if (!to || row.acknowledged_at) return;
    const sent = await sendWhatsAppText(deps.config, to, text, deps.fetch).catch(() => ({ ok: false as const }));
    events.push({ kind: sent.ok ? "ack_sent" : "ack_failed", householdId: row.household_id });
    if (sent.ok) await admin.from("whatsapp_messages").update({ acknowledged_at: clock().toISOString() }).eq("id", row.id);
  };
  // HomeTalk's words, with the answers its question offers to pick as buttons or a list (principle 20).
  const sayHomeTalk = async (text: string) => {
    typing.stop();
    if (!to || row.acknowledged_at) return;
    const offered = await openChoices(admin, row, clock()).catch(() => null);
    const sent = offered
      ? await sendWhatsAppChoices(deps.config, to, text, offered, (await words())("hometalk.choice.pick"), deps.fetch).catch(() => ({ ok: false as const }))
      : await sendWhatsAppText(deps.config, to, text, deps.fetch).catch(() => ({ ok: false as const }));
    events.push({ kind: sent.ok ? "ack_sent" : "ack_failed", householdId: row.household_id });
    if (sent.ok) await admin.from("whatsapp_messages").update({ acknowledged_at: clock().toISOString() }).eq("id", row.id);
    // HomeTalk's own message is remembered, so a swipe-reply quoting it reaches HomeTalk (rule 2). Apart from the
    // acknowledgement, so a database without the column yet loses only this (2026-10-27).
    if (sent.ok && sent.providerMessageId) await Promise.resolve(admin.from("whatsapp_messages").update({ hometalk_reply_id: sent.providerMessageId }).eq("id", row.id)).catch(() => null);
  };
  // "typing…" while WonderHome works, once per burst, for a message that is still to be answered.
  const showTyping = (providerMessageId: string) => {
    if (to && !row.acknowledged_at) typing.show(providerMessageId, { events, householdId: row.household_id });
  };
  // WonderHome's own words on WhatsApp, in the member's language (14-047); HomeTalk's answers come translated already.
  let wordsRead: Promise<Translate> | null = null;
  const words = () => (wordsRead ??= memberWords(admin, row.household_id, row.member_id));
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
  const sleep = deps.sleep ?? defaultSleep;
  const fresh = row.attempts === 0 && row.processing_status === "received";
  if (fresh) {
    // A short note typed after a message still being read ("for Manan", the owner, 2026-10-26) is
    // that message's to claim: its run waits until the message's longer wait is over, then stops if taken.
    const about = await typedMessageNotedOn(admin, row).catch(() => null);
    // Shown at once, before the wait, by the run of the burst's first message only.
    if (!about && !(await waitsOnEarlierMessage(admin, row).catch(() => false))) showTyping(row.provider_message_id);
    const until = Math.max(new Date(row.received_at).getTime() + BURST_SETTLE_MS, about ? new Date(about.received_at).getTime() + BURST_NOTE_SETTLE_MS + NOTE_DEFER_MARGIN_MS : 0);
    const wait = Math.max(0, until - now.getTime());
    if (wait > 0) await sleep(Math.min(wait, about ? BURST_WINDOW_MS : BURST_SETTLE_MS));
    const claimed = await claimBurst(admin, row);
    if (!claimed) return "skipped";
    row = claimed.lead;
    burst = claimed.rest;
    // The first message's run showed it; this run, which reads the burst, keeps it showing.
    const first = [row, ...burst].sort(sentOrder)[0]!;
    if (!typing.shown && first.id !== found.id && to && !row.acknowledged_at) typing.keep(first.provider_message_id, { events, householdId: row.household_id });
    // The message it waited on was read without it: this one is read on its own, and shows it now.
    else if (about && !typing.shown) showTyping(row.provider_message_id);
    await settle({ attempts: row.attempts + 1 });
  } else {
    await settle({ processing_status: "processing", attempts: row.attempts + 1 });
    showTyping(row.provider_message_id);
  }
  let together = burst.length > 0;
  const settleBurst = async (patch: Record<string, unknown>) => {
    if (together) await admin.from("whatsapp_messages").update(patch).in("id", burst.map((entry) => entry.id));
  };

  // Too many from one member in an hour: kept, and picked up again when the
  // job queue retries it — slower, never lost, and nothing is said until it
  // is actually in HomeSend.
  if (row.attempts === 0 && !(await hitRateLimitFair(admin, "homesend.whatsapp", { memberId: row.member_id, householdId: row.household_id }))) {
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
    await say((await words())("whatsapp.unsupported"));
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
  // A swipe-reply counts only when it quotes HomeTalk's own message: "skip", swiped onto "How much maps link
  // should I add?", failed safely in HomeSend (the owner, 2026-10-27). One quoting anything else keeps rule 8.
  if (!together && row.message_type === "text" && row.text_content && deps.ask && row.text_content.trim().length <= 160 && (await answersHomeTalk(admin, row))) {
    if (await homeTalkAwaitsAnswer(admin, row, now).catch(() => false)) {
      const answer = await deps.ask({ householdId: row.household_id, memberId: row.member_id, text: row.text_content, requestId: row.provider_message_id }).catch(() => null);
      if (answer) {
        events.push({ kind: "clarification_answered", householdId: row.household_id, latencyMs: elapsed() });
        await settle({ processing_status: "ignored" });
        await sayHomeTalk(answer);
        await recordWhatsAppEvents(admin, events);
        return "read";
      }
      // A short reply to the open question is an answer even when HomeTalk couldn't take it: asked again,
      // politely, never kept as a HomeSend item ("skip", 2026-10-27, failed safely as unreadable).
      if (row.text_content.trim().split(/\s+/).length <= NOTE_MAX_WORDS) {
        events.push({ kind: "question_redirected", householdId: row.household_id, latencyMs: elapsed() });
        await settle({ processing_status: "ignored" });
        await say((await words())("whatsapp.answerUnread"));
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
    events.push({ kind: answer ? "question_answered" : "question_redirected", householdId: row.household_id, latencyMs: elapsed() });
    await settle({ processing_status: "ignored" });
    await (answer ? sayHomeTalk(answer) : say((await words())("whatsapp.questionReply")));
    await recordWhatsAppEvents(admin, events);
    return "read";
  }

  // A lone "skip", "never mind" or "no thanks" with no HomeTalk to take it is about nothing to keep: never a
  // HomeSend item (the "skip" that failed safely, 2026-10-27; the same guard as a lone bare detail, #377).
  if (!together && text && isLeaveIt(text)) {
    events.push({ kind: "question_redirected", householdId: row.household_id, latencyMs: elapsed() });
    await settle({ processing_status: "ignored" });
    await say((await words())("whatsapp.leftAlone"));
    await recordWhatsAppEvents(admin, events);
    return "read";
  }

  // A bare shopping list sent on its own ("milk, eggs and bread", design §13.4) is a request to add
  // them: HomeTalk adds them and asks the amounts in one question, never one HomeSend item per need.
  const ask = deps.ask;
  const listed = !together && ask && !row.forwarded && text ? groceryListNames(text) : null;
  if (ask && listed && (await allGroceries(admin, listed))) {
    const answer = await ask({ householdId: row.household_id, memberId: row.member_id, text: `Add ${listed.join(", ")} to the shopping list`, requestId: row.provider_message_id }).catch(() => null);
    if (answer) {
      events.push({ kind: "question_answered", householdId: row.household_id, latencyMs: elapsed() });
      await settle({ processing_status: "ignored" });
      await sayHomeTalk(answer);
      await recordWhatsAppEvents(admin, events);
      return "read";
    }
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
      const sure = gate ? heardForHomeTalk(gate) : null;
      if (sure) {
        const spoken = sure.text;
        const forHomeTalk = deps.ask ? isForHomeTalk(spoken) : isQuestionForWonderHome(spoken);
        const awaited =
          !forHomeTalk && deps.ask && spoken.length <= 160 && (await answersHomeTalk(admin, row)) ? await homeTalkAwaitsAnswer(admin, row, now).catch(() => false) : false;
        if (forHomeTalk || awaited) {
          const answer = deps.ask
            ? await deps.ask({ householdId: row.household_id, memberId: row.member_id, text: spoken, requestId: row.provider_message_id, spoken: { confidence: sure.confidence } }).catch(() => null)
            : null;
          if (answer || forHomeTalk) {
            events.push({ kind: !answer ? "question_redirected" : forHomeTalk ? "question_answered" : "clarification_answered", householdId: row.household_id, latencyMs: elapsed() });
            await settle({ processing_status: "ignored" });
            await (answer ? sayHomeTalk(answer) : say((await words())("whatsapp.questionReply")));
            await recordWhatsAppEvents(admin, events);
            return "read";
          }
        }
      }
    }
  }

  // A typed message for HomeSend waits a little longer for the short note often typed straight after it:
  // "Annual Day rehearsal on Saturday…" then "for Manan", 9 s later (the owner, 2026-10-26), was read
  // alone at 8 s, asked "Who is it for?" and answered twice. The note joins it, read as one.
  if (!together && isTypedMessage(row)) {
    const names = await householdNames(admin, row.household_id).catch(() => [] as string[]);
    if (isNoteEntry(row, names) && isBareDetail(row.text_content ?? "", names)) {
      // A short note that joins nothing, with no question open, isn't content: never a HomeSend item and
      // never Failed safely ("for Manan" alone, 2026-10-26, 21:08 IST). Asked for what it goes with.
      events.push({ kind: "question_redirected", householdId: row.household_id, latencyMs: elapsed() });
      await settle({ processing_status: "ignored" });
      await say((await words())("whatsapp.noteAlone"));
      await recordWhatsAppEvents(admin, events);
      return "read";
    }
    if (fresh) {
      const wait = Math.min(BURST_NOTE_SETTLE_MS - BURST_SETTLE_MS, new Date(row.received_at).getTime() + BURST_NOTE_SETTLE_MS - clock().getTime());
      if (wait > 0) await sleep(wait);
      burst = await claimLateNotes(admin, row, names).catch(() => []);
      together = burst.length > 0;
    }
  }

  // A typed message already on record, with a short note: the note goes onto that item, never a new one
  // (the owner resent the notice, then "for Manan", 2026-10-26, 21:07 IST). One reply either way.
  if (together && isTypedMessage(row) && burst.every((entry) => entry.message_type === "text" && !entry.forwarded)) {
    const onRecord = await itemOnRecord(admin, row.household_id, row.text_content ?? "", now).catch(() => null);
    if (onRecord) {
      const t = await words();
      const noted = onRecord.waiting ? await noteOnItem(admin, row.household_id, onRecord, burst.map((entry) => entry.text_content ?? ""), now).catch(() => null) : null;
      const reply = !onRecord.waiting
        ? t("whatsapp.ack.duplicateHandled")
        : noted?.name
          ? t("whatsapp.ack.duplicateFor", { name: noted.name })
          : noted?.filled
            ? t("whatsapp.ack.duplicateNoted")
            : t("whatsapp.ack.duplicate");
      await settle({ processing_status: "processed", failure_reason: null, homesend_item_id: onRecord.id });
      await settleBurst({ processing_status: "processed", failure_reason: null, homesend_item_id: onRecord.id, acknowledged_at: now.toISOString() });
      events.push({ kind: "message_processed", householdId: row.household_id, latencyMs: elapsed() }, { kind: "duplicate", householdId: row.household_id });
      await say(reply);
      await recordWhatsAppEvents(admin, events);
      return "read";
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
          await say((await words())("whatsapp.tooLarge"));
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
      // In the member's language where the refusal has a closed word (14-051); its English otherwise.
      await say(thrown.code ? (await words())(`whatsapp.rejected.${thrown.code}`) : thrown.message);
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
  events.push({ kind: "message_processed", householdId: row.household_id, latencyMs: elapsed() });
  if (!outcome.duplicate) events.push({ kind: "homesend_created", householdId: row.household_id });
  // What it still lacks is asked by HomeTalk, in this person's WhatsApp
  // conversation with it, one question at a time (`hometalk/intake-questions.ts`,
  // the owner 2026-10-26). HomeSend only says what it found.
  const question =
    deps.ask && !outcome.duplicate && outcome.state === "needs_review"
      ? await openIntakeQuestion(admin, { householdId: row.household_id, memberId: row.member_id, itemId: outcome.itemId, surface: "whatsapp", t: await words() }).catch(() => null)
      : null;
  const t = await words();
  const ack = acknowledgementFor(outcome, { question, t });
  if (ack.asks) events.push({ kind: "clarification_requested", householdId: row.household_id });
  // Nothing left to ask: added now where the household allows it, else the acknowledgement says where it waits.
  const decided =
    !ack.asks && !outcome.duplicate && outcome.state !== "failed" && deps.addOnItsOwn
      ? await deps.addOnItsOwn({ householdId: row.household_id, memberId: row.member_id, itemId: outcome.itemId }).catch(() => null)
      : null;
  // Held for a reason the person can act on: the acknowledgement says which (I-27).
  if (decided && "waiting" in decided) await say(acknowledgementFor(outcome, { t, wait: decided }).text);
  else await (decided ? say(addedReply(decided, undefined, t)) : ack.asks ? sayHomeTalk(ack.text) : say(ack.text));
  await recordWhatsAppEvents(admin, events);
  return "read";
}

/**
 * A voice note heard surely enough to go to HomeTalk. Paying or ordering
 * needs a clearer transcript than an everyday line, but a question only asks:
 * "Show me the to buy shopping cart for groceries" (the owner, 2026-10-26,
 * 20:20 IST) was held to the buying bar for its "buy", at Gemini's 0.8, and
 * filed in HomeSend as "Not sure yet" instead of answered. A spoken question
 * clears the everyday bar; HomeTalk never pays or orders by voice either way.
 */
export function heardForHomeTalk(gate: TranscriptGate): { text: string; confidence: number } | null {
  if (gate.outcome === "confident") return { text: gate.text, confidence: gate.confidence };
  if (gate.outcome === "uncertain" && gate.consequential && gate.confidence >= TRANSCRIPT_CONFIDENCE_FLOOR && isQuestionForWonderHome(gate.text)) {
    return { text: gate.text, confidence: gate.confidence };
  }
  return null;
}

/** WhatsApp clears "typing…" after about 25 seconds; it is shown once more at this point if the work is still running. */
export const TYPING_REFRESH_MS = 20_000;

type TypingIndicator = {
  /** Whether this run asked WhatsApp to show it. */
  readonly shown: boolean;
  /** Shows it now, and once more later if the run is still working. */
  show(providerMessageId: string, record: { events: WhatsAppEvent[]; householdId: string }): void;
  /** Another run showed it: only the later refresh is this run's. */
  keep(providerMessageId: string, record: { events: WhatsAppEvent[]; householdId: string }): void;
  /** The reply is going out, or the run is over: nothing more is shown. */
  stop(): void;
};

/**
 * "typing…" in the person's chat (Meta's typing indicator, which also marks
 * the message read). Never awaited: a slow or failed request never delays the
 * message itself, and its outcome is recorded with the run's events if it has
 * come back by then.
 */
function typingIndicator(deps: WhatsAppIntakeDeps): TypingIndicator {
  let working = true;
  let shown = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const send = (providerMessageId: string, record: { events: WhatsAppEvent[]; householdId: string }) => {
    void showWhatsAppTyping(deps.config, providerMessageId, deps.fetch).then((result) => {
      record.events.push({ kind: result.ok ? "typing_shown" : "typing_failed", householdId: record.householdId });
    });
  };
  const refreshLater = (providerMessageId: string, record: { events: WhatsAppEvent[]; householdId: string }) => {
    if (timer || !working) return;
    timer = setTimeout(() => {
      if (working) send(providerMessageId, record);
    }, deps.typingRefreshMs ?? TYPING_REFRESH_MS);
    (timer as { unref?: () => void }).unref?.();
  };
  return {
    get shown() {
      return shown;
    },
    show(providerMessageId, record) {
      if (shown || !working) return;
      shown = true;
      send(providerMessageId, record);
      refreshLater(providerMessageId, record);
    },
    keep(providerMessageId, record) {
      refreshLater(providerMessageId, record);
    },
    stop() {
      working = false;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

/**
 * Whether a fresh message from the same person, sent just before this one, is
 * still waiting to be read: its run shows "typing…" for both. Pure order, as
 * the burst's own; unsure (a failed read) is no, and shows it.
 */
async function waitsOnEarlierMessage(admin: SupabaseClient, row: MessageRow): Promise<boolean> {
  const at = new Date(row.received_at).getTime();
  const { data, error } = await admin
    .from("whatsapp_messages")
    .select("id, received_at, created_at")
    .eq("household_id", row.household_id)
    .eq("member_id", row.member_id)
    .eq("processing_status", "received")
    .eq("attempts", 0)
    .neq("id", row.id)
    .gte("received_at", new Date(at - BURST_WINDOW_MS).toISOString())
    .lte("received_at", row.received_at)
    .limit(10);
  if (error) return false;
  return ((data ?? []) as MessageRow[]).some((entry) => sentOrder(entry, row) < 0);
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
 * taken back in HomeSend. Never an amount, a health detail or a number
 * (CLAUDE.md, External providers): a health document is "a health record",
 * for nobody named, and a bill's or receipt's title loses its numbers.
 */
export function addedReply(added: AddedOnItsOwn, forName?: string, t: Translate = ENGLISH): string {
  if (added.kind === "health_document") {
    return t("whatsapp.added", { title: t("whatsapp.addedHealthRecord"), where: added.where, sure: t === ENGLISH ? sureClause(added) : sureIn(t, added) });
  }
  const money = added.kind === "bill" || added.kind === "receipt";
  const title = (money ? withoutNumbers(added.title) : shortTitle(added.title)) ?? (money ? t("whatsapp.addedMoneyEntry") : "it");
  const sure = t === ENGLISH ? sureClause(added) : sureIn(t, added);
  // More of a grocery already on the list (I-27): "Added 2 L more *Mustard oil* (now 3 L)".
  if (added.more) return t("whatsapp.addedMore", { amount: amountWords(added.more.added), title, now: amountWords(added.more.now), sure });
  return forName ? t("whatsapp.addedFor", { title, name: forName, where: added.where, sure }) : t("whatsapp.added", { title, where: added.where, sure });
}

const ENGLISH: Translate = translator("en", en);

/** " (97% sure — every detail is in what you sent)", in the member's language. */
function sureIn(t: Translate, added: AddedOnItsOwn): string {
  if (typeof added.percent !== "number") return "";
  const why = added.why ? ` — ${t(`homesend.found.why.${added.why}`)}` : "";
  return ` (${t("homesend.found.percentSure", { percent: added.percent })}${why})`;
}

/** The member's language for WonderHome's own words (their choice, else the household's); English when it can't be read. */
async function memberWords(admin: SupabaseClient, householdId: string, memberId: string): Promise<Translate> {
  try {
    const [{ data: household }, { data: member }] = await Promise.all([
      admin.from("households").select("region, currency, timezone, measurement_system, default_language").eq("id", householdId).maybeSingle(),
      admin.from("household_members").select("language, date_format, time_format, measurement_system").eq("id", memberId).maybeSingle(),
    ]);
    const home = (household ?? {}) as Record<string, unknown>;
    const preferences = resolvePreferences(parseMemberChoices((member ?? {}) as Record<string, unknown>), parseHouseholdSettings({ ...home, language: home.default_language }));
    return await translatorFor(preferences.language);
  } catch {
    return ENGLISH;
  }
}

/** Whether every name is an everyday item in the grocery catalog, by whole words. Unsure (or a failed read) is no. */
async function allGroceries(admin: SupabaseClient, names: readonly string[]): Promise<boolean> {
  try {
    const found = await Promise.all(
      names.map(async (name) => {
        const { data, error } = await admin.rpc("search_grocery_catalog_kind", { p_query: searchWords(name), p_limit: 5, p_kind: "item" });
        if (error) return false;
        return ((data ?? []) as { name?: string }[]).some((entry) => typeof entry.name === "string" && namesTheSameThing(name, entry.name));
      }),
    );
    return found.every(Boolean);
  } catch {
    return false;
  }
}

/** How long a question HomeTalk asked on WhatsApp still takes the person's next message as its answer. */
const HOMETALK_ANSWER_WINDOW_MS = 15 * 60 * 1000;

/**
 * The answers HomeTalk's last reply on WhatsApp offers to pick, when it asked
 * one just now (`metadata.choices`, `hometalk/choices.ts`). Never a health
 * record's: those stay words, so nothing about one sits in a button.
 */
async function openChoices(admin: SupabaseClient, row: Pick<MessageRow, "household_id" | "member_id">, now: Date): Promise<WhatsAppChoice[] | null> {
  const { data: session } = await admin
    .from("conversation_sessions")
    .select("id")
    .eq("household_id", row.household_id)
    .eq("member_id", row.member_id)
    .eq("surface", "whatsapp")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1);
  const sessionId = ((session ?? []) as { id: string }[])[0]?.id;
  if (!sessionId) return null;
  const { data } = await admin
    .from("conversation_messages")
    .select("role, metadata")
    .eq("household_id", row.household_id)
    .eq("session_id", sessionId)
    .gte("created_at", new Date(now.getTime() - 2 * 60_000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1);
  const latest = ((data ?? []) as { role: string; metadata: Record<string, unknown> | null }[])[0];
  const offered = latest?.role === "assistant" ? (latest.metadata?.choices as { mode?: unknown; choices?: unknown; also?: unknown; health?: unknown } | undefined) : undefined;
  if (!offered || offered.health === true) return null;
  const read = (value: unknown): WhatsAppChoice[] =>
    (Array.isArray(value) ? value : []).flatMap((entry) => {
      const choice = entry as { label?: unknown; say?: unknown } | null;
      return choice && typeof choice.label === "string" && (typeof choice.say === "string" || choice.say === null) ? [{ label: choice.label, say: choice.say }] : [];
    });
  // WhatsApp has no checkboxes: each of a multi set is its own pick there, and "Not now" beside them.
  const choices = [...read(offered.choices), ...read(offered.also)];
  return choices.length > 0 ? choices : null;
}

/**
 * Whether the last thing said in this person's WhatsApp conversation with
 * HomeTalk is a question still waiting for them — HomeTalk asked which one
 * or whether, and nothing else has happened since — and their last WhatsApp
 * message before this one went to HomeTalk, not to HomeSend.
 */
/**
 * Whether a message can be an answer to HomeTalk: not a swipe-reply, or a swipe-reply quoting a message
 * HomeTalk sent this member (`hometalk_reply_id`). Unreadable (the column not there yet) is "no", as before.
 */
async function answersHomeTalk(admin: SupabaseClient, row: Pick<MessageRow, "household_id" | "member_id" | "reply_to_provider_message_id">): Promise<boolean> {
  if (!row.reply_to_provider_message_id) return true;
  const { data, error } = await Promise.resolve(
    admin
      .from("whatsapp_messages")
      .select("id")
      .eq("household_id", row.household_id)
      .eq("member_id", row.member_id)
      .eq("hometalk_reply_id", row.reply_to_provider_message_id)
      .limit(1),
  ).catch(() => ({ data: null, error: true }));
  return !error && Array.isArray(data) && data.length > 0;
}

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
  // A voice note HomeTalk answered went to HomeTalk too ("ignored": nothing kept in HomeSend).
  return !last.homesend_item_id && (last.message_type === "text" || (last.message_type === "audio" && last.processing_status === "ignored"));
}

/** How close together messages must be to be read as one: a forward and the note typed straight after it. */
export const BURST_WINDOW_MS = 30_000;
/** How long a fresh message waits for the rest of its burst before it is read. */
export const BURST_SETTLE_MS = 8_000;
/** How long a typed message for HomeSend waits, in all, for a short note typed after it (9 s on 2026-10-26, 11 s to arrive). */
export const BURST_NOTE_SETTLE_MS = 15_000;
/** How much longer a short note's own run waits than the message it is about, so that message's run claims it. */
const NOTE_DEFER_MARGIN_MS = 2_000;

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
  let joined = files <= 1 ? others : [];
  // Typed messages alone, with no forward, photo or file: only a short note joins the one message it is
  // about. Two requests or questions ("add milk", "what's for dinner?") are each their own.
  if (joined.length > 0 && ![row, ...joined].some((entry) => entry.message_type !== "text" || entry.forwarded)) {
    const group = typedBurstOf([row, ...joined], await householdNames(admin, row.household_id).catch(() => [] as string[]));
    joined = group.some((entry) => entry.id === row.id) ? group.filter((entry) => entry.id !== row.id) : [];
  }
  const ids = [row.id, ...joined.map((entry) => entry.id)];
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

/**
 * Short notes sent after this typed message, within the window, that no run
 * has taken yet: claimed in one update, as `claimBurst` does. Empty when there
 * are none, or another run took them first.
 */
async function claimLateNotes(admin: SupabaseClient, row: MessageRow, names: readonly string[]): Promise<MessageRow[]> {
  const at = new Date(row.received_at).getTime();
  const { data } = await admin
    .from("whatsapp_messages")
    .select(MESSAGE_COLUMNS)
    .eq("household_id", row.household_id)
    .eq("member_id", row.member_id)
    .eq("processing_status", "received")
    .eq("attempts", 0)
    .neq("id", row.id)
    .gte("received_at", row.received_at)
    .lte("received_at", new Date(at + BURST_WINDOW_MS).toISOString())
    .limit(10);
  // Sent the same second or after: WhatsApp stamps to the second and may deliver the note first.
  const notes = ((data ?? []) as MessageRow[]).filter((entry) => isNoteEntry(entry, names));
  if (notes.length === 0) return [];
  const { data: claimed } = await admin
    .from("whatsapp_messages")
    .update({ processing_status: "processing" })
    .in("id", notes.map((entry) => entry.id))
    .eq("processing_status", "received")
    .select(MESSAGE_COLUMNS);
  return ((claimed ?? []) as MessageRow[]).sort(sentOrder);
}

/**
 * The typed message, sent just before this one and not yet answered, that
 * this short note is about: its run claims the note after its longer wait.
 * Null when this isn't a short note, or there is no such message.
 */
async function typedMessageNotedOn(admin: SupabaseClient, row: MessageRow): Promise<MessageRow | null> {
  // Cheap first: only a short typed line can be a note, before anything is read.
  const text = row.message_type === "text" && !row.forwarded ? (row.text_content ?? "").trim() : "";
  if (!text || text.split(/\s+/).length > NOTE_MAX_WORDS || row.reply_to_provider_message_id) return null;
  const at = new Date(row.received_at).getTime();
  const { data } = await admin
    .from("whatsapp_messages")
    .select(MESSAGE_COLUMNS)
    .eq("household_id", row.household_id)
    .eq("member_id", row.member_id)
    .in("processing_status", ["received", "processing"])
    .neq("id", row.id)
    .gte("received_at", new Date(at - BURST_WINDOW_MS).toISOString())
    .lte("received_at", row.received_at)
    .limit(10);
  const earlier = ((data ?? []) as MessageRow[]).filter((entry) => !entry.acknowledged_at && !entry.homesend_item_id && isTypedMessage(entry));
  if (earlier.length === 0) return null;
  const names = await householdNames(admin, row.household_id);
  if (!isNoteEntry(row, names)) return null;
  return earlier.filter((entry) => !isNoteEntry(entry, names)).sort(sentOrder).at(-1) ?? null;
}

type ItemOnRecord = { id: string; waiting: boolean; classified_kind: HomeSendKind | null; extracted: Record<string, unknown> | null; understanding: Record<string, unknown> | null };

/** How long an item already added or dismissed still counts as the one a resent message is about. */
const HANDLED_RECENTLY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The item this typed message already made, by the same content hash HomeSend's
 * own duplicate check uses: still waiting, or added or dismissed in the last
 * week. Null for anything else (a failed one is read again, as HomeSend does).
 */
async function itemOnRecord(admin: SupabaseClient, householdId: string, text: string, now: Date): Promise<ItemOnRecord | null> {
  const normalized = normalizeText(text);
  if (!normalized) return null;
  const { data } = await admin
    .from("home_send_items")
    .select("id, status, classified_kind, extracted, understanding, created_at")
    .eq("household_id", householdId)
    .eq("content_hash", await contentHash(normalized))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const item = data as (Omit<ItemOnRecord, "waiting"> & { status: string; created_at: string }) | null;
  if (!item) return null;
  if ((PENDING_STATUSES as readonly string[]).includes(item.status)) return { ...item, waiting: true };
  const handled = ["routed", "dismissed", "undone"].includes(item.status) && now.getTime() - new Date(item.created_at).getTime() <= HANDLED_RECENTLY_MS;
  return handled ? { ...item, waiting: false } : null;
}

/**
 * Puts short notes onto an item still waiting in HomeSend: who it is for (one
 * member the note names), and a day, time or amount the item's kind asks for,
 * read as an answer to HomeTalk's question would be. Nothing reaches a domain table.
 */
async function noteOnItem(admin: SupabaseClient, householdId: string, item: ItemOnRecord, notes: readonly string[], now: Date): Promise<{ name: string | null; filled: boolean } | null> {
  const [{ data: members }, { data: settings }] = await Promise.all([
    admin.from("household_members").select("id, display_name, nickname").eq("household_id", householdId).eq("status", "active").limit(50),
    admin.from("households").select("timezone").eq("id", householdId).maybeSingle(),
  ]);
  const timezone = (settings as { timezone?: string | null } | null)?.timezone ?? "Asia/Kolkata";
  const people = ((members ?? []) as { display_name: string; nickname: string | null }[]).filter((member) => member.display_name);
  const kind = item.classified_kind && item.classified_kind in COMPLETENESS ? (item.classified_kind as keyof typeof COMPLETENESS) : null;
  let patch: Record<string, unknown> = {};
  let name: string | null = null;
  for (const note of notes) {
    const said = new Set(note.toLowerCase().split(/\s+/).map((word) => word.replace(/['’]s$/, "").replace(/[^\p{L}]/gu, "")));
    const named = people.filter((member) => [member.display_name.split(/\s+/)[0] ?? "", member.nickname ?? ""].some((word) => word.length >= 2 && said.has(word.toLowerCase())));
    if (named.length === 1) name = named[0]!.display_name;
    if (!kind) continue;
    for (const spec of COMPLETENESS[kind]) {
      if (spec.answer !== "date" && spec.answer !== "time" && spec.answer !== "quantity" && spec.answer !== "amount") continue;
      const read = readDetailAnswer(kind, spec.field, note, { timezone, now });
      if (read && read !== "skip") patch = { ...patch, ...read };
    }
  }
  if (name) patch = { ...patch, subjectMemberName: name, people: [name] };
  if (Object.keys(patch).length === 0) return { name: null, filled: false };
  // The review reads who an item is for from its understanding's references (`homesend/resolve.ts`), as an answer to HomeTalk does.
  const understanding = name && item.understanding ? { ...item.understanding, references: [{ text: name, candidates: [], confidence: 0 }] } : item.understanding;
  const { data: updated } = await admin
    .from("home_send_items")
    .update({ extracted: { ...(item.extracted ?? {}), ...patch }, ...(understanding !== item.understanding ? { understanding } : {}) })
    .eq("household_id", householdId)
    .eq("id", item.id)
    .eq("status", "classified")
    .select("id");
  return ((updated ?? []) as unknown[]).length > 0 ? { name, filled: true } : { name: null, filled: false };
}

/** The household's first names and nicknames, as a note would say them ("for Manan"). */
async function householdNames(admin: SupabaseClient, householdId: string): Promise<string[]> {
  const { data } = await admin.from("household_members").select("display_name, nickname").eq("household_id", householdId).eq("status", "active").limit(50);
  return ((data ?? []) as { display_name: string | null; nickname: string | null }[]).flatMap((member) => [member.display_name?.trim().split(/\s+/)[0] ?? "", member.nickname?.trim() ?? ""]).filter(Boolean);
}

/** A typed message of the person's own that HomeSend may keep: not a forward, a quoted reply, a question, a request or a bare list. */
function isTypedMessage(entry: Pick<MessageRow, "message_type" | "forwarded" | "text_content" | "reply_to_provider_message_id">): boolean {
  const text = entry.message_type === "text" && !entry.forwarded ? (entry.text_content ?? "").trim() : "";
  return Boolean(text) && !entry.reply_to_provider_message_id && !isForHomeTalk(text) && !groceryListNames(text);
}

function isNoteEntry(entry: Pick<MessageRow, "message_type" | "forwarded" | "text_content" | "reply_to_provider_message_id">, names: readonly string[]): boolean {
  return entry.message_type === "text" && !entry.forwarded && !entry.reply_to_provider_message_id && isShortNote(entry.text_content ?? "", names);
}

/** The longest a note on the message before it is ("it's for Asmi on Sunday"). */
const NOTE_MAX_WORDS = 6;
const NOTE_DAY_OR_TIME =
  /\b(?:today|tonight|tomorrow|tmrw|yesterday|morning|afternoon|evening|night|noon|midnight|weekend|week|month|due|am|pm|(?:mon|tues?|wed(?:nes)?|thu(?:rs?)?|fri|sat(?:ur)?|sun)(?:day)?|jan(?:uary)?|feb(?:ruary)?|april|apr|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
const NOTE_AMOUNT = /\d|\b(?:litres?|liters?|kgs?|grams?|ml|dozen|packets?|packs?|pieces?|pcs|bottles?|boxes?)\b/i;

/**
 * A short note on the message sent just before it: up to six words naming a
 * household member, a day or time, or an amount, with no request or question
 * of its own ("for Manan", "Asmi Sunday", "due Friday", "2 litres"). Pure.
 */
export function isShortNote(text: string, names: readonly string[]): boolean {
  const line = text.trim();
  if (!line || /\n/.test(line) || line.includes("?") || isForHomeTalk(line)) return false;
  const words = line.split(/\s+/);
  if (words.length > NOTE_MAX_WORDS) return false;
  const said = new Set(words.map((word) => word.toLowerCase().replace(/['’]s$/, "").replace(/[^\p{L}]/gu, "")));
  const names_ = names.map((name) => name.toLowerCase()).filter((name) => name.length >= 2);
  return names_.some((name) => said.has(name)) || NOTE_DAY_OR_TIME.test(line) || NOTE_AMOUNT.test(line);
}

const NOTE_FILLER = /^(?:for|it|its|it's|is|this|that|that's|on|at|by|the|a|an|and|&|next|of|to|in)$/i;

/**
 * Whether a short note says nothing but who, when or how much ("for Manan",
 * "Asmi Sunday", "due Friday"): alone, it is about something not sent, never
 * content of its own ("2 litres mustard oil" is content). Pure.
 */
export function isBareDetail(text: string, names: readonly string[]): boolean {
  if (!isShortNote(text, names)) return false;
  const known = new Set(names.map((name) => name.toLowerCase()));
  return text
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/['’]s$/, "").replace(/[.,!]+$/, ""))
    .filter(Boolean)
    .every((word) => NOTE_FILLER.test(word) || known.has(word.toLowerCase()) || NOTE_DAY_OR_TIME.test(word) || NOTE_AMOUNT.test(word));
}

/**
 * Of typed messages sent together (no forward, photo or file), the ones read
 * as one: the single message that isn't a short note, with the short notes
 * sent after it. Empty when there is no such message, or more than one, or it
 * is a request or a question of its own. Pure.
 */
export function typedBurstOf<T extends Pick<MessageRow, "id" | "message_type" | "forwarded" | "text_content" | "reply_to_provider_message_id" | "received_at" | "created_at">>(entries: readonly T[], names: readonly string[]): T[] {
  const notes = entries.filter((entry) => isNoteEntry(entry, names));
  const others = entries.filter((entry) => !notes.includes(entry));
  if (others.length !== 1 || !isTypedMessage(others[0]!)) return [];
  const message = others[0]!;
  // Sent the same second or after: WhatsApp stamps to the second and may deliver the note first.
  const after = notes.filter((entry) => entry.received_at >= message.received_at);
  return after.length > 0 ? [message, ...after] : [];
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

export const QUESTION_REPLY = en["whatsapp.questionReply"];

export const UNSUPPORTED_REPLY = en["whatsapp.unsupported"];

/**
 * What WonderHome says back once a message is in HomeSend. Short, and never
 * an amount, a health detail or a phone number: a bill is "a bill", and the
 * details wait in the app. A school notice or a grocery list may be named,
 * because saying back what was understood is the point.
 * HomeTalk's question about what it still lacks follows, when there is one.
 */
export function acknowledgementFor(
  outcome: IngestOutcome,
  options: { question?: string | null; t?: Translate; wait?: WaitingInHomeSend | null } = {},
): { text: string; asks: boolean } {
  const t = options.t ?? ENGLISH;
  if (outcome.duplicate) return { text: t("whatsapp.ack.duplicate"), asks: false };
  if (outcome.state === "failed") {
    const reason = outcome.failureReason;
    const why = reason ? t(`homesend.failure.${reason.replace(/_(\w)/g, (_, letter: string) => letter.toUpperCase())}` as TranslationKey) || FAILURE_REASON_COPY[reason] : t("whatsapp.ack.unreadable");
    return { text: t("whatsapp.ack.failed", { why }), asks: false };
  }
  if (outcome.state === "check_transcript") return { text: t("whatsapp.ack.checkTranscript"), asks: false };

  const extracted = outcome.item.extracted;
  const titled = (plain: TranslationKey, withTitle: TranslationKey) => {
    const title = shortTitle(extracted?.title);
    return title ? t(withTitle, { title }) : t(plain);
  };
  let found: string;
  switch (outcome.item.classifiedKind) {
    case "school_item":
      found = titled("whatsapp.found.school", "whatsapp.found.schoolTitled");
      break;
    case "activity_item":
      found = titled("whatsapp.found.activity", "whatsapp.found.activityTitled");
      break;
    case "event":
      found = titled("whatsapp.found.event", "whatsapp.found.eventTitled");
      break;
    case "grocery_item": {
      const names = [extracted?.title ?? null, ...(extracted?.needs ?? []).map((need) => need.title)]
        .map((name) => shortTitle(name))
        .filter((name): name is string => Boolean(name));
      const unique = [...new Set(names)].slice(0, 5);
      found = unique.length > 0 ? t("whatsapp.found.groceries", { names: unique.join(", ") }) : t("whatsapp.found.grocery");
      break;
    }
    case "bill":
      found = t("whatsapp.found.bill");
      break;
    case "receipt":
      found = t("whatsapp.found.receipt");
      break;
    case "health_document":
      found = t("whatsapp.found.health");
      break;
    default:
      found = t("whatsapp.found.unknown");
  }
  // HomeTalk's question about it, worded by HomeTalk (`hometalk/intake-questions.ts`), follows what was found.
  if (options.question) return { text: `${t("whatsapp.ack.gotIt")} ${found} ${options.question}`, asks: true };
  // Something that would have been added on its own says why it waits, never with an amount (I-27).
  const wait = options.wait?.waiting;
  if (wait && (wait.listed || wait.reason === "on_list")) {
    return { text: `${t("whatsapp.ack.gotIt")} ${t("whatsapp.wait.onList", { title: shortTitle(options.wait!.title) ?? "" })}`, asks: false };
  }
  if (wait?.reason === "wait_for_approval") return { text: `${t("whatsapp.ack.gotIt")} ${found} ${t(wait.area === "school" ? "whatsapp.wait.approvalSchool" : "whatsapp.wait.approvalGroceries")}`, asks: false };
  if (wait?.reason === "below_bar") return { text: `${t("whatsapp.ack.gotIt")} ${found} ${t("whatsapp.wait.belowBar", { percent: wait.percent ?? 95 })}`, asks: false };
  return { text: `${t("whatsapp.ack.gotIt")} ${found} ${t("whatsapp.ack.waiting")}`, asks: false };
}

/** A title with no digits or currency signs left in it, for a money entry's reply. */
function withoutNumbers(value: string | null | undefined): string | null {
  return shortTitle(value?.replace(/[\p{Sc}\d][\p{Sc}\d.,:/-]*/gu, " ").replace(/\s+/g, " "));
}

function shortTitle(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/[*_~`]/g, "").trim();
  if (!trimmed) return null;
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}
