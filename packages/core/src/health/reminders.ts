import type { SupabaseClient } from "@supabase/supabase-js";

import { createNotification } from "../notifications/create";
import { chooseRecipient, decideNotification, type Candidate, type HouseholdEvent } from "../notifications/decide";
import { atLocal, localMoment, quietHoursFrom, shiftDate } from "../notifications/timing";
import type { AppointmentStatus, HealthAppointment } from "./appointments";

/**
 * Appointment reminders (story 21-002).
 *
 * `proactive_agents` is still off and nothing runs the household-agent
 * pipeline on a schedule (CLAUDE.md's own architecture section says so
 * plainly) — but a day-scale reminder sweep is a different, smaller thing,
 * and this repo already has the real pattern for it: `/platform/retention`
 * and `/platform/webhook-delivery` are `CRON_SECRET`-gated routes Vercel
 * Cron calls once a day. `runHealthReminderSweep` is the same shape, at the
 * same cadence — honest about the grain: "day-of" and "advance" reminders
 * are day-granularity concepts anyway, so a once-daily sweep is not a
 * watered-down version of something finer, it is the right cadence for what
 * this actually is.
 */

/** Days before the appointment an advance reminder fires. */
const ADVANCE_DAYS = 3;
/** Days before the appointment a preparation reminder fires, when there is something to prepare. */
const PREPARATION_DAYS = 1;

export type ReminderKind = "advance" | "preparation" | "day_of";

/** Advance and preparation reminders land from this local time on their day. */
const DAYTIME_MINUTE = 9 * 60;
/** A day-of reminder lands from this local time, or earlier for an early appointment. */
const DAY_OF_MINUTE = 7 * 60;
/** …never later than this long before the appointment starts. */
const DAY_OF_LEAD_MS = 2 * 60 * 60 * 1000;

/**
 * Which reminder kinds this appointment is due for right `now`, on the
 * household's own clock (the owner's review, 2026-10-22: the day was read in
 * UTC, and the once-a-day sweep sent "Today's the day" at 8:30 IST, after an
 * early appointment had begun). The day is the household's local day; an
 * advance or preparation reminder lands from 09:00 local on its day; the
 * day-of one from 07:00 local, or two hours before the appointment when that
 * is earlier, and never once it has started. The sweep runs every five
 * minutes and sends each kind once (`runHealthReminderSweep`).
 */
export function dueRemindersFor(
  appointment: Pick<HealthAppointment, "startsAt" | "remindAdvance" | "remindPreparation" | "remindDayOf" | "preparationNotes">,
  now: Date,
  timeZone: string,
): ReminderKind[] {
  const startsAt = new Date(appointment.startsAt);
  if (now >= startsAt) return [];
  const local = localMoment(now, timeZone);
  const day = localMoment(startsAt, timeZone).dateKey;
  const due: ReminderKind[] = [];

  if (appointment.remindAdvance && local.dateKey === shiftDate(day, -ADVANCE_DAYS) && local.minuteOfDay >= DAYTIME_MINUTE) due.push("advance");
  if (
    appointment.remindPreparation &&
    appointment.preparationNotes &&
    local.dateKey === shiftDate(day, -PREPARATION_DAYS) &&
    local.minuteOfDay >= DAYTIME_MINUTE
  ) {
    due.push("preparation");
  }
  if (appointment.remindDayOf && local.dateKey === day) {
    const from = Math.min(atLocal(day, DAY_OF_MINUTE, timeZone).getTime(), startsAt.getTime() - DAY_OF_LEAD_MS);
    if (now.getTime() >= from) due.push("day_of");
  }

  return due;
}

const REMINDER_MESSAGE: Record<ReminderKind, string> = {
  advance: `Coming up in ${ADVANCE_DAYS} days.`,
  preparation: "There's something to prepare before this one.",
  day_of: "Today's the day.",
};

type Row = Record<string, unknown>;

/** Who to tell about something concerning one member: themselves if they have an account, otherwise their guardians — the same resolution the appointment reminder sweep uses, reused by the specialist pipeline's own overdue-checkup notice (story 21-006). */
export async function candidatesFor(admin: SupabaseClient, householdId: string, memberId: string): Promise<Candidate[]> {
  const [memberRow, guardianRows, quietRow, householdRow] = await Promise.all([
    admin.from("household_members").select("id, member_type, profile_id").eq("id", memberId).maybeSingle(),
    admin.from("member_guardians").select("guardian_member_id").eq("household_id", householdId).eq("child_member_id", memberId),
    admin
      .from("notification_preferences")
      .select("quiet_from, quiet_until, quiet_from_minute, quiet_until_minute")
      .eq("member_id", memberId)
      .eq("channel", "in_app")
      .maybeSingle(),
    admin.from("households").select("timezone").eq("id", householdId).maybeSingle(),
  ]);

  const quietData = quietRow.data as Row | null;
  const quiet = quietData
    ? quietHoursFrom({
        quietFrom: quietData.quiet_from as number | null,
        quietUntil: quietData.quiet_until as number | null,
        quietFromMinute: quietData.quiet_from_minute as number | null,
        quietUntilMinute: quietData.quiet_until_minute as number | null,
      })
    : null;
  // Quiet hours are read on the household's clock, never UTC.
  const timeZone = ((householdRow.data as Row | null)?.timezone as string | undefined) ?? "Asia/Kolkata";
  const availability = quiet ? { quiet, timeZone } : null;

  const hasOwnAccount = memberRow.data ? Boolean((memberRow.data as Row).profile_id) : false;
  const candidates: Candidate[] = [];

  if (hasOwnAccount) {
    candidates.push({ memberId, role: "primary", canAct: true, availability });
  }

  for (const row of (guardianRows.data as Row[] | null) ?? []) {
    candidates.push({ memberId: row.guardian_member_id as string, role: hasOwnAccount ? "backup" : "primary", canAct: true, availability: null });
  }

  return candidates;
}

