import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "../observability/logger";
import { resolveNotifications, type ResolveReason } from "./resolve";

/**
 * Clearing what no longer applies (owner, 2026-11-22: "keep clearing
 * notifications as decisions are taken and notifications are stale or not
 * applicable anymore").
 *
 * The record-backed reminders (bills, school, meals, groceries, pets, family
 * plans) are already brought in line by `reconcile.ts`, and notices by
 * `notices-sweep.ts`. This pass covers what neither does, on the delivery
 * clock (`/api/v1/notifications/dispatch`), never on a person's request:
 * - a proposal or approval reminder whose question was answered, replaced
 *   or expired (`decided`, `superseded`, `expired`), or whose row is gone;
 * - a health appointment reminder whose appointment was completed, cancelled
 *   or removed (`settled`, `source_gone`), and a measurement reminder whose
 *   measurement was logged (the routine moved on: `settled`) or whose routine
 *   was paused or removed (`source_gone`);
 * - replies to, or a change to, an event that has ended (`past`);
 * - anything past its own `expires_at` (`expired`);
 * - an older open notification about the same thing as a newer one for the
 *   same person (`duplicate`).
 *
 * Never cleared just because time passed: money and health. A bill, a
 * "check before paying", a health appointment or a measurement stays until
 * its record shows it settled. A proposal or approval still waiting stays
 * (it has its own reminder and 48-hour expiry). Needs-you questions are not
 * notifications and keep their own default and deadline.
 *
 * The plan is pure (`planStale`); `sweepStaleNotifications` reads, plans and
 * resolves through `resolveNotifications`, bounded.
 */

export type OpenNotification = {
  id: string;
  household_id: string;
  recipient_member_id: string;
  source_type: string | null;
  source_id: string | null;
  thread_key: string;
  category: string | null;
  expires_at: string | null;
  scheduled_for: string;
  created_at: string;
};

export type StaleFacts = {
  /** conversation_actions by id: their status and why they closed. */
  actions: Map<string, { status: string; reason: string | null }>;
  /** approvals by id. */
  approvals: Map<string, { status: string }>;
  /** health_appointments by id. */
  appointments: Map<string, { status: string }>;
  /** health_measurement_routines by id. */
  routines: Map<string, { status: string; reminderEnabled: boolean; nextDueOn: string | null }>;
  /** family_events by id. */
  events: Map<string, { endsAt: string | null; startsAt: string | null; status: string | null }>;
};

/** The kinds this pass reads behind. */
export const STALE_SOURCE_TYPES = ["approval", "health_appointment", "health_routine", "event_replies", "event_change"] as const;
const DUPLICABLE = new Set<string>(STALE_SOURCE_TYPES);

/** Money and health: cleared only when the record shows them settled, never for time passing. */
const SENSITIVE_SOURCES = new Set(["obligation", "health_appointment", "health_routine", "health_checkup", "autopay"]);
export function isMoneyOrHealth(row: Pick<OpenNotification, "source_type" | "category">): boolean {
  return SENSITIVE_SOURCES.has(row.source_type ?? "") || row.category === "bills";
}
const TIME_ONLY: ReadonlySet<ResolveReason> = new Set(["past", "expired"]);

const LIVE_APPOINTMENT = new Set(["proposed", "confirmed"]);

