import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import type { PrivacyScope } from "./repository";

/**
 * Vitals (story 21-007) — a single structured reading, always what the
 * household actually recorded. Closer to `records.ts` than `issues.ts`:
 * there is no lifecycle to move a reading through, only content to correct
 * and a removal that never orphans history (CLAUDE.md rule 12), so this
 * mirrors `records.ts`'s active/archived shape rather than `issues.ts`'s
 * status transitions.
 *
 * `unit` is always what the household typed — never a default this module
 * invents. `secondaryValue` exists only for a paired reading (blood
 * pressure: `value` is systolic, `secondaryValue` is diastolic); every other
 * vital type leaves it null.
 */

export const VITAL_TYPES = [
  "weight",
  "height",
  "temperature",
  "blood_pressure",
  "pulse",
  "steps",
  "distance",
  "exercise_duration",
  "resting_heart_rate",
  "custom",
] as const;
export type VitalType = (typeof VITAL_TYPES)[number];

export const VITAL_STATUSES = ["active", "archived"] as const;
export type VitalStatus = (typeof VITAL_STATUSES)[number];

export const VITAL_SOURCE_TYPES = ["home_talk", "home_send_email", "home_send_document", "manual_entry", "calendar", "future_health_integration"] as const;
export type VitalSourceType = (typeof VITAL_SOURCE_TYPES)[number];

type Row = Record<string, unknown>;

export type HealthVital = {
  id: string;
  householdId: string;
  memberId: string;
  vitalType: VitalType;
  customLabel: string | null;
  value: number;
  secondaryValue: number | null;
  unit: string;
  measuredAt: string;
  privacyScope: PrivacyScope;
  status: VitalStatus;
  sourceType: VitalSourceType;
  provenanceId: string | null;
  routineId: string | null;
  notes: string | null;
  createdByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
};

const SELECT =
  "id, household_id, member_id, vital_type, custom_label, value, secondary_value, unit, measured_at, privacy_scope, status, source_type, provenance_id, routine_id, notes, created_by_member_id, created_at, updated_at";

