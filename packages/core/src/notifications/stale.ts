import type { SupabaseClient } from "@supabase/supabase-js";

import { checkModelDay, MOMENT_ACTIONS, momentOf, momentPassedLine, momentPayload, type MomentOccurrence, type WaitingProposal } from "../homebrain/proposal-moment";
import type { MomentDayJudge } from "../homebrain/proposal-moment-model";
import { targetOccurrences } from "../homebrain/proposal-moment-repository";
import { log } from "../observability/logger";
import { resolveNotifications, type ResolveReason } from "./resolve";
import { localMoment } from "./timing";

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
 * "check before paying" or a measurement stays until its record shows it
 * settled. The one exception (owner, 2026-11-22: "clear past health"): a
 * health appointment's reminders clear as `past` once the appointment's day
 * has ended on the household's clock; the appointment itself is untouched. A proposal or approval still waiting stays
 * (it has its own reminder and 48-hour expiry), except one about a single
 * moment that has passed (owner, 2026-11-23: `sweepMomentPassedProposals`
 * below): it expires as `moment_passed`, never done, and its reminders clear
 * as `past`. Needs-you questions are not
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
  appointments: Map<string, { status: string; startsAt?: string | null; timeZone?: string | null }>;
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
        if (action.reason === "moment_passed") return "past";
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
      if (!LIVE_APPOINTMENT.has(appointment.status)) return "settled";
      // Once the appointment's day has ended on the household's clock, its reminders have nothing left to say
      // (owner, 2026-11-22: "clear past health"). The appointment itself is left exactly as it is.
      if (appointment.startsAt) {
        const zone = appointment.timeZone ?? "Asia/Kolkata";
        if (localMoment(now, zone).dateKey > localMoment(new Date(appointment.startsAt), zone).dateKey) return "past";
      }
      return null;
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
  // The one time-based clear health allows: an appointment reminder once its day has ended. Never money, never a measurement.
  const allowed = (row: OpenNotification, reason: ResolveReason) =>
    !(TIME_ONLY.has(reason) && isMoneyOrHealth(row)) || (reason === "past" && row.source_type === "health_appointment" && row.category !== "bills");

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
    appointmentIds.length ? Promise.resolve(admin.from("health_appointments").select("id, status, starts_at, households(timezone)").in("id", appointmentIds)).then((r) => r, () => ({ data: null, error: true })) : none,
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
    appointments: new Map(
      list(appointmentsRead).map((row) => {
        const household = (Array.isArray(row.households) ? row.households[0] : row.households) as { timezone?: string | null } | null;
        return [row.id as string, { status: row.status as string, startsAt: (row.starts_at as string | null) ?? null, timeZone: household?.timezone ?? null }];
      }),
    ),
    routines: new Map(list(routinesRead).map((row) => [row.id as string, { status: row.status as string, reminderEnabled: row.reminder_enabled !== false, nextDueOn: (row.next_due_on as string | null) ?? null }])),
    events: new Map(list(eventsRead).map((row) => [row.id as string, { startsAt: (row.starts_at as string | null) ?? null, endsAt: (row.ends_at as string | null) ?? null, status: (row.status as string | null) ?? null }])),
  };
}

