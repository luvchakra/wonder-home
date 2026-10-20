import type { SupabaseClient } from "@supabase/supabase-js";

import { NOTIFICATION_RETRY_KIND } from "./retry";
import { ROUTABLE_CHANNELS, type RoutableChannel } from "./routing";

/**
 * Whether a household's notifications are reaching people (story 27-010): per
 * channel over the last days, how many were sent, how many failed and why, how
 * many were saved by a retry, and what is still waiting to be tried again.
 *
 * Counts only, from the closed-word `notification_events` rows: no message, no
 * address, no one's name. An Admin reads it (the page checks); the rows are
 * read with the service role because the events table is each recipient's own.
 */
export const REPORT_DAYS = 7;
const MAX_EVENTS = 5000;

export type ChannelDelivery = {
  channel: RoutableChannel;
  sent: number;
  failed: number;
  /** Of the sent ones, how many went on a retry after a first failure. */
  recovered: number;
  /** Failed attempts by the code the channel gave: unavailable, rejected, no_target, not_configured, gone. */
  reasons: Record<string, number>;
};

export type DeliveryReport = {
  days: number;
  channels: ChannelDelivery[];
  /** Retries queued and not yet tried, and ones that gave up after their last attempt. */
  retriesWaiting: number;
  retriesGivenUp: number;
  /** True when the week held more events than were read, so the counts are the most recent ones. */
  truncated: boolean;
};

type EventRow = { channel: string | null; event_type: string; metadata: { code?: unknown; retry?: unknown } | null };

/** Pure: the counts for the channels a person can route to. */
export function summariseDelivery(rows: readonly EventRow[]): ChannelDelivery[] {
  return ROUTABLE_CHANNELS.map((channel) => {
    const own = rows.filter((row) => row.channel === channel);
    const sent = own.filter((row) => row.event_type === "sent");
    const failed = own.filter((row) => row.event_type === "delivery_failed");
    const reasons: Record<string, number> = {};
    for (const row of failed) {
      const code = typeof row.metadata?.code === "string" ? row.metadata.code : "unknown";
      reasons[code] = (reasons[code] ?? 0) + 1;
    }
    return { channel, sent: sent.length, failed: failed.length, recovered: sent.filter((row) => row.metadata?.retry === true).length, reasons };
  });
}

export async function loadDeliveryReport(admin: SupabaseClient, householdId: string, now: Date = new Date()): Promise<DeliveryReport> {
  const since = new Date(now.getTime() - REPORT_DAYS * 86_400_000).toISOString();
  const [{ data: events }, { count: waiting }, { count: givenUp }] = await Promise.all([
    admin
      .from("notification_events")
      .select("channel, event_type, metadata")
      .eq("household_id", householdId)
      .in("channel", [...ROUTABLE_CHANNELS])
      .in("event_type", ["sent", "delivery_failed"])
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(MAX_EVENTS),
    admin.from("jobs").select("id", { count: "exact", head: true }).eq("household_id", householdId).eq("kind", NOTIFICATION_RETRY_KIND).in("status", ["pending", "claimed"]),
    admin.from("jobs").select("id", { count: "exact", head: true }).eq("household_id", householdId).eq("kind", NOTIFICATION_RETRY_KIND).eq("status", "dead").gte("updated_at", since),
  ]);
  const rows = (events ?? []) as EventRow[];
  return { days: REPORT_DAYS, channels: summariseDelivery(rows), retriesWaiting: waiting ?? 0, retriesGivenUp: givenUp ?? 0, truncated: rows.length >= MAX_EVENTS };
}
