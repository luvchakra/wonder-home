import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import { createEvent } from "../family/repository";
import { getCheckup } from "./checkups";
import type { PrivacyScope } from "./repository";

/**
 * Health appointments (story 21-002).
 *
 * Two privacy-driven scope decisions live here rather than in the migration
 * comment alone, because they shape every function below:
 *
 * - `schedule_conflicts` and `family_events` are both household-wide visible
 *   by design, with no per-row privacy scope of their own. A conflict is
 *   only ever persisted there, and a calendar-sync event only ever created,
 *   for a `household_operational`-scope appointment — the one case where the
 *   household already may see it. A `private`/`selected_family`
 *   appointment's conflicts are still detected (so the person creating it
 *   is warned) but returned only in the function's own result, never
 *   written anywhere household-wide.
 * - A persisted conflict's label names the person and says "appointment" —
 *   never the type, provider, facility or notes.
 */

export const APPOINTMENT_TYPES = [
  "doctor",
  "dentist",
  "eye_care",
  "physiotherapy",
  "dermatology",
  "specialist",
  "diagnostic",
  "vaccination",
  "mental_wellness",
  "other",
] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

export const APPOINTMENT_STATUSES = ["proposed", "confirmed", "completed", "cancelled", "rescheduled"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Statuses the reminder sweep and conflict detection still consider live. */
const OPEN_STATUSES: readonly AppointmentStatus[] = ["proposed", "confirmed"];

type Row = Record<string, unknown>;

export type HealthAppointment = {
  id: string;
  householdId: string;
  memberId: string;
  appointmentType: AppointmentType;
  status: AppointmentStatus;
  privacyScope: PrivacyScope;
  startsAt: string;
  endsAt: string | null;
  provider: string | null;
  facility: string | null;
  location: string | null;
  preparationNotes: string | null;
  notes: string | null;
  remindAdvance: boolean;
  remindPreparation: boolean;
  remindDayOf: boolean;
  calendarSync: boolean;
  familyEventId: string | null;
  rescheduledFromId: string | null;
  checkupId: string | null;
  createdByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
};

const SELECT =
  "id, household_id, member_id, appointment_type, status, privacy_scope, starts_at, ends_at, provider, facility, location, preparation_notes, notes, remind_advance, remind_preparation, remind_day_of, calendar_sync, family_event_id, rescheduled_from_id, checkup_id, created_by_member_id, created_at, updated_at";

function toAppointment(row: Row): HealthAppointment {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    memberId: row.member_id as string,
    appointmentType: row.appointment_type as AppointmentType,
    status: row.status as AppointmentStatus,
    privacyScope: row.privacy_scope as PrivacyScope,
    startsAt: row.starts_at as string,
    endsAt: (row.ends_at as string | null) ?? null,
    provider: (row.provider as string | null) ?? null,
    facility: (row.facility as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    preparationNotes: (row.preparation_notes as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    remindAdvance: row.remind_advance as boolean,
    remindPreparation: row.remind_preparation as boolean,
    remindDayOf: row.remind_day_of as boolean,
    calendarSync: row.calendar_sync as boolean,
    familyEventId: (row.family_event_id as string | null) ?? null,
    rescheduledFromId: (row.rescheduled_from_id as string | null) ?? null,
    checkupId: (row.checkup_id as string | null) ?? null,
    createdByMemberId: (row.created_by_member_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listAppointments(
  supabase: SupabaseClient,
  householdId: string,
  options: { memberId?: string; statuses?: readonly AppointmentStatus[] } = {},
): Promise<HealthAppointment[]> {
  let query = supabase.from("health_appointments").select(SELECT).eq("household_id", householdId).order("starts_at", { ascending: true });
  if (options.memberId) query = query.eq("member_id", options.memberId);
  if (options.statuses?.length) query = query.in("status", options.statuses);

  const { data, error } = await query;
  if (error) throw new Error(`listAppointments failed: ${error.code ?? "unknown"}`);
  return (data ?? []).map((row) => toAppointment(row as Row));
}

export async function getAppointment(supabase: SupabaseClient, householdId: string, id: string): Promise<HealthAppointment | null> {
  const { data, error } = await supabase.from("health_appointments").select(SELECT).eq("household_id", householdId).eq("id", id).maybeSingle();
  if (error) throw new Error(`getAppointment failed: ${error.code ?? "unknown"}`);
  return data ? toAppointment(data as Row) : null;
}

export type TimeWindow = { kind: "event" | "health_appointment"; id: string; label: string; startsAt: string; endsAt: string };

/** Two windows conflict when they overlap at all — a shared boundary instant does not count as an overlap. */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() < new Date(bEnd).getTime() && new Date(bStart).getTime() < new Date(aEnd).getTime();
}

export type Conflict = { with: TimeWindow; overlapStartsAt: string; overlapEndsAt: string };

/** Every existing window the candidate overlaps — pure, so it is testable without a database. */
export function findConflicts(candidate: { startsAt: string; endsAt: string }, existing: readonly TimeWindow[]): Conflict[] {
  return existing
    .filter((window) => overlaps(candidate.startsAt, candidate.endsAt, window.startsAt, window.endsAt))
    .map((window) => ({
      with: window,
      overlapStartsAt: new Date(Math.max(new Date(candidate.startsAt).getTime(), new Date(window.startsAt).getTime())).toISOString(),
      overlapEndsAt: new Date(Math.min(new Date(candidate.endsAt).getTime(), new Date(window.endsAt).getTime())).toISOString(),
    }));
}

const DUPLICATE_WINDOW_DAYS = 3;

/**
 * A likely duplicate: the same person, the same appointment type, within a
 * few days of an existing open appointment. Surfaced as a warning on create
 * — never blocked, since a real duplicate visit does happen (a follow-up
 * booked before the first one's outcome is known).
 */
export function findLikelyDuplicate(
  candidate: { memberId: string; appointmentType: AppointmentType; startsAt: string },
  existing: readonly HealthAppointment[],
): HealthAppointment | null {
  const candidateTime = new Date(candidate.startsAt).getTime();
  const windowMs = DUPLICATE_WINDOW_DAYS * 86_400_000;

  return (
    existing.find(
      (appointment) =>
        appointment.memberId === candidate.memberId &&
        appointment.appointmentType === candidate.appointmentType &&
        OPEN_STATUSES.includes(appointment.status) &&
        Math.abs(new Date(appointment.startsAt).getTime() - candidateTime) <= windowMs,
    ) ?? null
  );
}

async function existingWindowsFor(supabase: SupabaseClient, householdId: string, memberId: string, excludeAppointmentId?: string): Promise<TimeWindow[]> {
  const [events, appointments] = await Promise.all([
    supabase
      .from("family_events")
      .select("id, title, starts_at, ends_at")
      .eq("household_id", householdId)
      .eq("owner_member_id", memberId)
      .in("status", ["proposed", "planned", "confirmed"]),
    supabase
      .from("health_appointments")
      .select("id, starts_at, ends_at")
      .eq("household_id", householdId)
      .eq("member_id", memberId)
      .in("status", OPEN_STATUSES),
  ]);

  const eventWindows: TimeWindow[] = ((events.data as Row[] | null) ?? []).map((row) => ({
    kind: "event",
    id: row.id as string,
    label: row.title as string,
    startsAt: row.starts_at as string,
    endsAt: row.ends_at as string,
  }));

  const appointmentWindows: TimeWindow[] = ((appointments.data as Row[] | null) ?? [])
    .filter((row) => row.id !== excludeAppointmentId && row.ends_at)
    .map((row) => ({
      kind: "health_appointment",
      id: row.id as string,
      label: "an appointment",
      startsAt: row.starts_at as string,
      endsAt: row.ends_at as string,
    }));

  return [...eventWindows, ...appointmentWindows];
}

/** A conflict is only ever written household-wide for a household_operational appointment — see the module comment. */
async function persistConflictIfOperational(
  supabase: SupabaseClient,
  input: { householdId: string; memberDisplayName: string; appointment: { id: string; startsAt: string; endsAt: string }; privacyScope: PrivacyScope },
  conflicts: readonly Conflict[],
): Promise<void> {
  if (input.privacyScope !== "household_operational" || conflicts.length === 0) return;

  const label = `${input.memberDisplayName} — appointment`;
  await Promise.all(
    conflicts.map((conflict) =>
      supabase.from("schedule_conflicts").upsert(
        {
          household_id: input.householdId,
          left_kind: "health_appointment",
          left_id: input.appointment.id,
          left_label: label,
          right_kind: conflict.with.kind,
          right_id: conflict.with.id,
          right_label: conflict.with.kind === "health_appointment" ? label : conflict.with.label,
          overlap_starts_at: conflict.overlapStartsAt,
          overlap_ends_at: conflict.overlapEndsAt,
          proposed_action: "ask_household",
          proposed_detail: `${input.memberDisplayName} has two things booked at the same time.`,
        },
        { onConflict: "household_id,left_id,right_id,overlap_starts_at", ignoreDuplicates: true },
      ),
    ),
  );
}

export type CreateAppointmentInput = {
  memberId: string;
  memberDisplayName: string;
  appointmentType: AppointmentType;
  privacyScope: PrivacyScope;
  startsAt: string;
  endsAt?: string | null;
  provider?: string | null;
  facility?: string | null;
  location?: string | null;
  preparationNotes?: string | null;
  notes?: string | null;
  remindAdvance?: boolean;
  remindPreparation?: boolean;
  remindDayOf?: boolean;
  calendarSync?: boolean;
  /** Links this appointment as the next occurrence of a checkup (story 21-004) — see the migration's own comment. */
  checkupId?: string | null;
};

export type CreateAppointmentResult = {
  appointment: HealthAppointment;
  conflicts: Conflict[];
  duplicateOf: HealthAppointment | null;
};

/**
 * Creates an appointment for the caller's own record, or for a child they
 * guard — RLS enforces which (`health_appointments_insert_self_or_guardian`);
 * this function only translates a refusal into a household-facing message.
 *
 * Conflicts and a likely duplicate are always computed and returned so the
 * creator sees them immediately; only a household_operational appointment's
 * conflicts are also written to the shared `schedule_conflicts` table, and
 * only a household_operational appointment's calendar-sync request creates
 * a real `family_events` row — see the module comment.
 */
export async function createAppointment(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  input: CreateAppointmentInput,
): Promise<CreateAppointmentResult> {
  const startsAt = input.startsAt;
  const endsAt = input.endsAt ?? null;

  const [existingWindows, existingAppointments] = await Promise.all([
    existingWindowsFor(supabase, actor.householdId, input.memberId),
    listAppointments(supabase, actor.householdId, { memberId: input.memberId, statuses: OPEN_STATUSES }),
  ]);

  const conflicts = endsAt ? findConflicts({ startsAt, endsAt }, existingWindows) : [];
  const duplicateOf = findLikelyDuplicate({ memberId: input.memberId, appointmentType: input.appointmentType, startsAt }, existingAppointments);

  // A checkup id is only ever honoured when it genuinely belongs to this
  // household and this actor may see it — never trusted as-is, since it can
  // arrive from an API caller rather than the UI's own checkup list.
  const linkedCheckup = input.checkupId ? await getCheckup(supabase, actor.householdId, input.checkupId) : null;

  const { data, error } = await supabase
    .from("health_appointments")
    .insert({
      household_id: actor.householdId,
      member_id: input.memberId,
      appointment_type: input.appointmentType,
      privacy_scope: input.privacyScope,
      starts_at: startsAt,
      ends_at: endsAt,
      provider: input.provider ?? null,
      facility: input.facility ?? null,
      location: input.location ?? null,
      preparation_notes: input.preparationNotes ?? null,
      notes: input.notes ?? null,
      remind_advance: input.remindAdvance ?? true,
      remind_preparation: input.remindPreparation ?? false,
      remind_day_of: input.remindDayOf ?? true,
      calendar_sync: input.calendarSync ?? false,
      checkup_id: linkedCheckup?.id ?? null,
      created_by_member_id: actor.memberId,
    })
    .select(SELECT)
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You may only book an appointment for yourself, or a child you guard.");
    throw new Error(`createAppointment failed: ${error.code ?? "unknown"}`);
  }

  let appointment = toAppointment(data as Row);

  if (conflicts.length > 0) {
    await persistConflictIfOperational(
      supabase,
      { householdId: actor.householdId, memberDisplayName: input.memberDisplayName, appointment: { id: appointment.id, startsAt, endsAt: endsAt! }, privacyScope: input.privacyScope },
      conflicts,
    );
  }

  if (linkedCheckup) {
    await supabase.from("health_checkups").update({ linked_appointment_id: appointment.id }).eq("id", linkedCheckup.id).eq("household_id", actor.householdId);
  }

  if (input.calendarSync && input.privacyScope === "household_operational" && endsAt) {
    const event = await createEvent(supabase, {
      householdId: actor.householdId,
      title: `${input.memberDisplayName} — appointment`,
      kind: "appointment",
      startsAt,
      endsAt,
      ownerMemberId: input.memberId,
    });
    await supabase.from("health_appointments").update({ family_event_id: event.id }).eq("id", appointment.id);
    appointment = { ...appointment, familyEventId: event.id };
  }

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.appointment_created",
    targetTable: "health_appointments",
    targetId: appointment.id,
    metadata: { memberId: appointment.memberId, appointmentType: appointment.appointmentType },
  });

  return { appointment, conflicts, duplicateOf };
}

export type UpdateAppointmentInput = Partial<
  Pick<
    CreateAppointmentInput,
    "provider" | "facility" | "location" | "preparationNotes" | "notes" | "remindAdvance" | "remindPreparation" | "remindDayOf"
  >
>;

/** Editing an appointment's own details — not its time or status, see rescheduleAppointment and setAppointmentStatus. */
export async function updateAppointment(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  id: string,
  input: UpdateAppointmentInput,
): Promise<HealthAppointment> {
  const patch: Row = {};
  if (input.provider !== undefined) patch.provider = input.provider;
  if (input.facility !== undefined) patch.facility = input.facility;
  if (input.location !== undefined) patch.location = input.location;
  if (input.preparationNotes !== undefined) patch.preparation_notes = input.preparationNotes;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.remindAdvance !== undefined) patch.remind_advance = input.remindAdvance;
  if (input.remindPreparation !== undefined) patch.remind_preparation = input.remindPreparation;
  if (input.remindDayOf !== undefined) patch.remind_day_of = input.remindDayOf;

  const { data, error } = await supabase.from("health_appointments").update(patch).eq("id", id).eq("household_id", actor.householdId).select(SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only update your own appointment, or a child you guard's.");
    throw new Error(`updateAppointment failed: ${error.code ?? "unknown"}`);
  }

  const appointment = toAppointment(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.appointment_updated",
    targetTable: "health_appointments",
    targetId: appointment.id,
  });

  return appointment;
}

