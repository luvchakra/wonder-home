import type { SupabaseClient } from "@supabase/supabase-js";

import { formatterFor } from "../i18n/format";
import type { Formatter } from "../i18n/format";
import type { Translate } from "../i18n/translate";
import { log } from "../observability/logger";
import type { ChannelAdapter, DeliveryChannel } from "./channels";
import { deliverNotification, translatorForRecipient } from "./deliver";
import { localizeReminder } from "./message";
import { ROUTABLE_CHANNELS, type RoutableChannel } from "./routing";
import { localMoment } from "./timing";

/**
 * The morning digest (story 27-008): one calm message a day on a channel the
 * person chose, at the time they chose, with what the in-app summary holds.
 *
 * - **The same rows.** The person's own open notifications scheduled for their
 *   local today, the ones the in-app "HomeBrain summary" lists, worded in their
 *   own language.
 * - **Empty days send nothing.** The day is still marked done.
 * - **Once a day.** The local day is claimed before anything is sent, so a
 *   repeated tick of the delivery clock sends nothing twice.
 * - **Not late.** A digest more than three hours after its time is skipped for
 *   that day: a morning summary at lunchtime is noise.
 * - **The reminders in it stay in the app.** A channel carrying a digest does
 *   not also buzz for each ordinary reminder (`deliverNotification`); anything
 *   urgent still does.
 *
 * It goes through `deliverNotification` like everything else, as a notification
 * kept already resolved (source `digest`) so it leaves the usual closed-word
 * events and never sits in the inbox as something to do.
 */
export const DIGEST_LATE_MINUTES = 180;
const SHOWN = 6;

type DigestRow = { title: string; body: string; message?: unknown; scheduled_for: string };

/** The digest's words in the translator's language, or null when the day holds nothing. */
export function digestText(rows: readonly DigestRow[], t: Translate, format: Formatter): { title: string; body: string } | null {
  if (rows.length === 0) return null;
  const titles = rows.slice(0, SHOWN).map((row) => localizeReminder({ title: row.title, body: row.body, message: row.message }, t, format).title);
  const more = rows.length - titles.length;
  const list = format.list(more > 0 ? [...titles, t("reminder.digest.more", { count: more })] : titles);
  return { title: t("reminder.digest.title"), body: t("reminder.digest.body", { count: rows.length, list }).slice(0, 500) };
}

/** Whether this person's digest is due now: their time has come, within the grace, and today's has not gone. */
export function digestDue(input: { now: Date; timeZone: string; minute: number; lastOn: string | null }): { due: boolean; today: string } {
  const local = localMoment(input.now, input.timeZone);
  const due = local.minuteOfDay >= input.minute && local.minuteOfDay < input.minute + DIGEST_LATE_MINUTES && input.lastOn !== local.dateKey;
  return { due, today: local.dateKey };
}

type PreferenceRow = { household_id: string; member_id: string; channel: DeliveryChannel; digest_minute: number; digest_last_on: string | null };

/** Sends every digest that is due. Called by the delivery clock; never throws. Returns how many went out. */
export async function sendDueDigests(admin: SupabaseClient, now: Date = new Date(), options: { adapters?: Record<DeliveryChannel, ChannelAdapter> } = {}): Promise<number> {
  let sent = 0;
  try {
    const { data } = await admin
      .from("notification_preferences")
      .select("household_id, member_id, channel, digest_minute, digest_last_on")
      .eq("digest", true)
      .eq("enabled", true)
      .in("channel", [...ROUTABLE_CHANNELS])
      .limit(500);
    const preferences = (data ?? []) as PreferenceRow[];
    if (preferences.length === 0) return 0;
    const householdIds = [...new Set(preferences.map((row) => row.household_id))];
    const { data: households } = await admin.from("households").select("id, timezone, region, currency, measurement_system, default_language").in("id", householdIds);
    const byHousehold = new Map(((households ?? []) as Record<string, unknown>[]).map((row) => [row.id as string, row]));

    for (const preference of preferences) {
      const household = byHousehold.get(preference.household_id);
      if (!household) continue;
      const { due, today } = digestDue({ now, timeZone: String(household.timezone ?? "Asia/Kolkata"), minute: preference.digest_minute, lastOn: preference.digest_last_on });
      if (!due) continue;
      try {
        if (await sendOne(admin, preference, household, today, now, options.adapters)) sent += 1;
      } catch (thrown) {
        log.warn("digest failed for a member", { reason: thrown instanceof Error ? thrown.name : "unknown" });
      }
    }
  } catch (thrown) {
    log.warn("digest tick failed", { reason: thrown instanceof Error ? thrown.name : "unknown" });
  }
  return sent;
}

async function sendOne(
  admin: SupabaseClient,
  preference: PreferenceRow,
  household: Record<string, unknown>,
  today: string,
  now: Date,
  adapters: Record<DeliveryChannel, ChannelAdapter> | undefined,
): Promise<boolean> {
  // Claim the day: whoever flips it first sends; a concurrent tick finds it taken.
  const claim = admin.from("notification_preferences").update({ digest_last_on: today }).eq("member_id", preference.member_id).eq("channel", preference.channel);
  const { data: claimed } = await (preference.digest_last_on === null ? claim.is("digest_last_on", null) : claim.eq("digest_last_on", preference.digest_last_on)).select("member_id");
  if (((claimed ?? []) as unknown[]).length === 0) return false;

  const { data: member } = await admin.from("household_members").select("language, date_format, time_format, measurement_system").eq("id", preference.member_id).maybeSingle();
  const found = await translatorForRecipient(household, member as Record<string, unknown> | null);
  if (!found) return false;
  const format = formatterFor(found.preferences);

  const { data: rows } = await admin
    .from("notifications")
    .select("title, body, message, scheduled_for")
    .eq("recipient_member_id", preference.member_id)
    .in("status", ["generated", "delivered", "seen"])
    .lte("scheduled_for", new Date(now.getTime() + 86_400_000).toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(100);
  const timeZone = String(household.timezone ?? "Asia/Kolkata");
  const todays = ((rows ?? []) as DigestRow[]).filter((row) => localMoment(new Date(row.scheduled_for), timeZone).dateKey === today);
  const words = digestText(todays, found.t, format);
  if (!words) return false;

  const { data: created } = await admin
    .from("notifications")
    .insert({
      household_id: preference.household_id,
      recipient_member_id: preference.member_id,
      type: "completion",
      thread_key: `digest:${preference.channel}:${today}`,
      title: words.title.slice(0, 160),
      body: words.body,
      action: { action: "open", target: "/notifications" },
      status: "resolved",
      resolved_at: now.toISOString(),
      scheduled_for: now.toISOString(),
      source_type: "digest",
      // Every source names a record; a digest's is the person it was written for.
      source_id: preference.member_id,
      category: "system",
      priority: "normal",
      decision_factors: { source: "digest", channel: preference.channel },
    })
    .select("id")
    .single();
  const id = (created as { id: string } | null)?.id;
  if (!id) return false;
  const result = await deliverNotification(
    admin,
    {
      householdId: preference.household_id,
      notificationId: id,
      recipientMemberId: preference.member_id,
      notification: { title: words.title, body: words.body, priority: "normal", url: "/notifications" },
      reason: "reminder",
      category: null,
      only: preference.channel as RoutableChannel,
      digest: true,
      now,
    },
    adapters,
  );
  return result.sent.includes(preference.channel);
}
