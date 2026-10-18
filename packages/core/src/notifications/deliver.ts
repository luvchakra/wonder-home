import type { SupabaseClient } from "@supabase/supabase-js";

import { formatterFor } from "../i18n/format";
import { parseHouseholdSettings, parseMemberChoices, resolvePreferences } from "../i18n/preferences";
import { translatorFor } from "../i18n/translate";
import { log } from "../observability/logger";
import { renderCopy, type NotificationCopy } from "./message";
import { channelAdaptersFromEnv, dispatchToChannels, type ChannelAdapter, type ChannelAttempt, type ChannelNotification, type ChannelPreference, type DeliveryChannel } from "./channels";
import { parsePushTarget } from "./web-push";
import { pushWorthSending, type PushReason } from "./push-gate";

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
  input: {
    householdId: string;
    notificationId: string;
    recipientMemberId: string;
    notification: ChannelNotification;
    /** The reminder as a message, when it has one: sent in the recipient's own language (story 22-006). */
    copy?: NotificationCopy | null;
    /** A reminder timed for this person, or an alert about something that happened (decides whether it may buzz). */
    reason?: PushReason;
    now?: Date;
  },
  adapters: Record<DeliveryChannel, ChannelAdapter> = channelAdaptersFromEnv(),
): Promise<{ sent: DeliveryChannel[]; failed: DeliveryChannel[] }> {
  const now = input.now ?? new Date();
  try {
    const [{ data }, { data: household }, { data: member }, { data: devices }] = await Promise.all([
      admin
        .from("notification_preferences")
        .select("channel, enabled, quiet_from, quiet_until, quiet_from_minute, quiet_until_minute, target")
        .eq("member_id", input.recipientMemberId)
        .neq("channel", "in_app"),
      admin.from("households").select("timezone, region, currency, measurement_system, default_language").eq("id", input.householdId).maybeSingle(),
      input.copy
        ? admin.from("household_members").select("language, date_format, time_format, measurement_system").eq("id", input.recipientMemberId).maybeSingle()
        : Promise.resolve({ data: null }),
      adapters.push?.live
        ? admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("member_id", input.recipientMemberId)
        : Promise.resolve({ data: [] }),
    ]);
    // Quiet hours are the household's own clock, never the server's.
    const timeZone = ((household as { timezone?: string } | null)?.timezone ?? "Asia/Kolkata") as string;
    const preferences: ChannelPreference[] = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      channel: row.channel as DeliveryChannel,
      enabled: row.enabled === true,
      quietFrom: (row.quiet_from as number | null) ?? null,
      quietUntil: (row.quiet_until as number | null) ?? null,
      quietFromMinute: (row.quiet_from_minute as number | null) ?? 0,
      quietUntilMinute: (row.quiet_until_minute as number | null) ?? 0,
      target: (row.target as string | null) ?? null,
    }));
    // Push reaches each device the person turned it on for (story 23-015),
    // with their push preference's quiet hours, and only when it is worth
    // the interruption (`pushWorthSending`).
    const subscriptions = ((devices ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[]);
    const pushPreference = preferences.find((preference) => preference.channel === "push");
    let pushTargets: ChannelPreference[] = [];
    if (subscriptions.length > 0 && pushPreference?.enabled !== false) {
      const sentToday = await pushesInLastDay(admin, input.recipientMemberId, now);
      if (pushWorthSending({ priority: input.notification.priority, reason: input.reason ?? "alert", sentToday })) {
        pushTargets = subscriptions.map((device) => ({
          ...(pushPreference ?? { channel: "push" as const, enabled: true, quietFrom: null, quietUntil: null }),
          channel: "push" as const,
          enabled: true,
          target: JSON.stringify({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } }),
        }));
      }
    }
    // Only channels that can actually reach someone; a fixture's "not
    // configured" is not an attempt.
    const live = [...preferences.filter((preference) => preference.channel !== "push" && adapters[preference.channel]?.live), ...pushTargets];
    if (live.length === 0) return { sent: [], failed: [] };

    const translated = input.copy ? await inRecipientLanguage(input.notification, input.copy, household, member) : input.notification;
    const notification: ChannelNotification = { url: "/notifications", tag: input.notificationId, ...translated };
    const attempts = await dispatchToChannels(live, notification, now, timeZone, adapters);
    await recordPushOutcomes(admin, attempts, subscriptions, now);
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

/** The words in the recipient's language and formats; the stored English whenever that cannot be done. */
async function inRecipientLanguage(
  notification: ChannelNotification,
  copy: NotificationCopy,
  household: Record<string, unknown> | null,
  member: Record<string, unknown> | null,
): Promise<ChannelNotification> {
  if (!household) return notification;
  try {
    const preferences = resolvePreferences(
      member ? parseMemberChoices(member) : parseMemberChoices({}),
      parseHouseholdSettings({ ...household, language: household.default_language }),
    );
    const words = renderCopy(copy, await translatorFor(preferences.language), formatterFor(preferences));
    return { ...notification, title: words.title || notification.title, body: words.body || notification.body };
  } catch {
    return notification;
  }
}

/** How many pushes reached this person in the last day (the push gate's ceiling counts these). */
async function pushesInLastDay(admin: SupabaseClient, memberId: string, now: Date): Promise<number> {
  const { count } = await admin
    .from("notification_events")
    .select("id, notifications!inner(recipient_member_id)", { count: "exact", head: true })
    .eq("channel", "push")
    .eq("event_type", "sent")
    .eq("notifications.recipient_member_id", memberId)
    .gte("created_at", new Date(now.getTime() - 86_400_000).toISOString());
  return count ?? 0;
}

/** A device that took the push is marked; one its push service says is gone is forgotten. */
async function recordPushOutcomes(
  admin: SupabaseClient,
  attempts: readonly ChannelAttempt[],
  subscriptions: readonly { id: string; endpoint: string }[],
  now: Date,
): Promise<void> {
  const sentIds: string[] = [];
  const goneIds: string[] = [];
  for (const attempt of attempts) {
    if (attempt.channel !== "push") continue;
    const endpoint = parsePushTarget(attempt.target ?? null)?.endpoint;
    const device = subscriptions.find((subscription) => subscription.endpoint === endpoint);
    if (!device) continue;
    if (attempt.result.ok) sentIds.push(device.id);
    else if (attempt.result.error.code === "gone") goneIds.push(device.id);
  }
  if (sentIds.length > 0) await admin.from("push_subscriptions").update({ last_sent_at: now.toISOString(), failure_count: 0 }).in("id", sentIds);
  if (goneIds.length > 0) await admin.from("push_subscriptions").delete().in("id", goneIds);
}
