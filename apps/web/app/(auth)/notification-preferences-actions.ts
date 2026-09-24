"use server";

import { revalidatePath } from "next/cache";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { DELIVERY_CHANNELS, type DeliveryChannel } from "@wonderhome/core/notifications/channels";
import { loadChannelPreferences, saveChannelPreference, saveSmartReminderChoices } from "@wonderhome/core/notifications/preferences";
import { TUNABLE_CATEGORIES } from "@wonderhome/core/notifications/policies";
import { saveReminderPreferences } from "@wonderhome/core/notifications/reminder-preferences";

import { reconcileRemindersNow } from "../_lib/reminders";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";

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

  const householdId = String(formData.get("householdId") ?? "");
  const enabled = formData.get("enabled") === "on";
  const quietFrom = readHour(formData.get("quietFrom"));
  const quietUntil = readHour(formData.get("quietUntil"));
  const quietFromMinute = readMinute(formData.get("quietFromMinute"));
  const quietUntilMinute = readMinute(formData.get("quietUntilMinute"));
  const targetRaw = String(formData.get("target") ?? "").trim();
  const target = targetRaw === "" ? null : targetRaw;

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
  const householdId = String(formData.get("householdId") ?? "");
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
export async function saveReminderPreferencesAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const householdId = String(formData.get("householdId") ?? "");
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    await saveReminderPreferences(supabase, {
      householdId,
      memberId: membership.memberId,
      preferences: TUNABLE_CATEGORIES.map((category) => ({
        category,
        preset: String(formData.get(`preset_${category}`) ?? ""),
        enabled: formData.get(`enabled_${category}`) === "on",
      })),
    });
    // The new timing applies to reminders already waiting, not just new ones.
    await reconcileRemindersNow(householdId, { force: true });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "notifications").body.error.message };
  }
  revalidatePath("/settings/notifications");
  revalidatePath("/notifications");
  return { notice: "Reminder preferences saved." };
}

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
