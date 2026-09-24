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
] as const;
export type WhatsAppEventKind = (typeof WHATSAPP_EVENT_KINDS)[number];

export type WhatsAppEvent = { kind: WhatsAppEventKind; householdId?: string | null; latencyMs?: number | null };

/** Best effort: telemetry never costs a person their message. */
export async function recordWhatsAppEvents(admin: SupabaseClient, events: readonly WhatsAppEvent[]): Promise<void> {
  if (events.length === 0) return;
  const { error } = await admin.from("whatsapp_events").insert(
    events.map((event) => ({
      kind: event.kind,
      household_id: event.householdId ?? null,
      latency_ms: event.latencyMs == null ? null : Math.max(0, Math.min(3_600_000, Math.round(event.latencyMs))),
    })),
  );
  if (error) log.warn("whatsapp events not recorded", { reason: error.code ?? "unknown", allow: ["reason"] });
}
