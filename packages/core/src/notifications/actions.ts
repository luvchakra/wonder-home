import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { atLocal, localMoment, shiftDate } from "./timing";

/**
 * What a person does with their own reminder (story 23-005): mark it seen,
 * snooze it, set it for a time of their choosing, or dismiss it.
 *
 * All through their own session. RLS keeps them to their own rows and the
 * recipient guard trigger keeps them to state — a snooze can only move a
 * reminder forward, up to a month — so nothing here needs the admin client,
 * and nothing here can rewrite what a reminder says. Acting on the thing
 * itself (paying the bill, handing in the project) goes through that
 * domain's own service; the reminder resolves because its source changed.
 */

export const SNOOZE_PRESETS = ["in_5_minutes", "in_15_minutes", "in_30_minutes", "in_1_hour", "later_today", "tomorrow_morning"] as const;
export type SnoozePreset = (typeof SNOOZE_PRESETS)[number];

export const SNOOZE_LABELS: Record<SnoozePreset, string> = {
  in_5_minutes: "In 5 minutes",
  in_15_minutes: "In 15 minutes",
  in_30_minutes: "In 30 minutes",
  in_1_hour: "In 1 hour",
  later_today: "Later today",
  tomorrow_morning: "Tomorrow morning",
};

/** The furthest a reminder can be pushed, matching the database guard. */
export const MAX_SNOOZE_DAYS = 31;

const LATER_TODAY_AT = 18 * 60;
const TOMORROW_MORNING_AT = 8 * 60;

/** When a preset brings the reminder back, on the household's clock. */
export function snoozeUntil(preset: SnoozePreset, now: Date, timeZone: string): Date {
  const minutes = (count: number) => new Date(now.getTime() + count * 60_000);
  switch (preset) {
    case "in_5_minutes":
      return minutes(5);
    case "in_15_minutes":
      return minutes(15);
    case "in_30_minutes":
      return minutes(30);
    case "in_1_hour":
      return minutes(60);
    case "later_today": {
      // This evening, or — when it is already evening — a couple of hours on.
      const local = localMoment(now, timeZone);
      return local.minuteOfDay < LATER_TODAY_AT - 60 ? atLocal(local.dateKey, LATER_TODAY_AT, timeZone) : minutes(120);
    }
    case "tomorrow_morning": {
      const local = localMoment(now, timeZone);
      return atLocal(shiftDate(local.dateKey, 1), TOMORROW_MORNING_AT, timeZone);
    }
  }
}

/** A time a person picked, as long as it is in the future and within the month the guard allows. */
export function validSnoozeTime(until: Date, now: Date): boolean {
  return until.getTime() > now.getTime() && until.getTime() <= now.getTime() + MAX_SNOOZE_DAYS * 86_400_000;
}

export async function snoozeNotification(
  supabase: SupabaseClient,
  notificationId: string,
  until: Date,
  now: Date = new Date(),
): Promise<void> {
  if (!validSnoozeTime(until, now)) {
    throw ApiError.badRequest("Pick a time later today or within the next month.");
  }
  const { data: row } = await supabase
    .from("notifications")
    .select("snooze_count, status")
    .eq("id", notificationId)
    .maybeSingle();
  if (!row) throw ApiError.notFound("That reminder is no longer here.");
  const current = row as { snooze_count: number; status: string };
  if (!["generated", "delivered", "seen"].includes(current.status)) {
    throw ApiError.badRequest("That reminder has already been dealt with.");
  }

  const { data, error } = await supabase
    .from("notifications")
    .update({ status: "generated", scheduled_for: until.toISOString(), snooze_count: current.snooze_count + 1 })
    .eq("id", notificationId)
    .eq("snooze_count", current.snooze_count)
    .select("id");
  if (error || !data || data.length === 0) {
    throw ApiError.badRequest("That reminder could not be snoozed. Try again.");
  }
}

export async function dismissNotification(supabase: SupabaseClient, notificationId: string, now: Date = new Date()): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ status: "dismissed", dismissed_at: now.toISOString() })
    .eq("id", notificationId)
    .in("status", ["generated", "delivered", "seen"]);
  if (error) throw ApiError.badRequest("That reminder could not be dismissed. Try again.");
}

/** Marks what a person has now looked at as seen. Rows already acted on are left alone. */
export async function markNotificationsSeen(supabase: SupabaseClient, notificationIds: readonly string[], now: Date = new Date()): Promise<void> {
  if (notificationIds.length === 0) return;
  await supabase
    .from("notifications")
    .update({ status: "seen", seen_at: now.toISOString() })
    .in("id", [...notificationIds])
    .in("status", ["generated", "delivered"])
    .lte("scheduled_for", now.toISOString());
}
