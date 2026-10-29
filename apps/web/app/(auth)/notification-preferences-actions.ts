"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { DELIVERY_CHANNELS, type DeliveryChannel } from "@wonderhome/core/notifications/channels";
import { DEFAULT_DIGEST_MINUTE, loadChannelPreferences, saveChannelPreference, saveSmartReminderChoices } from "@wonderhome/core/notifications/preferences";
import { TUNABLE_CATEGORIES } from "@wonderhome/core/notifications/policies";
import { saveReminderPreferences } from "@wonderhome/core/notifications/reminder-preferences";
import { firstName } from "@wonderhome/core/email/layout";
import { sendTestNotification } from "@wonderhome/core/notifications/channel-check";
import { ROUTABLE_CHANNELS, setRoute, type RoutableChannel } from "@wonderhome/core/notifications/routing";

import { memberLocale } from "../_lib/entry-locale";
import { reconcileRemindersNow } from "../_lib/reminders";
import { reasonWords } from "../_lib/channel-check-words";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { hitRateLimit, rateLimitMessage } from "@wonderhome/core/security/rate-limit";
import { requireMembership } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";
import { formText, formUuid } from "../_lib/form-input";

/**
 * How one member wants to be reached (story 06-008).
 *
 * Unlike the voice settings, this is personal, not household-wide: `notify`
 * only ever touches the caller's own `notification_preferences` row, which
 * RLS already restricts to its owner, so `requireMembership` here is about
 * confirming they belong to the household at all, not about elevated
 * permission.
 */

function isChannel(value: unknown): value is DeliveryChannel {
  return typeof value === "string" && (DELIVERY_CHANNELS as readonly string[]).includes(value);
}

export async function saveChannelPreferenceAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const channel = formData.get("channel");
  if (!isChannel(channel)) return { error: "Unknown channel." };

  const householdId = formUuid(formData, "householdId");
  if (!householdId) return { error: "Please try again." };
  const enabled = formData.get("enabled") === "on";
  const quietFrom = readHour(formData.get("quietFrom"));
  const quietUntil = readHour(formData.get("quietUntil"));
  const quietFromMinute = readMinute(formData.get("quietFromMinute"));
  const quietUntilMinute = readMinute(formData.get("quietUntilMinute"));
  const targetRaw = formText(formData, "target", 64);
  if (targetRaw === null) return { error: "That address is too long." };
  const target = targetRaw === "" ? null : targetRaw;
  // The morning summary on this channel (story 27-008): a tick box and a time, only on the channels that go beyond the app.
  const digestAt = readClock(formData.get("digestAt"));
  const digest = channel !== "in_app" && formData.has("digestAt") ? { on: formData.get("digest") === "on", minute: digestAt ? digestAt.hour * 60 + digestAt.minute : DEFAULT_DIGEST_MINUTE } : undefined;

  if (channel === "whatsapp" && target && !/^\+[1-9]\d{1,14}$/.test(target)) {
    return { error: "Use the full number with a country code, e.g. +15551234567." };
  }

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    await saveChannelPreference(supabase, {
      householdId,
      memberId: membership.memberId,
      channel,
      enabled,
      quietFrom,
      quietUntil,
      quietFromMinute,
      quietUntilMinute,
      target,
      ...(digest ? { digest } : {}),
    });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "notifications").body.error.message };
  }

  revalidatePath("/settings/notifications");
  return { notice: "Saved." };
}

function readHour(raw: FormDataEntryValue | null): number | null {
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 23 ? value : null;
}

function readMinute(raw: FormDataEntryValue | null): number {
  const value = Number(raw ?? 0);
  return Number.isInteger(value) && value >= 0 && value <= 59 ? value : 0;
}

/** "22:30" → hour 22, minute 30; anything else is no time at all. */
function readClock(raw: FormDataEntryValue | null): { hour: number; minute: number } | null {
  const match = /^(\d{2}):(\d{2})$/.exec(String(raw ?? ""));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

/**
 * Quiet hours (story 23-004): the in-app channel's own window, to the minute,
 * on the household's clock. Turning them off clears both ends.
 */
export async function saveQuietHoursAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const householdId = formUuid(formData, "householdId");
  if (!householdId) return { error: "Please try again." };
  const on = formData.get("quietOn") === "on";
  const from = readClock(formData.get("quietFrom"));
  const until = readClock(formData.get("quietUntil"));
  if (on && (!from || !until)) return { error: "Pick when quiet hours start and end." };
  if (on && from && until && from.hour === until.hour && from.minute === until.minute) {
    return { error: "Quiet hours need to start and end at different times." };
  }

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    const current = (await loadChannelPreferences(supabase, membership.memberId)).find((preference) => preference.channel === "in_app");
    await saveChannelPreference(supabase, {
      householdId,
      memberId: membership.memberId,
      channel: "in_app",
      enabled: current?.enabled ?? true,
      quietFrom: on ? from!.hour : null,
      quietUntil: on ? until!.hour : null,
      quietFromMinute: on ? from!.minute : 0,
      quietUntilMinute: on ? until!.minute : 0,
      target: null,
    });
    await reconcileRemindersNow(householdId, { force: true });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "notifications").body.error.message };
  }

  revalidatePath("/settings/notifications");
  revalidatePath("/notifications");
  return { notice: on ? "Quiet hours saved." : "Quiet hours are off." };
}