const STATUS_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  proposed: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  rescheduled: [],
};

/**
 * Confirm, complete or cancel — never a direct move to `rescheduled`, which
 * only `rescheduleAppointment` produces (it needs a new time, not just a
 * status). Completing or cancelling takes the appointment out of
 * `OPEN_STATUSES`, which is what the reminder sweep filters on — so this is
 * the whole mechanism behind "suppresses its remaining reminders."
 */
export async function setAppointmentStatus(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  id: string,
  status: Exclude<AppointmentStatus, "rescheduled">,
): Promise<HealthAppointment> {
  const current = await getAppointment(supabase, actor.householdId, id);
  if (!current) throw ApiError.notFound("That appointment could not be found.");
  if (!STATUS_TRANSITIONS[current.status].includes(status)) {
    throw ApiError.badRequest(`An appointment that is ${current.status} cannot become ${status}.`);
  }

  const { data, error } = await supabase.from("health_appointments").update({ status }).eq("id", id).eq("household_id", actor.householdId).select(SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only change your own appointment, or a child you guard's.");
    throw new Error(`setAppointmentStatus failed: ${error.code ?? "unknown"}`);
  }

  const appointment = toAppointment(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.appointment_status_changed",
    targetTable: "health_appointments",
    targetId: appointment.id,
    metadata: { from: current.status, to: status },
  });

  return appointment;
}

