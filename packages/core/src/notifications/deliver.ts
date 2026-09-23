import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";
import { channelAdaptersFromEnv, dispatchToChannels, type ChannelAdapter, type ChannelNotification, type ChannelPreference, type DeliveryChannel } from "./channels";

/**
 * Sending a notification beyond the app (stories 06-008, 17-006).
 *
 * The notification row is the in-app delivery, so this only tries the
 * member's other channels — the ones they switched on, with an address, and
 * not in their quiet hours (`selectChannels`). Each attempt leaves one
 * `notification_events` row in closed words: `sent` with the provider's
 * message id (so its later delivery report can find it), or
 * `delivery_failed` with the error code. A fixture channel that refuses
 * because it is not configured leaves nothing — it never tried.
 *
 * Never throws: a channel failing must not fail the notification, which is
 * already in the household's inbox.
 */
export async function deliverNotification(
  admin: SupabaseClient,
  input: { householdId: string; notificationId: string; recipientMemberId: string; notification: ChannelNotification; now?: Date },
  adapters: Record<DeliveryChannel, ChannelAdapter> = channelAdaptersFromEnv(),
): Promise<{ sent: DeliveryChannel[]; failed: DeliveryChannel[] }> {
  const now = input.now ?? new Date();
  try {
    const { data } = await admin
      .from("notification_preferences")
      .select("channel, enabled, quiet_from, quiet_until, target")
      .eq("member_id", input.recipientMemberId)
      .neq("channel", "in_app");
    const preferences: ChannelPreference[] = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      channel: row.channel as DeliveryChannel,
      enabled: row.enabled === true,
      quietFrom: (row.quiet_from as number | null) ?? null,
      quietUntil: (row.quiet_until as number | null) ?? null,
      target: (row.target as string | null) ?? null,
    }));
    // Only channels that can actually reach someone; a fixture's "not
    // configured" is not an attempt.
    const live = preferences.filter((preference) => adapters[preference.channel]?.live);
    if (live.length === 0) return { sent: [], failed: [] };

    const attempts = await dispatchToChannels(live, input.notification, now, adapters);
    const rows = attempts.map((attempt) => ({
      household_id: input.householdId,
      notification_id: input.notificationId,
      channel: attempt.channel,
      event_type: attempt.result.ok ? "sent" : "delivery_failed",
      metadata: attempt.result.ok
        ? attempt.result.providerMessageId
          ? { providerMessageId: attempt.result.providerMessageId }
          : {}
        : { code: attempt.result.error.code, retryable: attempt.result.error.retryable },
    }));
    if (rows.length > 0) await admin.from("notification_events").insert(rows);
    return {
      sent: attempts.filter((attempt) => attempt.result.ok).map((attempt) => attempt.channel),
      failed: attempts.filter((attempt) => !attempt.result.ok).map((attempt) => attempt.channel),
    };
  } catch (thrown) {
    log.warn("notification delivery failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
    return { sent: [], failed: [] };
  }
}