function sourceReason(row: OpenNotification, facts: StaleFacts, now: Date): ResolveReason | null {
  const id = row.source_id;
  switch (row.source_type) {
    case "approval": {
      if (!id) return null;
      const action = facts.actions.get(id);
      if (action) {
        if (action.status === "proposed") return null;
        if (action.reason === "superseded") return "superseded";
        return action.status === "expired" ? "expired" : "decided";
      }
      const approval = facts.approvals.get(id);
      if (approval) {
        if (approval.status === "pending") return null;
        return approval.status === "expired" ? "expired" : "decided";
      }
      return "source_gone";
    }
    case "health_appointment": {
      if (!id) return null;
      const appointment = facts.appointments.get(id);
      if (!appointment) return "source_gone";
      return LIVE_APPOINTMENT.has(appointment.status) ? null : "settled";
    }
    case "health_routine": {
      if (!id) return null;
      const routine = facts.routines.get(id);
      if (!routine || routine.status !== "active" || !routine.reminderEnabled) return "source_gone";
      // The thread names the day it asked about; a logged measurement moves the routine past it.
      const asked = /:(\d{4}-\d{2}-\d{2})$/.exec(row.thread_key)?.[1];
      return asked && routine.nextDueOn && routine.nextDueOn > asked ? "settled" : null;
    }
    case "event_replies":
    case "event_change": {
      if (!id) return null;
      const event = facts.events.get(id);
      if (!event) return "source_gone";
      if (event.status === "cancelled" && row.source_type === "event_replies") return "settled";
      const end = event.endsAt ?? event.startsAt;
      return end && Date.parse(end) < now.getTime() ? "past" : null;
    }
    default:
      return null;
  }
}

