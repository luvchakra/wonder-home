import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import type { PrivacyScope } from "./repository";

/**
 * Checkups & preventive care (story 21-004) — a household-defined recurring
 * commitment, never a schedule WonderHome invents on its own. See the
 * migration's own comment for what each `source` value means and why
 * `linked_appointment_id`/`health_appointments.checkup_id` point at each
 * other.
 */

export const CHECKUP_TYPES = [
  "doctor",
  "dentist",
  "eye_care",
  "physiotherapy",
  "dermatology",
  "specialist",
  "diagnostic",
  "vaccination",
  "screening",
  "other",
] as const;
export type CheckupType = (typeof CHECKUP_TYPES)[number];

export const CHECKUP_SOURCES = ["user_defined", "doctor_recommended", "imported_appointment", "configured_plan", "informational_template"] as const;
export type CheckupSource = (typeof CHECKUP_SOURCES)[number];

export const CHECKUP_STATUSES = ["active", "dismissed"] as const;
export type CheckupStatus = (typeof CHECKUP_STATUSES)[number];

/** How many days out a due date counts as "due soon" rather than silent. */
export const DUE_SOON_DAYS = 14;

type Row = Record<string, unknown>;

export type HealthCheckup = {
  id: string;
  householdId: string;
  memberId: string;
  label: string;
  checkupType: CheckupType;
  source: CheckupSource;
  cadenceDays: number | null;
  nextDueOn: string;
  lastCompletedOn: string | null;
  privacyScope: PrivacyScope;
  status: CheckupStatus;
  linkedAppointmentId: string | null;
  notes: string | null;
  createdByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
};

const SELECT =
  "id, household_id, member_id, label, checkup_type, source, cadence_days, next_due_on, last_completed_on, privacy_scope, status, linked_appointment_id, notes, created_by_member_id, created_at, updated_at";

function toCheckup(row: Row): HealthCheckup {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    memberId: row.member_id as string,
    label: row.label as string,
    checkupType: row.checkup_type as CheckupType,
    source: row.source as CheckupSource,
    cadenceDays: (row.cadence_days as number | null) ?? null,
    nextDueOn: row.next_due_on as string,
    lastCompletedOn: (row.last_completed_on as string | null) ?? null,
    privacyScope: row.privacy_scope as PrivacyScope,
    status: row.status as CheckupStatus,
    linkedAppointmentId: (row.linked_appointment_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdByMemberId: (row.created_by_member_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listCheckups(
  supabase: SupabaseClient,
  householdId: string,
  options: { memberId?: string; statuses?: readonly CheckupStatus[] } = {},
): Promise<HealthCheckup[]> {
  let query = supabase.from("health_checkups").select(SELECT).eq("household_id", householdId).order("next_due_on", { ascending: true });
  if (options.memberId) query = query.eq("member_id", options.memberId);
  if (options.statuses?.length) query = query.in("status", options.statuses);

  const { data, error } = await query;
  if (error) throw new Error(`listCheckups failed: ${error.code ?? "unknown"}`);
  return (data ?? []).map((row) => toCheckup(row as Row));
}

export async function getCheckup(supabase: SupabaseClient, householdId: string, id: string): Promise<HealthCheckup | null> {
  const { data, error } = await supabase.from("health_checkups").select(SELECT).eq("household_id", householdId).eq("id", id).maybeSingle();
  if (error) throw new Error(`getCheckup failed: ${error.code ?? "unknown"}`);
  return data ? toCheckup(data as Row) : null;
}

/** Overdue (needs attention), due soon (worth surfacing), or silent — the Overview never shows a checkup that is neither. */
export type CheckupUrgency = "overdue" | "due_soon" | "silent";

export function classifyCheckup(checkup: Pick<HealthCheckup, "status" | "nextDueOn">, today: Date = new Date()): CheckupUrgency {
  if (checkup.status !== "active") return "silent";
  const todayIso = today.toISOString().slice(0, 10);
  if (checkup.nextDueOn < todayIso) return "overdue";
  const dueSoonBy = new Date(today);
  dueSoonBy.setUTCDate(dueSoonBy.getUTCDate() + DUE_SOON_DAYS);
  const dueSoonIso = dueSoonBy.toISOString().slice(0, 10);
  if (checkup.nextDueOn <= dueSoonIso) return "due_soon";
  return "silent";
}

export type CreateCheckupInput = {
  memberId: string;
  label: string;
  checkupType: CheckupType;
  source?: CheckupSource;
  cadenceDays?: number | null;
  nextDueOn: string;
  privacyScope: PrivacyScope;
  notes?: string | null;
};

/** Records a new checkup for the caller's own record, or for a child they guard — RLS enforces which. */
export async function createCheckup(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, input: CreateCheckupInput): Promise<HealthCheckup> {
  const { data, error } = await supabase
    .from("health_checkups")
    .insert({
      household_id: actor.householdId,
      member_id: input.memberId,
      label: input.label,
      checkup_type: input.checkupType,
      source: input.source ?? "user_defined",
      cadence_days: input.cadenceDays ?? null,
      next_due_on: input.nextDueOn,
      privacy_scope: input.privacyScope,
      notes: input.notes ?? null,
      created_by_member_id: actor.memberId,
    })
    .select(SELECT)
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You may only add a checkup for yourself, or a child you guard.");
    throw new Error(`createCheckup failed: ${error.code ?? "unknown"}`);
  }

  const checkup = toCheckup(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.checkup_created",
    targetTable: "health_checkups",
    targetId: checkup.id,
    metadata: { memberId: checkup.memberId, checkupType: checkup.checkupType },
  });

  return checkup;
}

export type UpdateCheckupInput = {
  label?: string;
  checkupType?: CheckupType;
  cadenceDays?: number | null;
  notes?: string | null;
};

/** Editing a checkup's own content — not its due date or status, see rescheduleCheckup/completeCheckup/dismissCheckup. */
export async function updateCheckup(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, id: string, input: UpdateCheckupInput): Promise<HealthCheckup> {
  const patch: Row = {};
  if (input.label !== undefined) patch.label = input.label;
  if (input.checkupType !== undefined) patch.checkup_type = input.checkupType;
  if (input.cadenceDays !== undefined) patch.cadence_days = input.cadenceDays;
  if (input.notes !== undefined) patch.notes = input.notes;

  const { data, error } = await supabase.from("health_checkups").update(patch).eq("id", id).eq("household_id", actor.householdId).select(SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only update your own checkup, or a child you guard's.");
    throw new Error(`updateCheckup failed: ${error.code ?? "unknown"}`);
  }

  const checkup = toCheckup(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.checkup_updated",
    targetTable: "health_checkups",
    targetId: checkup.id,
  });

  return checkup;
}