function toVital(row: Row): HealthVital {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    memberId: row.member_id as string,
    vitalType: row.vital_type as VitalType,
    customLabel: (row.custom_label as string | null) ?? null,
    value: Number(row.value),
    secondaryValue: row.secondary_value === null || row.secondary_value === undefined ? null : Number(row.secondary_value),
    unit: row.unit as string,
    measuredAt: row.measured_at as string,
    privacyScope: row.privacy_scope as PrivacyScope,
    status: row.status as VitalStatus,
    sourceType: row.source_type as VitalSourceType,
    provenanceId: (row.provenance_id as string | null) ?? null,
    routineId: (row.routine_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdByMemberId: (row.created_by_member_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listVitals(
  supabase: SupabaseClient,
  householdId: string,
  options: { memberId?: string; vitalTypes?: readonly VitalType[]; statuses?: readonly VitalStatus[]; limit?: number } = {},
): Promise<HealthVital[]> {
  let query = supabase.from("health_vitals").select(SELECT).eq("household_id", householdId).order("measured_at", { ascending: false });
  if (options.memberId) query = query.eq("member_id", options.memberId);
  if (options.vitalTypes?.length) query = query.in("vital_type", options.vitalTypes);
  if (options.statuses?.length) query = query.in("status", options.statuses);
  else query = query.eq("status", "active");
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw new Error(`listVitals failed: ${error.code ?? "unknown"}`);
  return (data ?? []).map((row) => toVital(row as Row));
}

export async function getVital(supabase: SupabaseClient, householdId: string, id: string): Promise<HealthVital | null> {
  const { data, error } = await supabase.from("health_vitals").select(SELECT).eq("household_id", householdId).eq("id", id).maybeSingle();
  if (error) throw new Error(`getVital failed: ${error.code ?? "unknown"}`);
  return data ? toVital(data as Row) : null;
}

export type CreateVitalInput = {
  memberId: string;
  vitalType: VitalType;
  customLabel?: string | null;
  value: number;
  secondaryValue?: number | null;
  unit: string;
  measuredAt?: string;
  privacyScope: PrivacyScope;
  notes?: string | null;
  routineId?: string | null;
  /** Defaults to `manual_entry`; HomeTalk's `log_vital` executor passes `home_talk`. */
  sourceType?: VitalSourceType;
};

/**
 * Records a new reading for the caller's own record, or for a child they
 * guard — RLS enforces which. Always creates a matching `health_provenance`
 * row, confirmed by the actor immediately — a person recording this, by
 * hand or through HomeTalk, has already confirmed it.
 */
export async function createVital(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, input: CreateVitalInput): Promise<HealthVital> {
  const { data: provenanceRow, error: provenanceError } = await supabase
    .from("health_provenance")
    .insert({
      household_id: actor.householdId,
      source_type: input.sourceType ?? "manual_entry",
      confidence: 1.0,
      confirmed_by: actor.memberId,
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (provenanceError) throw new Error(`createVital failed to record provenance: ${provenanceError.code ?? "unknown"}`);

  const { data, error } = await supabase
    .from("health_vitals")
    .insert({
      household_id: actor.householdId,
      member_id: input.memberId,
      vital_type: input.vitalType,
      custom_label: input.customLabel ?? null,
      value: input.value,
      secondary_value: input.secondaryValue ?? null,
      unit: input.unit,
      measured_at: input.measuredAt ?? new Date().toISOString(),
      privacy_scope: input.privacyScope,
      source_type: input.sourceType ?? "manual_entry",
      provenance_id: (provenanceRow as { id: string }).id,
      routine_id: input.routineId ?? null,
      notes: input.notes ?? null,
      created_by_member_id: actor.memberId,
    })
    .select(SELECT)
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You may only record a reading for yourself, or a child you guard.");
    throw new Error(`createVital failed: ${error.code ?? "unknown"}`);
  }

  const vital = toVital(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.vital_recorded",
    targetTable: "health_vitals",
    targetId: vital.id,
    metadata: { memberId: vital.memberId, vitalType: vital.vitalType },
  });

  return vital;
}

export type UpdateVitalInput = {
  value?: number;
  secondaryValue?: number | null;
  unit?: string;
  measuredAt?: string;
  notes?: string | null;
  privacyScope?: PrivacyScope;
};

/** Correcting a reading's own content — never its type or who it is for; record a new one for that. */
export async function updateVital(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, id: string, input: UpdateVitalInput): Promise<HealthVital> {
  const patch: Row = {};
  if (input.value !== undefined) patch.value = input.value;
  if (input.secondaryValue !== undefined) patch.secondary_value = input.secondaryValue;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.measuredAt !== undefined) patch.measured_at = input.measuredAt;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.privacyScope !== undefined) patch.privacy_scope = input.privacyScope;

  const { data, error } = await supabase.from("health_vitals").update(patch).eq("id", id).eq("household_id", actor.householdId).select(SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only correct your own reading, or a child you guard's.");
    throw new Error(`updateVital failed: ${error.code ?? "unknown"}`);
  }

  const vital = toVital(data as Row);

  await auditChange({ householdId: actor.householdId, actorMemberId: actor.memberId, eventType: "health.vital_updated", targetTable: "health_vitals", targetId: vital.id });

  return vital;
}

async function setVitalStatus(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  id: string,
  status: VitalStatus,
  eventType: "health.vital_archived" | "health.vital_reactivated",
): Promise<HealthVital> {
  const { data, error } = await supabase.from("health_vitals").update({ status }).eq("id", id).eq("household_id", actor.householdId).select(SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only change your own reading, or a child you guard's.");
    throw new Error(`setVitalStatus failed: ${error.code ?? "unknown"}`);
  }

  const vital = toVital(data as Row);
  await auditChange({ householdId: actor.householdId, actorMemberId: actor.memberId, eventType, targetTable: "health_vitals", targetId: vital.id });
  return vital;
}

/** Removing a mis-entered reading (CLAUDE.md rule 12) — the reading stays on record, just out of the way; never a hard delete. */
export function archiveVital(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, id: string): Promise<HealthVital> {
  return setVitalStatus(supabase, actor, id, "archived", "health.vital_archived");
}

export function reactivateVital(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, id: string): Promise<HealthVital> {
  return setVitalStatus(supabase, actor, id, "active", "health.vital_reactivated");
}

/**
 * Arithmetic a person can verify, never a stated conclusion (story 21-007's
 * own acceptance criterion: WonderHome never says "your health is good").
 * Pure and testable — the count and the calendar span between the oldest
 * and newest reading in the sample, nothing inferred about what the numbers
 * mean.
 */
export type VitalTrend = {
  count: number;
  /** Whole days between the oldest and newest reading in the sample; null when there is only one. */
  spanDays: number | null;
  latest: HealthVital | null;
  oldest: HealthVital | null;
};

export function summarizeVitalTrend(vitals: readonly HealthVital[]): VitalTrend {
  if (vitals.length === 0) return { count: 0, spanDays: null, latest: null, oldest: null };

  const sorted = [...vitals].sort((a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime());
  const latest = sorted[0]!;
  const oldest = sorted[sorted.length - 1]!;
  const spanDays = sorted.length > 1 ? Math.round((new Date(latest.measuredAt).getTime() - new Date(oldest.measuredAt).getTime()) / 86_400_000) : null;

  return { count: sorted.length, spanDays, latest, oldest };
}

/** "Your last 5 readings were recorded over the past 3 weeks." — the trend's own wording, verifiable arithmetic only. */
export function describeVitalTrend(trend: VitalTrend): string {
  if (trend.count === 0) return "No readings yet.";
  if (trend.count === 1) return "One reading so far.";

  const days = trend.spanDays ?? 0;
  if (days === 0) return `Your last ${trend.count} readings were all recorded today.`;
  if (days < 14) return `Your last ${trend.count} readings were recorded over the past ${days} day${days === 1 ? "" : "s"}.`;

  const weeks = Math.round(days / 7);
  return `Your last ${trend.count} readings were recorded over the past ${weeks} week${weeks === 1 ? "" : "s"}.`;
}
