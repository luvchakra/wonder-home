import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import type { PrivacyScope } from "./repository";
import { createVital, type VitalType } from "./vitals";

/**
 * Measurement routines (story 21-007) — a household-configured recurring
 * commitment ("measure blood pressure every Sunday morning"), the same
 * `cadence_days`/`next_due_on` shape `health/checkups.ts` already uses.
 * `preferredTime` and `reminderEnabled` are what
 * `health/routine-reminders.ts`'s sweep reads to decide when, and whether,
 * to nudge. Completing a routine both advances its own schedule and
 * records the real vital reading in one step — `completeRoutine` is the
 * one function that does both, so a household never has to do the same
 * thing twice.
 */

export type { VitalType } from "./vitals";

export const ROUTINE_STATUSES = ["active", "dismissed"] as const;
export type RoutineStatus = (typeof ROUTINE_STATUSES)[number];

/** How many days out a due date counts as "due soon" rather than silent — same window `classifyCheckup` uses. */
export const ROUTINE_DUE_SOON_DAYS = 14;

type Row = Record<string, unknown>;

export type MeasurementRoutine = {
  id: string;
  householdId: string;
  memberId: string;
  vitalType: VitalType;
  customLabel: string | null;
  cadenceDays: number;
  preferredTime: string | null;
  reminderEnabled: boolean;
  privacyScope: PrivacyScope;
  status: RoutineStatus;
  nextDueOn: string;
  lastCompletedOn: string | null;
  notes: string | null;
  createdByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
};

const SELECT =
  "id, household_id, member_id, vital_type, custom_label, cadence_days, preferred_time, reminder_enabled, privacy_scope, status, next_due_on, last_completed_on, notes, created_by_member_id, created_at, updated_at";

function toRoutine(row: Row): MeasurementRoutine {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    memberId: row.member_id as string,
    vitalType: row.vital_type as VitalType,
    customLabel: (row.custom_label as string | null) ?? null,
    cadenceDays: Number(row.cadence_days),
    preferredTime: (row.preferred_time as string | null) ?? null,
    reminderEnabled: row.reminder_enabled as boolean,
    privacyScope: row.privacy_scope as PrivacyScope,
    status: row.status as RoutineStatus,
    nextDueOn: row.next_due_on as string,
    lastCompletedOn: (row.last_completed_on as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdByMemberId: (row.created_by_member_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listRoutines(
  supabase: SupabaseClient,
  householdId: string,
  options: { memberId?: string; statuses?: readonly RoutineStatus[] } = {},
): Promise<MeasurementRoutine[]> {
  let query = supabase.from("health_measurement_routines").select(SELECT).eq("household_id", householdId).order("next_due_on", { ascending: true });
  if (options.memberId) query = query.eq("member_id", options.memberId);
  if (options.statuses?.length) query = query.in("status", options.statuses);

  const { data, error } = await query;
  if (error) throw new Error(`listRoutines failed: ${error.code ?? "unknown"}`);
  return (data ?? []).map((row) => toRoutine(row as Row));
}

export async function getRoutine(supabase: SupabaseClient, householdId: string, id: string): Promise<MeasurementRoutine | null> {
  const { data, error } = await supabase.from("health_measurement_routines").select(SELECT).eq("household_id", householdId).eq("id", id).maybeSingle();
  if (error) throw new Error(`getRoutine failed: ${error.code ?? "unknown"}`);
  return data ? toRoutine(data as Row) : null;
}

/** Overdue (needs attention), due soon (worth surfacing), or silent — same discipline `classifyCheckup` already established. */
export type RoutineUrgency = "overdue" | "due_soon" | "silent";

export function classifyRoutine(routine: Pick<MeasurementRoutine, "status" | "nextDueOn">, today: Date = new Date()): RoutineUrgency {
  if (routine.status !== "active") return "silent";
  const todayIso = today.toISOString().slice(0, 10);
  if (routine.nextDueOn < todayIso) return "overdue";
  const dueSoonBy = new Date(today);
  dueSoonBy.setUTCDate(dueSoonBy.getUTCDate() + ROUTINE_DUE_SOON_DAYS);
  if (routine.nextDueOn <= dueSoonBy.toISOString().slice(0, 10)) return "due_soon";
  return "silent";
}

export type CreateRoutineInput = {
  memberId: string;
  vitalType: VitalType;
  customLabel?: string | null;
  cadenceDays: number;
  preferredTime?: string | null;
  reminderEnabled?: boolean;
  nextDueOn: string;
  privacyScope: PrivacyScope;
  notes?: string | null;
};

/** Configures a new recurring measurement for the caller's own record, or for a child they guard — RLS enforces which. */
export async function createRoutine(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, input: CreateRoutineInput): Promise<MeasurementRoutine> {
  const { data, error } = await supabase
    .from("health_measurement_routines")
    .insert({
      household_id: actor.householdId,
      member_id: input.memberId,
      vital_type: input.vitalType,
      custom_label: input.customLabel ?? null,
      cadence_days: input.cadenceDays,
      preferred_time: input.preferredTime ?? null,
      reminder_enabled: input.reminderEnabled ?? true,
      next_due_on: input.nextDueOn,
      privacy_scope: input.privacyScope,
      notes: input.notes ?? null,
      created_by_member_id: actor.memberId,
    })
    .select(SELECT)
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You may only add a routine for yourself, or a child you guard.");
    throw new Error(`createRoutine failed: ${error.code ?? "unknown"}`);
  }

  const routine = toRoutine(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.routine_created",
    targetTable: "health_measurement_routines",
    targetId: routine.id,
    metadata: { memberId: routine.memberId, vitalType: routine.vitalType },
  });

  return routine;
}

export type UpdateRoutineInput = {
  cadenceDays?: number;
  preferredTime?: string | null;
  reminderEnabled?: boolean;
  notes?: string | null;
  nextDueOn?: string;
};

/** Editing a routine's own cadence, reminder policy or content — not its lifecycle, see completeRoutine/dismissRoutine/reactivateRoutine. */
export async function updateRoutine(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, id: string, input: UpdateRoutineInput): Promise<MeasurementRoutine> {
  const patch: Row = {};
  if (input.cadenceDays !== undefined) patch.cadence_days = input.cadenceDays;
  if (input.preferredTime !== undefined) patch.preferred_time = input.preferredTime;
  if (input.reminderEnabled !== undefined) patch.reminder_enabled = input.reminderEnabled;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.nextDueOn !== undefined) patch.next_due_on = input.nextDueOn;

  const { data, error } = await supabase.from("health_measurement_routines").update(patch).eq("id", id).eq("household_id", actor.householdId).select(SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only update your own routine, or a child you guard's.");
    throw new Error(`updateRoutine failed: ${error.code ?? "unknown"}`);
  }

  const routine = toRoutine(data as Row);
  await auditChange({ householdId: actor.householdId, actorMemberId: actor.memberId, eventType: "health.routine_updated", targetTable: "health_measurement_routines", targetId: routine.id });
  return routine;
}

