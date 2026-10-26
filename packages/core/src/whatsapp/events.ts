import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";

/**
 * What WhatsApp intake did, in closed words and counts (the WhatsApp HomeSend
 * spec §21) — never a number, a name or a word of what anyone sent.
 */
export const WHATSAPP_EVENT_KINDS = [
  "connection_started",
  "connection_completed",
  "connection_failed",
  "disconnected",
  "message_received",
  "media_received",
  "message_processed",
  "message_failed",
  "homesend_created",
  "clarification_requested",
  "ack_sent",
  "ack_failed",
  "duplicate",
  "unknown_sender",
  "unsupported_type",
  "signature_failed",
  "rate_limited",
  "retry_queued",
  "question_redirected",
  "question_answered",
  "clarification_answered",
  "typing_shown",
  "typing_failed",
] as const;
/**
 * Kinds whose migration may land after the code that writes them
 * (`20261026200000_whatsapp_typing_events.sql`): until it does, a batch that
 * the database refuses is written again without them.
 */
const NEWEST_KINDS: readonly WhatsAppEventKind[] = ["typing_shown", "typing_failed"];
export type WhatsAppEventKind = (typeof WHATSAPP_EVENT_KINDS)[number];

export type WhatsAppEvent = { kind: WhatsAppEventKind; householdId?: string | null; latencyMs?: number | null };

/** Best effort: telemetry never costs a person their message. */
export async function recordWhatsAppEvents(admin: SupabaseClient, events: readonly WhatsAppEvent[]): Promise<void> {
  if (events.length === 0) return;
  const insert = (batch: readonly WhatsAppEvent[]) =>
    admin.from("whatsapp_events").insert(
      batch.map((event) => ({
        kind: event.kind,
        household_id: event.householdId ?? null,
        latency_ms: event.latencyMs == null ? null : Math.max(0, Math.min(3_600_000, Math.round(event.latencyMs))),
      })),
    );
  let { error } = await insert(events);
  // 23514: the kind check predates the newest kinds; the rest are still worth keeping.
  if (error?.code === "23514") {
    const older = events.filter((event) => !NEWEST_KINDS.includes(event.kind));
    error = older.length > 0 ? (await insert(older)).error : null;
  }
  if (error) log.warn("whatsapp events not recorded", { reason: error.code ?? "unknown", allow: ["reason"] });
}