/**
 * Moves an appointment to a new time by marking the old row `rescheduled`
 * and creating a new one that points back to it — the old row's own history
 * (when it was proposed, confirmed, what reminders already went out) stays
 * intact rather than being overwritten.
 */
export async function rescheduleAppointment(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  id: string,
  input: { memberDisplayName: string; startsAt: string; endsAt?: string | null },
): Promise<CreateAppointmentResult> {
  const current = await getAppointment(supabase, actor.householdId, id);
  if (!current) throw ApiError.notFound("That appointment could not be found.");
  if (!OPEN_STATUSES.includes(current.status)) {
    throw ApiError.badRequest(`An appointment that is ${current.status} cannot be rescheduled.`);
  }

  const result = await createAppointment(supabase, actor, {
    memberId: current.memberId,
    memberDisplayName: input.memberDisplayName,
    appointmentType: current.appointmentType,
    privacyScope: current.privacyScope,
    startsAt: input.startsAt,
    endsAt: input.endsAt ?? current.endsAt,
    provider: current.provider,
    facility: current.facility,
    location: current.location,
    preparationNotes: current.preparationNotes,
    notes: current.notes,
    remindAdvance: current.remindAdvance,
    remindPreparation: current.remindPreparation,
    remindDayOf: current.remindDayOf,
    calendarSync: current.calendarSync,
    checkupId: current.checkupId,
  });

  await supabase.from("health_appointments").update({ rescheduled_from_id: id }).eq("id", result.appointment.id);
  const { error } = await supabase.from("health_appointments").update({ status: "rescheduled" }).eq("id", id).eq("household_id", actor.householdId);
  if (error) throw new Error(`rescheduleAppointment failed to close the old appointment: ${error.code ?? "unknown"}`);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.appointment_status_changed",
    targetTable: "health_appointments",
    targetId: id,
    metadata: { from: current.status, to: "rescheduled", rescheduledToId: result.appointment.id },
  });

  return { ...result, appointment: { ...result.appointment, rescheduledFromId: id } };
}