/** What to clear, and why. Pure. */
export function planStale(rows: readonly OpenNotification[], facts: StaleFacts, now: Date): { id: string; householdId: string; reason: ResolveReason }[] {
  const out = new Map<string, { id: string; householdId: string; reason: ResolveReason }>();
  const allowed = (row: OpenNotification, reason: ResolveReason) => !(TIME_ONLY.has(reason) && isMoneyOrHealth(row));

  for (const row of rows) {
    const reason = sourceReason(row, facts, now) ?? (row.expires_at && Date.parse(row.expires_at) < now.getTime() ? "expired" : null);
    if (reason && allowed(row, reason)) out.set(row.id, { id: row.id, householdId: row.household_id, reason });
  }

  // The same thing twice for the same person: the newest stays.
  const groups = new Map<string, OpenNotification[]>();
  for (const row of rows) {
    if (!row.source_id || !DUPLICABLE.has(row.source_type ?? "") || out.has(row.id)) continue;
    const key = `${row.household_id}|${row.recipient_member_id}|${row.source_type}|${row.source_id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const newest = [...group].sort((a, b) => Date.parse(b.scheduled_for) - Date.parse(a.scheduled_for) || Date.parse(b.created_at) - Date.parse(a.created_at) || (a.id < b.id ? 1 : -1))[0]!;
    for (const row of group) if (row.id !== newest.id) out.set(row.id, { id: row.id, householdId: row.household_id, reason: "duplicate" });
  }
  return [...out.values()];
}

const COLUMNS = "id, household_id, recipient_member_id, source_type, source_id, thread_key, category, expires_at, scheduled_for, created_at";

async function rowsOf<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await query;
    return error ? [] : ((data as T[] | null) ?? []);
  } catch {
    return [];
  }
}

/** Reads what the open notifications point at, in one wave. A part that can't be read is left empty, so nothing it governs is cleared. */
async function loadFacts(admin: SupabaseClient, rows: readonly OpenNotification[]): Promise<StaleFacts & { complete: Set<string> }> {
  const idsOf = (types: string[]) => [...new Set(rows.filter((row) => types.includes(row.source_type ?? "") && row.source_id).map((row) => row.source_id!))];
  const approvalIds = idsOf(["approval"]);
  const appointmentIds = idsOf(["health_appointment"]);
  const routineIds = idsOf(["health_routine"]);
  const eventIds = idsOf(["event_replies", "event_change"]);
  const none = Promise.resolve({ data: [], error: null });
  const [actionsRead, approvalsRead, appointmentsRead, routinesRead, eventsRead] = await Promise.all([
    approvalIds.length ? Promise.resolve(admin.from("conversation_actions").select("id, approval_status, result").in("id", approvalIds)).then((r) => r, () => ({ data: null, error: true })) : none,
    approvalIds.length ? Promise.resolve(admin.from("approvals").select("id, status").in("id", approvalIds)).then((r) => r, () => ({ data: null, error: true })) : none,
    appointmentIds.length ? Promise.resolve(admin.from("health_appointments").select("id, status").in("id", appointmentIds)).then((r) => r, () => ({ data: null, error: true })) : none,
    routineIds.length ? Promise.resolve(admin.from("health_measurement_routines").select("id, status, reminder_enabled, next_due_on").in("id", routineIds)).then((r) => r, () => ({ data: null, error: true })) : none,
    eventIds.length ? Promise.resolve(admin.from("family_events").select("id, starts_at, ends_at, status").in("id", eventIds)).then((r) => r, () => ({ data: null, error: true })) : none,
  ]);
  // A read that failed must not look like "the record is gone": its kind is skipped entirely.
  const complete = new Set<string>();
  if (!actionsRead.error && !approvalsRead.error) complete.add("approval");
  if (!appointmentsRead.error) complete.add("health_appointment");
  if (!routinesRead.error) complete.add("health_routine");
  if (!eventsRead.error) complete.add("event_replies").add("event_change");
  type R = Record<string, unknown>;
  const list = (read: { data: unknown }) => ((read.data as R[] | null) ?? []);
  return {
    complete,
    actions: new Map(list(actionsRead).map((row) => [row.id as string, { status: row.approval_status as string, reason: ((row.result as R | null)?.reason as string | undefined) ?? null }])),
    approvals: new Map(list(approvalsRead).map((row) => [row.id as string, { status: row.status as string }])),
    appointments: new Map(list(appointmentsRead).map((row) => [row.id as string, { status: row.status as string }])),
    routines: new Map(list(routinesRead).map((row) => [row.id as string, { status: row.status as string, reminderEnabled: row.reminder_enabled !== false, nextDueOn: (row.next_due_on as string | null) ?? null }])),
    events: new Map(list(eventsRead).map((row) => [row.id as string, { startsAt: (row.starts_at as string | null) ?? null, endsAt: (row.ends_at as string | null) ?? null, status: (row.status as string | null) ?? null }])),
  };
}

/** What a pass would clear, without writing: the sweep's own read and plan (also a dry run). */
export async function findStaleNotifications(admin: SupabaseClient, now: Date = new Date(), options: { householdId?: string; limit?: number } = {}) {
  let query = admin
    .from("notifications")
    .select(COLUMNS)
    .in("status", ["generated", "delivered", "seen"])
    .or(`source_type.in.(${STALE_SOURCE_TYPES.join(",")}),expires_at.lt.${now.toISOString()}`)
    .order("created_at", { ascending: true })
    .limit(options.limit ?? 500);
  if (options.householdId) query = query.eq("household_id", options.householdId);
  const rows = await rowsOf<OpenNotification>(query);
  if (rows.length === 0) return [];
  const facts = await loadFacts(admin, rows);
  const governed = rows.filter((row) => !STALE_SOURCE_TYPES.includes(row.source_type as (typeof STALE_SOURCE_TYPES)[number]) || facts.complete.has(row.source_type!));
  return planStale(governed, facts, now);
}

/**
 * One bounded pass across households (or one household): reads the open
 * notifications this pass governs, plans, and resolves with reasons. Never
 * throws; a failed read clears nothing of its kind.
 */
export async function sweepStaleNotifications(
  admin: SupabaseClient,
  now: Date = new Date(),
  options: { householdId?: string; limit?: number } = {},
): Promise<Partial<Record<ResolveReason, number>>> {
  const counts: Partial<Record<ResolveReason, number>> = {};
  try {
    const plan = await findStaleNotifications(admin, now, options);
    const batches = new Map<string, { householdId: string; reason: ResolveReason; ids: string[] }>();
    for (const item of plan) {
      const key = `${item.householdId}|${item.reason}`;
      const batch = batches.get(key) ?? { householdId: item.householdId, reason: item.reason, ids: [] };
      batch.ids.push(item.id);
      batches.set(key, batch);
    }
    for (const batch of batches.values()) {
      const cleared = await resolveNotifications(admin, { householdId: batch.householdId, ids: batch.ids }, batch.reason, now);
      counts[batch.reason] = (counts[batch.reason] ?? 0) + cleared;
    }
  } catch (thrown) {
    log.warn("stale notification sweep failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
  }
  return counts;
}