export type ReminderSweepSummary = { checked: number; sent: number; skipped: number };

/**
 * Finds every open appointment with a reminder due now, and sends it — for
 * real, via the existing notification pipeline. Runs on the five-minute
 * delivery clock and the daily sweep alike: each kind of reminder for an
 * appointment is sent once, so a reminder a person dismissed never returns.
 */
export async function runHealthReminderSweep(admin: SupabaseClient, now: Date = new Date()): Promise<ReminderSweepSummary> {
  const windowEnd = new Date(now.getTime() + (ADVANCE_DAYS + 1) * 86_400_000);

  const { data, error } = await admin
    .from("health_appointments")
    .select(
      "id, household_id, member_id, appointment_type, status, starts_at, remind_advance, remind_preparation, remind_day_of, preparation_notes, households(timezone)",
    )
    .in("status", ["proposed", "confirmed"])
    .gte("starts_at", now.toISOString())
    .lte("starts_at", windowEnd.toISOString())
    .limit(2000);

  if (error) throw new Error(`runHealthReminderSweep failed to list appointments: ${error.code ?? "unknown"}`);

  const summary: ReminderSweepSummary = { checked: 0, sent: 0, skipped: 0 };
  const rows = (data as Row[] | null) ?? [];
  if (rows.length === 0) return summary;

  // What was already sent for these appointments, in any state: each kind goes once.
  const { data: sentRows, error: sentError } = await admin
    .from("notifications")
    .select("thread_key")
    .eq("source_type", "health_appointment")
    .in(
      "source_id",
      rows.map((row) => row.id as string),
    )
    .limit(10000);
  if (sentError) throw new Error(`runHealthReminderSweep failed to read what was sent: ${sentError.code ?? "unknown"}`);
  const sent = new Set(((sentRows ?? []) as { thread_key: string }[]).map((row) => row.thread_key));

  for (const row of rows) {
    const appointment = {
      startsAt: row.starts_at as string,
      remindAdvance: row.remind_advance as boolean,
      remindPreparation: row.remind_preparation as boolean,
      remindDayOf: row.remind_day_of as boolean,
      preparationNotes: row.preparation_notes as string | null,
    };
    const status = row.status as AppointmentStatus;
    const household = (Array.isArray(row.households) ? row.households[0] : row.households) as { timezone?: string | null } | null;
    const timeZone = household?.timezone ?? "Asia/Kolkata";

    for (const kind of dueRemindersFor(appointment, now, timeZone)) {
      const threadKey = `health_appointment:${row.id as string}:${kind}`;
      if (sent.has(threadKey)) continue;
      summary.checked += 1;

      const candidates = await candidatesFor(admin, row.household_id as string, row.member_id as string);
      const recipient = chooseRecipient(candidates);
      if (!recipient) {
        summary.skipped += 1;
        continue;
      }

      const event: HouseholdEvent = {
        threadKey,
        outcomeKey: threadKey,
        // Not "state_change": the decision engine only lets a state_change
        // through at medium/high risk, and an advance or preparation
        // reminder is worth telling someone about even though nothing is at
        // risk yet. "exception" is what reaches a person regardless of
        // risk level, as long as there is something to do about it.
        kind: "exception",
        aiResolvable: false,
        riskLevel: kind === "day_of" ? "medium" : "low",
        dueAt: new Date(appointment.startsAt),
        impact: REMINDER_MESSAGE[kind],
        recommendedAction: status === "proposed" ? { action: "confirm_appointment" } : { action: "view_appointment" },
      };

      const decision = decideNotification(event, { candidates, openThreadKeys: [], now });
      if (decision.kind !== "notify") {
        summary.skipped += 1;
        continue;
      }

      const created = await createNotification(admin, {
        householdId: row.household_id as string,
        decision,
        title: "Health appointment",
        body: decision.impact,
        category: "appointments",
        source: { type: "health_appointment", id: row.id as string },
      });
      if (created) summary.sent += 1;
      else summary.skipped += 1;
    }
  }

  return summary;
}
