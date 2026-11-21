import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { snoozeNotification, validSnoozeTime } from "../notifications/actions";
import { atLocal } from "../notifications/timing";

/**
 * "Remind me on…" from a bill's row (11-023): the person's own waiting
 * reminders about this bill move to 9 in the morning of the day they pick,
 * through the same snooze the reminder itself offers. Only the recipient's
 * own reminders: a reminder's one recipient changes only its state.
 */

export const SNOOZE_MINUTE_OF_DAY = 9 * 60;

export function billSnoozeTime(day: string, timeZone: string, now: Date = new Date()): Date | null {
  const until = atLocal(day, SNOOZE_MINUTE_OF_DAY, timeZone);
  return validSnoozeTime(until, now) ? until : null;
}

export async function snoozeBillReminders(
  supabase: SupabaseClient,
  input: { householdId: string; memberId: string; obligationId: string; day: string; timeZone: string },
  now: Date = new Date(),
): Promise<{ count: number; until: Date }> {
  const until = billSnoozeTime(input.day, input.timeZone, now);
  if (!until) throw ApiError.badRequest("Pick a day from tomorrow to a month from now.");
  const { data, error } = await supabase
    .from("notifications")
    .select("id")
    .eq("household_id", input.householdId)
    .eq("recipient_member_id", input.memberId)
    .eq("source_type", "obligation")
    .eq("source_id", input.obligationId)
    .in("status", ["generated", "delivered", "seen"])
    .limit(10);
  if (error) throw new Error(`snoozeBillReminders failed: ${error.code ?? "unknown"}`);
  const ids = ((data ?? []) as { id: string }[]).map((row) => row.id);
  if (ids.length === 0) throw ApiError.badRequest("No reminder about this bill is waiting for you.");
  for (const id of ids) await snoozeNotification(supabase, id, until, now);
  return { count: ids.length, until };
}