/** Moves a checkup's next due date without touching anything else it carries. */
export async function rescheduleCheckup(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, id: string, nextDueOn: string): Promise<HealthCheckup> {
  const { data, error } = await supabase.from("health_checkups").update({ next_due_on: nextDueOn }).eq("id", id).eq("household_id", actor.householdId).select(SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only reschedule your own checkup, or a child you guard's.");
    throw new Error(`rescheduleCheckup failed: ${error.code ?? "unknown"}`);
  }

  const checkup = toCheckup(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.checkup_rescheduled",
    targetTable: "health_checkups",
    targetId: checkup.id,
    metadata: { nextDueOn },
  });

  return checkup;
}

/** Removing a checkup a household no longer wants — never one-way, see reactivateCheckup (CLAUDE.md rule 12). */
export async function dismissCheckup(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, id: string): Promise<HealthCheckup> {
  const { data, error } = await supabase.from("health_checkups").update({ status: "dismissed" }).eq("id", id).eq("household_id", actor.householdId).select(SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only remove your own checkup, or a child you guard's.");
    throw new Error(`dismissCheckup failed: ${error.code ?? "unknown"}`);
  }

  const checkup = toCheckup(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.checkup_dismissed",
    targetTable: "health_checkups",
    targetId: checkup.id,
  });

  return checkup;
}

export async function reactivateCheckup(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, id: string): Promise<HealthCheckup> {
  const { data, error } = await supabase.from("health_checkups").update({ status: "active" }).eq("id", id).eq("household_id", actor.householdId).select(SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only bring back your own checkup, or a child you guard's.");
    throw new Error(`reactivateCheckup failed: ${error.code ?? "unknown"}`);
  }

  const checkup = toCheckup(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.checkup_reactivated",
    targetTable: "health_checkups",
    targetId: checkup.id,
  });

  return checkup;
}

/**
 * Marks a checkup done as of `completedOn` (defaults to today) and, when a
 * cadence is configured, computes the next `next_due_on` from that date —
 * WonderHome only ever advances a schedule the household itself configured,
 * never invents one. A one-off checkup (no cadence) is dismissed instead,
 * since there is no next occurrence to wait for. Clears
 * `linked_appointment_id` either way — completing it means it is no longer
 * waiting on a booked appointment.
 */
export async function completeCheckup(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  id: string,
  completedOn: string = new Date().toISOString().slice(0, 10),
): Promise<HealthCheckup> {
  const current = await getCheckup(supabase, actor.householdId, id);
  if (!current) throw ApiError.notFound("That checkup could not be found.");

  const patch: Row = { last_completed_on: completedOn, linked_appointment_id: null };
  if (current.cadenceDays) {
    const next = new Date(`${completedOn}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + current.cadenceDays);
    patch.next_due_on = next.toISOString().slice(0, 10);
  } else {
    patch.status = "dismissed";
  }

  const { data, error } = await supabase.from("health_checkups").update(patch).eq("id", id).eq("household_id", actor.householdId).select(SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only complete your own checkup, or a child you guard's.");
    throw new Error(`completeCheckup failed: ${error.code ?? "unknown"}`);
  }

  const checkup = toCheckup(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.checkup_completed",
    targetTable: "health_checkups",
    targetId: checkup.id,
    metadata: { completedOn, nextDueOn: checkup.status === "active" ? checkup.nextDueOn : null },
  });

  return checkup;
}

/**
 * The bridge from an appointment's own status change to the checkup it is
 * linked to (`health_appointments.checkup_id`) — called from both the
 * server action and the API route that can change an appointment's status,
 * so a checkup advances the same way regardless of which one a household or
 * a governed tool used. A completed appointment completes its checkup
 * (using the appointment's own date, since that is when the visit actually
 * happened); a cancelled one only clears the link, so the checkup is free
 * to be booked again without ever being silently marked done.
 */
export async function syncCheckupForAppointment(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  appointment: { id: string; checkupId: string | null; status: string; startsAt: string },
): Promise<HealthCheckup | null> {
  if (!appointment.checkupId) return null;

  if (appointment.status === "completed") {
    return completeCheckup(supabase, actor, appointment.checkupId, appointment.startsAt.slice(0, 10));
  }

  if (appointment.status === "cancelled") {
    await supabase
      .from("health_checkups")
      .update({ linked_appointment_id: null })
      .eq("id", appointment.checkupId)
      .eq("household_id", actor.householdId)
      .eq("linked_appointment_id", appointment.id);
    return getCheckup(supabase, actor.householdId, appointment.checkupId);
  }

  return null;
}