export async function dismissRoutine(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, id: string): Promise<MeasurementRoutine> {
  const { data, error } = await supabase.from("health_measurement_routines").update({ status: "dismissed" }).eq("id", id).eq("household_id", actor.householdId).select(SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only remove your own routine, or a child you guard's.");
    throw new Error(`dismissRoutine failed: ${error.code ?? "unknown"}`);
  }

  const routine = toRoutine(data as Row);
  await auditChange({ householdId: actor.householdId, actorMemberId: actor.memberId, eventType: "health.routine_dismissed", targetTable: "health_measurement_routines", targetId: routine.id });
  return routine;
}

export async function reactivateRoutine(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, id: string): Promise<MeasurementRoutine> {
  const { data, error } = await supabase.from("health_measurement_routines").update({ status: "active" }).eq("id", id).eq("household_id", actor.householdId).select(SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only bring back your own routine, or a child you guard's.");
    throw new Error(`reactivateRoutine failed: ${error.code ?? "unknown"}`);
  }

  const routine = toRoutine(data as Row);
  await auditChange({ householdId: actor.householdId, actorMemberId: actor.memberId, eventType: "health.routine_reactivated", targetTable: "health_measurement_routines", targetId: routine.id });
  return routine;
}

export type CompleteRoutineInput = {
  value: number;
  secondaryValue?: number | null;
  unit: string;
  notes?: string | null;
};

/**
 * Marks a routine done as of `completedOn` (defaults to today), records the
 * real vital reading it represents, and advances `next_due_on` by the
 * routine's own cadence — WonderHome only ever advances a schedule the
 * household itself configured, never invents one.
 */
export async function completeRoutine(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  id: string,
  input: CompleteRoutineInput,
  completedOn: string = new Date().toISOString().slice(0, 10),
): Promise<{ routine: MeasurementRoutine; vital: Awaited<ReturnType<typeof createVital>> }> {
  const current = await getRoutine(supabase, actor.householdId, id);
  if (!current) throw ApiError.notFound("That routine could not be found.");

  const vital = await createVital(supabase, actor, {
    memberId: current.memberId,
    vitalType: current.vitalType,
    customLabel: current.customLabel,
    value: input.value,
    secondaryValue: input.secondaryValue ?? null,
    unit: input.unit,
    measuredAt: `${completedOn}T00:00:00.000Z`,
    privacyScope: current.privacyScope,
    notes: input.notes ?? null,
    routineId: current.id,
  });

  const next = new Date(`${completedOn}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + current.cadenceDays);

  const { data, error } = await supabase
    .from("health_measurement_routines")
    .update({ last_completed_on: completedOn, next_due_on: next.toISOString().slice(0, 10) })
    .eq("id", id)
    .eq("household_id", actor.householdId)
    .select(SELECT)
    .single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only complete your own routine, or a child you guard's.");
    throw new Error(`completeRoutine failed: ${error.code ?? "unknown"}`);
  }

  const routine = toRoutine(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.routine_completed",
    targetTable: "health_measurement_routines",
    targetId: routine.id,
    metadata: { completedOn, nextDueOn: routine.nextDueOn, vitalId: vital.id },
  });

  return { routine, vital };
}