/** How early each kind of reminder comes, and whether at all (story 23-007). */
/** The day's summary and learned timing — each person's own choice (stories 23-011, 23-012). */
export async function saveSmartRemindersAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const householdId = String(formData.get("householdId") ?? "");
  const learnTiming = formData.get("learnTiming") === "on";
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    await saveSmartReminderChoices(supabase, {
      householdId,
      memberId: membership.memberId,
      dailyDigest: formData.get("dailyDigest") === "on",
      learnTiming,
    });
    // Turning learning on or off moves reminders already waiting.
    await reconcileRemindersNow(householdId, { force: true });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "notifications").body.error.message };
  }
  revalidatePath("/settings/notifications");
  revalidatePath("/notifications");
  return { notice: "Saved." };
}

const pushSubscriptionSchema = z.object({
  householdId: z.uuid(),
  endpoint: z.url().startsWith("https://").max(1000),
  p256dh: z.string().min(20).max(200),
  auth: z.string().min(8).max(100),
  label: z.string().trim().max(80).optional(),
});

/**
 * This device, on for push (story 23-015): the subscription the browser's
 * push service issued is kept for the signed-in member, and their push
 * channel is switched on. A device belongs to whoever is signed in on it now:
 * if someone else had it before, their subscription for this exact endpoint
 * is dropped first, so a shared tablet never buzzes for the wrong person.
 */
export async function savePushSubscriptionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = pushSubscriptionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "That device could not be registered. Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await createAdminClient().from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint);
    const { error } = await supabase.from("push_subscriptions").insert({
      household_id: parsed.data.householdId,
      member_id: membership.memberId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.p256dh,
      auth: parsed.data.auth,
      label: parsed.data.label || null,
    });
    if (error) throw new Error(`push subscription failed: ${error.code ?? "unknown"}`);
    const current = (await loadChannelPreferences(supabase, membership.memberId)).find((preference) => preference.channel === "push");
    await saveChannelPreference(supabase, {
      householdId: parsed.data.householdId,
      memberId: membership.memberId,
      channel: "push",
      enabled: true,
      quietFrom: current?.quietFrom ?? null,
      quietUntil: current?.quietUntil ?? null,
      quietFromMinute: current?.quietFromMinute ?? 0,
      quietUntilMinute: current?.quietUntilMinute ?? 0,
      target: null,
    });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "notifications").body.error.message };
  }
  revalidatePath("/settings/notifications");
  return { notice: "on" };
}

/** This device, off: its subscription is forgotten. The member's other devices keep theirs. */
export async function removePushSubscriptionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ householdId: z.uuid(), endpoint: z.string().max(1000) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint);
  } catch (thrown) {
    return { error: toErrorBody(thrown, "notifications").body.error.message };
  }
  revalidatePath("/settings/notifications");
  return { notice: "off" };
}

/**
 * A test notification on one channel, to the signed-in member only (story 27-003).
 * Throttled like any other write; when it does not arrive, the answer is the
 * plain reason, in the person's language, never a provider's own words.
 */
async function testChannel(householdId: string, channel: RoutableChannel): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    const admin = createAdminClient();
    if (!(await hitRateLimit(admin, "notification.test", membership.memberId))) return { error: rateLimitMessage("notification.test") };
    const { t, language } = await memberLocale(membership);
    const name = firstName(membership.displayName);
    const result = await sendTestNotification(admin, {
      memberId: membership.memberId,
      channel,
      notification: {
        title: t("push.device.testTitle"),
        body: t("push.device.testBody"),
        // The same words, greeting and footer a real reminder's email carries.
        emailWords: {
          open: t("notificationEmail.open"),
          why: t("notificationEmail.why"),
          ...(name ? { hello: t("notificationEmail.hello", { name }) } : {}),
          settings: t("notificationEmail.settings"),
          privacy: t("notificationEmail.privacy"),
          lang: language,
        },
      },
    });
    if (result.ok) return { notice: "sent" };
    return { error: reasonWords(t, result.reason, channel) };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "notifications").body.error.message };
  }
}

/** A test push to every device of the signed-in member, so they can see it arrive. */
export async function sendTestPushAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ householdId: z.uuid() }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  return testChannel(parsed.data.householdId, "push");
}

/** A test email or WhatsApp message to the signed-in member. */
export async function sendTestNotificationAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.object({ householdId: z.uuid(), channel: z.enum(ROUTABLE_CHANNELS) }).safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  return testChannel(parsed.data.householdId, parsed.data.channel);
}

/**
 * Keep one kind of reminder off one channel, or allow it again (story 27-002).
 * The person's own choice, through their own session: the table's policy
 * confines it to their own rows.
 */
export async function setChannelRouteAction(input: { householdId: string; category: string; channel: string; allowed: boolean }): Promise<{ ok: true } | { error: string }> {
  const parsed = z.object({ householdId: z.uuid(), category: z.string().max(40), channel: z.string().max(20), allowed: z.boolean() }).safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await setRoute(supabase, { ...parsed.data, memberId: membership.memberId });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "notifications").body.error.message };
  }
  revalidatePath("/settings/notifications");
  return { ok: true };
}

/**
 * One kind's own choices from the notification center (the owner, 2026-10-22):
 * whether it comes at all and when. Only this kind is written, so a kind the
 * person never touched keeps following the household's starting timing.
 */
export async function saveReminderKindAction(input: { householdId: string; category: string; preset: string; enabled: boolean }): Promise<{ ok: true } | { error: string }> {
  const parsed = z.object({ householdId: z.uuid(), category: z.enum(TUNABLE_CATEGORIES), preset: z.string().max(60), enabled: z.boolean() }).safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await saveReminderPreferences(supabase, {
      householdId: parsed.data.householdId,
      memberId: membership.memberId,
      preferences: [{ category: parsed.data.category, preset: parsed.data.preset, enabled: parsed.data.enabled }],
    });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "notifications").body.error.message };
  }
  revalidatePath("/settings/notifications");
  return { ok: true };
}
