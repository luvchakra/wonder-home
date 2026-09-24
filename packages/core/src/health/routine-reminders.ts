import type { SupabaseClient } from "@supabase/supabase-js";

import { createNotification } from "../notifications/create";
import { chooseRecipient, decideNotification, type HouseholdEvent } from "../notifications/decide";
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

/** Finds every active, reminder-enabled routine due today, and sends it — for real, via the existing notification pipeline. */
export async function runMeasurementRoutineSweep(admin: SupabaseClient, now: Date = new Date()): Promise<RoutineReminderSummary> {
  const todayKey = now.toISOString().slice(0, 10);

  const { data, error } = await admin
    .from("health_measurement_routines")
    .select("id, household_id, member_id, vital_type, custom_label, next_due_on, reminder_enabled")
    .eq("status", "active")
    .eq("reminder_enabled", true)
    .eq("next_due_on", todayKey);

  if (error) throw new Error(`runMeasurementRoutineSweep failed to list routines: ${error.code ?? "unknown"}`);

  const summary: RoutineReminderSummary = { checked: 0, sent: 0, skipped: 0 };

  for (const row of (data as Row[] | null) ?? []) {
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
    });
    if (created) summary.sent += 1;
    else summary.skipped += 1;
  }

  return summary;
}
