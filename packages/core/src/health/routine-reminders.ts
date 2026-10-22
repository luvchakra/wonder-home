import type { SupabaseClient } from "@supabase/supabase-js";

import { createNotification } from "../notifications/create";
import { chooseRecipient, decideNotification, type HouseholdEvent } from "../notifications/decide";
import { localMoment, shiftDate } from "../notifications/timing";
import { candidatesFor } from "./reminders";

/**
 * Measurement routine reminders (story 21-007) — the same day-scale sweep
 * shape `health/reminders.ts`'s `runHealthReminderSweep` already established
 * for appointments, called from the same `/platform/retention` cron route.
 * Sparse by design: a routine only ever nudges once, the day it becomes due
 * — no advance/preparation stages like an appointment has, since "measure
 * your blood pressure" has nothing to prepare for — and only when the
 * household left `reminder_enabled` on (never invented, always what was
 * configured).
 */

type Row = Record<string, unknown>;

export type RoutineReminderSummary = { checked: number; sent: number; skipped: number };

/** A measurement due today is asked for from this local time. */
const ROUTINE_MINUTE = 9 * 60;

/**
 * Whether a routine due on `dueOn` is due right `now` on the household's own
 * clock (the owner's review, 2026-10-22: the day was read in UTC). From 09:00
 * local on its day; the sweep runs every five minutes and sends each due date
 * once.
 */
export function routineDueNow(dueOn: string, now: Date, timeZone: string): boolean {
  const local = localMoment(now, timeZone);
  return local.dateKey === dueOn && local.minuteOfDay >= ROUTINE_MINUTE;
}

/** Finds every active, reminder-enabled routine due now on its household's clock, and sends it once — for real, via the existing notification pipeline. */
export async function runMeasurementRoutineSweep(admin: SupabaseClient, now: Date = new Date()): Promise<RoutineReminderSummary> {
  // Some household's "today" is UTC's yesterday or tomorrow; each row is then checked on its own clock.
  const utcToday = now.toISOString().slice(0, 10);

  const { data, error } = await admin
    .from("health_measurement_routines")
    .select("id, household_id, member_id, vital_type, custom_label, next_due_on, reminder_enabled, households(timezone)")
    .eq("status", "active")
    .eq("reminder_enabled", true)
    .in("next_due_on", [shiftDate(utcToday, -1), utcToday, shiftDate(utcToday, 1)])
    .limit(2000);

  if (error) throw new Error(`runMeasurementRoutineSweep failed to list routines: ${error.code ?? "unknown"}`);

  const summary: RoutineReminderSummary = { checked: 0, sent: 0, skipped: 0 };
  const due = ((data as Row[] | null) ?? []).filter((row) => {
    const household = (Array.isArray(row.households) ? row.households[0] : row.households) as { timezone?: string | null } | null;
    return routineDueNow(row.next_due_on as string, now, household?.timezone ?? "Asia/Kolkata");
  });
  if (due.length === 0) return summary;

  // Each due date is asked for once, whatever happened to the first one.
  const { data: sentRows, error: sentError } = await admin
    .from("notifications")
    .select("thread_key")
    .eq("source_type", "health_routine")
    .in(
      "source_id",
      due.map((row) => row.id as string),
    )
    .limit(10000);
  if (sentError) throw new Error(`runMeasurementRoutineSweep failed to read what was sent: ${sentError.code ?? "unknown"}`);
  const sent = new Set(((sentRows ?? []) as { thread_key: string }[]).map((row) => row.thread_key));

  for (const row of due) {
    const todayKey = row.next_due_on as string;
    if (sent.has(`health_routine:${row.id as string}:${todayKey}`)) continue;
    summary.checked += 1;

    const routineId = row.id as string;
    const householdId = row.household_id as string;
    const memberId = row.member_id as string;
    const label = row.vital_type === "custom" ? ((row.custom_label as string | null) ?? "measurement") : (row.vital_type as string).replace(/_/g, " ");

    const candidates = await candidatesFor(admin, householdId, memberId);
    const recipient = chooseRecipient(candidates);
    if (!recipient) {
      summary.skipped += 1;
      continue;
    }

    const event: HouseholdEvent = {
      threadKey: `health_routine:${routineId}:${todayKey}`,
      outcomeKey: `health_routine:${routineId}`,
      kind: "exception",
      aiResolvable: false,
      riskLevel: "low",
      dueAt: now,
      impact: `Today's ${label} measurement.`,
      recommendedAction: { action: "complete_routine" },
    };

    const decision = decideNotification(event, { candidates, openThreadKeys: [], now });
    if (decision.kind !== "notify") {
      summary.skipped += 1;
      continue;
    }

    const created = await createNotification(admin, {
      householdId,
      decision,
      title: "Measurement due",
      body: decision.impact,
      category: "appointments",
      source: { type: "health_routine", id: routineId },
      // A timed reminder for this person, like any other: it may push or email within the daily ceilings.
      reason: "reminder",
    });
    if (created) summary.sent += 1;
    else summary.skipped += 1;
  }

  return summary;
}
