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
  "not_configured",
] as const;
/**
 * Kinds whose migration may land after the code that writes them
 * (`20261026200000_whatsapp_typing_events.sql`, `20261122180000_whatsapp_not_configured_event.sql`): until it does, a batch that
 * the database refuses is written again without them.
 */
const NEWEST_KINDS: readonly WhatsAppEventKind[] = ["typing_shown", "typing_failed", "not_configured"];
export type WhatsAppEventKind = (typeof WHATSAPP_EVENT_KINDS)[number];

export type WhatsAppEvent = {
  kind: WhatsAppEventKind;
  householdId?: string | null;
  latencyMs?: number | null;
  /** `not_configured` only: the names of the settings that read as unset (never a value). */
  missingSettings?: readonly string[];
  /** `not_configured` only: whether this server had read Platform admin's saved settings. */
  settingsStore?: string;
};

const SETTING_NAME = /^[A-Z][A-Z0-9_]{2,80}$/;

/** Best effort: telemetry never costs a person their message. */
export async function recordWhatsAppEvents(admin: SupabaseClient, events: readonly WhatsAppEvent[]): Promise<void> {
  if (events.length === 0) return;
  const withDetail = events.some((event) => event.missingSettings || event.settingsStore);
  const insert = (batch: readonly WhatsAppEvent[], detail: boolean) =>
    admin.from("whatsapp_events").insert(
      batch.map((event) => ({
        kind: event.kind,
        household_id: event.householdId ?? null,
        latency_ms: event.latencyMs == null ? null : Math.max(0, Math.min(3_600_000, Math.round(event.latencyMs))),
        ...(detail
          ? {
              missing_settings: event.missingSettings ? event.missingSettings.filter((name) => SETTING_NAME.test(name)).slice(0, 20) : null,
              settings_store: event.settingsStore && /^[a-z_]{1,20}$/.test(event.settingsStore) ? event.settingsStore : null,
            }
          : {}),
      })),
    );
  let { error } = await insert(events, withDetail);
  // PGRST204 / 42703: the detail columns' migration is not applied yet; the event itself still counts.
  if (withDetail && (error?.code === "PGRST204" || error?.code === "42703")) ({ error } = await insert(events, false));
  // 23514: the kind check predates the newest kinds; the rest are still worth keeping.
  if (error?.code === "23514") {
    const older = events.filter((event) => !NEWEST_KINDS.includes(event.kind));
    error = older.length > 0 ? (await insert(older, false)).error : null;
  }
  if (error) log.warn("whatsapp events not recorded", { reason: error.code ?? "unknown", allow: ["reason"] });
}