/** What a pass would clear, without writing: the sweep's own read and plan (also a dry run). */
export async function findStaleNotifications(admin: SupabaseClient, now: Date = new Date(), options: { householdId?: string; limit?: number } = {}) {
  const limit = options.limit ?? 500;
  // Two parameterised reads (never an interpolated filter expression), merged by id.
  const open = () => {
    const query = admin.from("notifications").select(COLUMNS).in("status", ["generated", "delivered", "seen"]);
    return options.householdId ? query.eq("household_id", options.householdId) : query;
  };
  const [bySource, byExpiry] = await Promise.all([
    rowsOf<OpenNotification>(open().in("source_type", [...STALE_SOURCE_TYPES]).order("created_at", { ascending: true }).limit(limit)),
    rowsOf<OpenNotification>(open().lt("expires_at", now.toISOString()).order("created_at", { ascending: true }).limit(limit)),
  ]);
  const rows = [...new Map([...bySource, ...byExpiry].map((row) => [row.id, row])).values()];
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

// --- A proposal whose moment has passed (owner, 2026-11-23) -------------------------------------

export type MomentRow = WaitingProposal & { id: string; household_id: string; session_id: string; timezone: string };

/** Which waiting proposals' moments have passed. Pure; `occurrences` are the calendar's, for proposals written before `effective_until`. */
export function planMomentPassed(rows: readonly MomentRow[], now: Date, occurrences: ReadonlyMap<string, readonly MomentOccurrence[]> = new Map()): { row: MomentRow; until: Date }[] {
  const out: { row: MomentRow; until: Date }[] = [];
  for (const row of rows) {
    const until = momentOf(row, row.timezone, occurrences.get(row.id));
    if (until && until.getTime() <= now.getTime()) out.push({ row, until });
  }
  return out;
}

/** At most this many unclear proposals go to a model per tick. */
const MODEL_ASKS_PER_TICK = 10;

/**
 * Expires every waiting proposal whose moment has passed, as not done
 * (`result.reason = "moment_passed"`), with its approval row; clears its
 * reminders as `past`; and adds one plain line to that conversation
 * ("Didn't move the morning walk: 5:20 am has passed."), never a push.
 * A proposal the rules could not place is asked of a model once, checked
 * against the calendar (`checkModelDay`). Payments, orders and a child's
 * request waiting on a grown-up are never touched here. Bounded; never throws.
 */
export async function sweepMomentPassedProposals(
  admin: SupabaseClient,
  now: Date = new Date(),
  options: { householdId?: string; limit?: number; judgeFor?: (householdId: string) => Promise<MomentDayJudge | null> } = {},
): Promise<{ expired: number; asked: number }> {
  const result = { expired: 0, asked: 0 };
  try {
    let query = admin
      .from("conversation_actions")
      .select("id, household_id, session_id, action_type, created_at, payload, households(timezone)")
      .eq("approval_status", "proposed")
      .in("action_type", [...MOMENT_ACTIONS])
      .gte("created_at", new Date(now.getTime() - 48 * 3_600_000).toISOString());
    if (options.householdId) query = query.eq("household_id", options.householdId);
    const rows = await rowsOf<Record<string, unknown>>(query.order("created_at", { ascending: true }).limit(options.limit ?? 200));
    const waiting: MomentRow[] = rows.map((row) => {
      const household = (Array.isArray(row.households) ? row.households[0] : row.households) as { timezone?: string | null } | null;
      return { id: row.id as string, household_id: row.household_id as string, session_id: row.session_id as string, action_type: row.action_type as string, created_at: row.created_at as string, payload: (row.payload as Record<string, unknown> | null) ?? null, timezone: household?.timezone ?? "Asia/Kolkata" };
    });

    // Proposals with no `effective_until` of their own are read against the calendar, and the unclear ones asked once.
    const occurrences = new Map<string, MomentOccurrence[]>();
    for (const row of waiting) {
      const payload = row.payload ?? {};
      if (typeof payload.effective_until === "string") continue;
      const parameters = (payload.parameters as Record<string, unknown> | undefined) ?? {};
      const what = String(parameters.what ?? parameters.title ?? "");
      const found = await targetOccurrences(admin, row.household_id, what, new Date(row.created_at), row.timezone);
      occurrences.set(row.id, found);
      const moment = payload.moment as { unclear?: unknown; checked?: unknown } | undefined;
      if (!moment?.unclear || moment.checked || result.asked >= MODEL_ASKS_PER_TICK || !options.judgeFor) continue;
      const judge = await options.judgeFor(row.household_id).catch(() => null);
      if (!judge) continue;
      result.asked += 1;
      const at = new Date(row.created_at);
      const day = await judge.day(localMoment(at, row.timezone).dateKey, [parameters.what, "to", parameters.to].filter(Boolean).join(" ")).catch(() => null);
      const reading = checkModelDay(day, { actionType: row.action_type, parameters, at, timezone: row.timezone, occurrences: found });
      const next = { ...payload, ...momentPayload(reading), moment: { ...(momentPayload(reading).moment as object | undefined), checked: true } };
      await admin.from("conversation_actions").update({ payload: next }).eq("id", row.id).eq("household_id", row.household_id).eq("approval_status", "proposed");
      row.payload = next;
    }

    for (const { row, until } of planMomentPassed(waiting, now, occurrences)) {
      // Closed the way "no" would close it: compare-and-swap on the status, so an answer in the same moment wins.
      const { data: closed } = await admin
        .from("conversation_actions")
        .update({ approval_status: "expired", decided_at: now.toISOString(), result: { reason: "moment_passed", effectiveUntil: until.toISOString() } })
        .eq("id", row.id)
        .eq("household_id", row.household_id)
        .eq("approval_status", "proposed")
        .select("id")
        .maybeSingle();
      if (!closed) continue;
      result.expired += 1;
      const referral = row.payload?.referral as { approvalId?: string } | undefined;
      await admin.from("approvals").update({ status: "expired", decided_at: now.toISOString() }).eq("household_id", row.household_id).eq("conversation_action_id", row.id).eq("status", "pending");
      await resolveNotifications(admin, { householdId: row.household_id, sourceType: "approval", sourceIds: referral?.approvalId ? [row.id, referral.approvalId] : [row.id] }, "past", now);
      // One plain line in that conversation; no push.
      await admin
        .from("conversation_messages")
        .insert({ household_id: row.household_id, session_id: row.session_id, role: "assistant", content: momentPassedLine(row), metadata: { kind: "moment_passed", actionId: row.id } });
    }
  } catch (thrown) {
    log.warn("moment-passed proposal sweep failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
  }
  return result;
}
