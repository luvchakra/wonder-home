import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import { assertHealthProviderLive, type HealthProviderId } from "./health-provider";
import type { PrivacyScope } from "./repository";

/**
 * Fitness goals & sessions (story 21-008) — lightweight and
 * consistency-oriented, never a leaderboard, never guilt messaging, never
 * child fitness surveillance (the story's own acceptance criterion). A goal
 * is closer to `measurement-routines.ts` than `vitals.ts`: a household
 * member's own configured, ongoing intention, so it mirrors that module's
 * active/dismissed lifecycle. A session is closer to `vitals.ts`: a single
 * logged fact with no lifecycle of its own beyond a reversible remove, so it
 * mirrors that module's active/archived shape. `sessionId.goalId` traces a
 * session back to the goal it counts toward, exactly the way
 * `health_vitals.routine_id` traces a reading back to its routine — entirely
 * optional, since a session can be logged with no goal behind it at all.
 *
 * Every write validates its `providerId` against the `HealthProvider`
 * abstraction before touching the database — `assertHealthProviderLive`
 * refuses anything claiming Apple HealthKit, Android Health Connect or a
 * wearable, since none of the three has a real connector yet.
 */

export const FITNESS_ACTIVITY_TYPES = ["walk", "run", "cycle", "swim", "yoga", "strength_training", "sports", "stretching", "other"] as const;
export type FitnessActivityType = (typeof FITNESS_ACTIVITY_TYPES)[number];

export const FITNESS_ACTIVITY_LABEL: Record<FitnessActivityType, string> = {
  walk: "Walking",
  run: "Running",
  cycle: "Cycling",
  swim: "Swimming",
  yoga: "Yoga",
  strength_training: "Strength training",
  sports: "Sports",
  stretching: "Stretching",
  other: "Activity",
};

export const FITNESS_FREQUENCY_PERIODS = ["day", "week", "month"] as const;
export type FitnessFrequencyPeriod = (typeof FITNESS_FREQUENCY_PERIODS)[number];

export const FITNESS_GOAL_STATUSES = ["active", "dismissed"] as const;
export type FitnessGoalStatus = (typeof FITNESS_GOAL_STATUSES)[number];

export const FITNESS_SESSION_STATUSES = ["active", "archived"] as const;
export type FitnessSessionStatus = (typeof FITNESS_SESSION_STATUSES)[number];

/** The `health_provenance.source_type` each provider maps onto — the same six values that table's own CHECK constraint already names. */
const PROVENANCE_SOURCE_TYPE: Record<HealthProviderId, string> = {
  manual: "manual_entry",
  home_talk: "home_talk",
  home_send: "home_send_document",
  calendar: "calendar",
  apple_health_kit: "future_health_integration",
  android_health_connect: "future_health_integration",
  wearable: "future_health_integration",
};

type Row = Record<string, unknown>;

export type FitnessGoal = {
  id: string;
  householdId: string;
  memberId: string;
  activityType: FitnessActivityType;
  customLabel: string | null;
  targetCount: number;
  frequencyPeriod: FitnessFrequencyPeriod;
  preferredTime: string | null;
  privacyScope: PrivacyScope;
  status: FitnessGoalStatus;
  providerId: HealthProviderId;
  provenanceId: string | null;
  notes: string | null;
  createdByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
};

const GOAL_SELECT =
  "id, household_id, member_id, activity_type, custom_label, target_count, frequency_period, preferred_time, privacy_scope, status, provider_id, provenance_id, notes, created_by_member_id, created_at, updated_at";

function toGoal(row: Row): FitnessGoal {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    memberId: row.member_id as string,
    activityType: row.activity_type as FitnessActivityType,
    customLabel: (row.custom_label as string | null) ?? null,
    targetCount: Number(row.target_count),
    frequencyPeriod: row.frequency_period as FitnessFrequencyPeriod,
    preferredTime: (row.preferred_time as string | null) ?? null,
    privacyScope: row.privacy_scope as PrivacyScope,
    status: row.status as FitnessGoalStatus,
    providerId: row.provider_id as HealthProviderId,
    provenanceId: (row.provenance_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdByMemberId: (row.created_by_member_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listFitnessGoals(
  supabase: SupabaseClient,
  householdId: string,
  options: { memberId?: string; statuses?: readonly FitnessGoalStatus[] } = {},
): Promise<FitnessGoal[]> {
  let query = supabase.from("health_fitness_goals").select(GOAL_SELECT).eq("household_id", householdId).order("created_at", { ascending: false });
  if (options.memberId) query = query.eq("member_id", options.memberId);
  if (options.statuses?.length) query = query.in("status", options.statuses);

  const { data, error } = await query;
  if (error) throw new Error(`listFitnessGoals failed: ${error.code ?? "unknown"}`);
  return (data ?? []).map((row) => toGoal(row as Row));
}

export async function getFitnessGoal(supabase: SupabaseClient, householdId: string, id: string): Promise<FitnessGoal | null> {
  const { data, error } = await supabase.from("health_fitness_goals").select(GOAL_SELECT).eq("household_id", householdId).eq("id", id).maybeSingle();
  if (error) throw new Error(`getFitnessGoal failed: ${error.code ?? "unknown"}`);
  return data ? toGoal(data as Row) : null;
}

export type CreateFitnessGoalInput = {
  memberId: string;
  activityType: FitnessActivityType;
  customLabel?: string | null;
  targetCount: number;
  frequencyPeriod: FitnessFrequencyPeriod;
  preferredTime?: string | null;
  privacyScope: PrivacyScope;
  notes?: string | null;
  /** Defaults to `manual`; HomeTalk's `set_fitness_goal` executor passes `home_talk`. */
  providerId?: HealthProviderId;
};

/** Records a new goal for the caller's own record, or for a child they guard — RLS enforces which. */
export async function createFitnessGoal(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  input: CreateFitnessGoalInput,
): Promise<FitnessGoal> {
  const providerId = input.providerId ?? "manual";
  assertHealthProviderLive(providerId);

  const { data: provenanceRow, error: provenanceError } = await supabase
    .from("health_provenance")
    .insert({
      household_id: actor.householdId,
      source_type: PROVENANCE_SOURCE_TYPE[providerId],
      confidence: 1.0,
      confirmed_by: actor.memberId,
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (provenanceError) throw new Error(`createFitnessGoal failed to record provenance: ${provenanceError.code ?? "unknown"}`);

  const { data, error } = await supabase
    .from("health_fitness_goals")
    .insert({
      household_id: actor.householdId,
      member_id: input.memberId,
      activity_type: input.activityType,
      custom_label: input.customLabel ?? null,
      target_count: input.targetCount,
      frequency_period: input.frequencyPeriod,
      preferred_time: input.preferredTime ?? null,
      privacy_scope: input.privacyScope,
      provider_id: providerId,
      provenance_id: (provenanceRow as { id: string }).id,
      notes: input.notes ?? null,
      created_by_member_id: actor.memberId,
    })
    .select(GOAL_SELECT)
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You may only add a goal for yourself, or a child you guard.");
    throw new Error(`createFitnessGoal failed: ${error.code ?? "unknown"}`);
  }

  const goal = toGoal(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.fitness_goal_created",
    targetTable: "health_fitness_goals",
    targetId: goal.id,
    metadata: { memberId: goal.memberId, activityType: goal.activityType },
  });

  return goal;
}

export type UpdateFitnessGoalInput = {
  targetCount?: number;
  frequencyPeriod?: FitnessFrequencyPeriod;
  preferredTime?: string | null;
  notes?: string | null;
  privacyScope?: PrivacyScope;
};

export async function updateFitnessGoal(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  id: string,
  input: UpdateFitnessGoalInput,
): Promise<FitnessGoal> {
  const patch: Row = {};
  if (input.targetCount !== undefined) patch.target_count = input.targetCount;
  if (input.frequencyPeriod !== undefined) patch.frequency_period = input.frequencyPeriod;
  if (input.preferredTime !== undefined) patch.preferred_time = input.preferredTime;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.privacyScope !== undefined) patch.privacy_scope = input.privacyScope;

  const { data, error } = await supabase.from("health_fitness_goals").update(patch).eq("id", id).eq("household_id", actor.householdId).select(GOAL_SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only update your own goal, or a child you guard's.");
    throw new Error(`updateFitnessGoal failed: ${error.code ?? "unknown"}`);
  }

  const goal = toGoal(data as Row);
  await auditChange({ householdId: actor.householdId, actorMemberId: actor.memberId, eventType: "health.fitness_goal_updated", targetTable: "health_fitness_goals", targetId: goal.id });
  return goal;
}

async function setGoalStatus(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  id: string,
  status: FitnessGoalStatus,
  eventType: "health.fitness_goal_dismissed" | "health.fitness_goal_reactivated",
  forbiddenMessage: string,
): Promise<FitnessGoal> {
  const { data, error } = await supabase.from("health_fitness_goals").update({ status }).eq("id", id).eq("household_id", actor.householdId).select(GOAL_SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden(forbiddenMessage);
    throw new Error(`setGoalStatus failed: ${error.code ?? "unknown"}`);
  }

  const goal = toGoal(data as Row);
  await auditChange({ householdId: actor.householdId, actorMemberId: actor.memberId, eventType, targetTable: "health_fitness_goals", targetId: goal.id });
  return goal;
}

/** Removing a goal (CLAUDE.md rule 12) — never a hard delete; the goal stays on record, just out of the way. */
export function dismissFitnessGoal(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, id: string): Promise<FitnessGoal> {
  return setGoalStatus(supabase, actor, id, "dismissed", "health.fitness_goal_dismissed", "You may only remove your own goal, or a child you guard's.");
}

export function reactivateFitnessGoal(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, id: string): Promise<FitnessGoal> {
  return setGoalStatus(supabase, actor, id, "active", "health.fitness_goal_reactivated", "You may only bring back your own goal, or a child you guard's.");
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export type FitnessSession = {
  id: string;
  householdId: string;
  memberId: string;
  goalId: string | null;
  activityType: FitnessActivityType;
  customLabel: string | null;
  durationMinutes: number;
  distanceValue: number | null;
  distanceUnit: string | null;
  startedAt: string;
  privacyScope: PrivacyScope;
  status: FitnessSessionStatus;
  providerId: HealthProviderId;
  provenanceId: string | null;
  notes: string | null;
  createdByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
};

const SESSION_SELECT =
  "id, household_id, member_id, goal_id, activity_type, custom_label, duration_minutes, distance_value, distance_unit, started_at, privacy_scope, status, provider_id, provenance_id, notes, created_by_member_id, created_at, updated_at";

function toSession(row: Row): FitnessSession {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    memberId: row.member_id as string,
    goalId: (row.goal_id as string | null) ?? null,
    activityType: row.activity_type as FitnessActivityType,
    customLabel: (row.custom_label as string | null) ?? null,
    durationMinutes: Number(row.duration_minutes),
    distanceValue: row.distance_value === null || row.distance_value === undefined ? null : Number(row.distance_value),
    distanceUnit: (row.distance_unit as string | null) ?? null,
    startedAt: row.started_at as string,
    privacyScope: row.privacy_scope as PrivacyScope,
    status: row.status as FitnessSessionStatus,
    providerId: row.provider_id as HealthProviderId,
    provenanceId: (row.provenance_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    createdByMemberId: (row.created_by_member_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listFitnessSessions(
  supabase: SupabaseClient,
  householdId: string,
  options: { memberId?: string; goalId?: string; statuses?: readonly FitnessSessionStatus[]; limit?: number } = {},
): Promise<FitnessSession[]> {
  let query = supabase.from("health_fitness_sessions").select(SESSION_SELECT).eq("household_id", householdId).order("started_at", { ascending: false });
  if (options.memberId) query = query.eq("member_id", options.memberId);
  if (options.goalId) query = query.eq("goal_id", options.goalId);
  if (options.statuses?.length) query = query.in("status", options.statuses);
  else query = query.eq("status", "active");
  if (options.limit) query = query.limit(options.limit);

  const { data, error } = await query;
  if (error) throw new Error(`listFitnessSessions failed: ${error.code ?? "unknown"}`);
  return (data ?? []).map((row) => toSession(row as Row));
}

export async function getFitnessSession(supabase: SupabaseClient, householdId: string, id: string): Promise<FitnessSession | null> {
  const { data, error } = await supabase.from("health_fitness_sessions").select(SESSION_SELECT).eq("household_id", householdId).eq("id", id).maybeSingle();
  if (error) throw new Error(`getFitnessSession failed: ${error.code ?? "unknown"}`);
  return data ? toSession(data as Row) : null;
}

export type CreateFitnessSessionInput = {
  memberId: string;
  goalId?: string | null;
  activityType: FitnessActivityType;
  customLabel?: string | null;
  durationMinutes: number;
  distanceValue?: number | null;
  distanceUnit?: string | null;
  startedAt?: string;
  privacyScope: PrivacyScope;
  notes?: string | null;
  /** Defaults to `manual`; HomeTalk logging passes `home_talk`. */
  providerId?: HealthProviderId;
};

/** Logs a single activity for the caller's own record, or for a child they guard — RLS enforces which. */
export async function createFitnessSession(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  input: CreateFitnessSessionInput,
): Promise<FitnessSession> {
  const providerId = input.providerId ?? "manual";
  assertHealthProviderLive(providerId);

  if ((input.distanceValue == null) !== (input.distanceUnit == null)) {
    throw ApiError.badRequest("A distance needs both a value and a unit.");
  }

  const { data: provenanceRow, error: provenanceError } = await supabase
    .from("health_provenance")
    .insert({
      household_id: actor.householdId,
      source_type: PROVENANCE_SOURCE_TYPE[providerId],
      confidence: 1.0,
      confirmed_by: actor.memberId,
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (provenanceError) throw new Error(`createFitnessSession failed to record provenance: ${provenanceError.code ?? "unknown"}`);

  const { data, error } = await supabase
    .from("health_fitness_sessions")
    .insert({
      household_id: actor.householdId,
      member_id: input.memberId,
      goal_id: input.goalId ?? null,
      activity_type: input.activityType,
      custom_label: input.customLabel ?? null,
      duration_minutes: input.durationMinutes,
      distance_value: input.distanceValue ?? null,
      distance_unit: input.distanceUnit ?? null,
      started_at: input.startedAt ?? new Date().toISOString(),
      privacy_scope: input.privacyScope,
      provider_id: providerId,
      provenance_id: (provenanceRow as { id: string }).id,
      notes: input.notes ?? null,
      created_by_member_id: actor.memberId,
    })
    .select(SESSION_SELECT)
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You may only log a session for yourself, or a child you guard.");
    throw new Error(`createFitnessSession failed: ${error.code ?? "unknown"}`);
  }

  const session = toSession(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.fitness_session_logged",
    targetTable: "health_fitness_sessions",
    targetId: session.id,
    metadata: { memberId: session.memberId, activityType: session.activityType },
  });

  return session;
}

export type UpdateFitnessSessionInput = {
  durationMinutes?: number;
  distanceValue?: number | null;
  distanceUnit?: string | null;
  startedAt?: string;
  notes?: string | null;
  privacyScope?: PrivacyScope;
};

/** Correcting a session's own content — never its activity or who it is for; log a new one for that. */
export async function updateFitnessSession(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  id: string,
  input: UpdateFitnessSessionInput,
): Promise<FitnessSession> {
  if ((input.distanceValue !== undefined) !== (input.distanceUnit !== undefined)) {
    throw ApiError.badRequest("A distance needs both a value and a unit.");
  }

  const patch: Row = {};
  if (input.durationMinutes !== undefined) patch.duration_minutes = input.durationMinutes;
  if (input.distanceValue !== undefined) patch.distance_value = input.distanceValue;
  if (input.distanceUnit !== undefined) patch.distance_unit = input.distanceUnit;
  if (input.startedAt !== undefined) patch.started_at = input.startedAt;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.privacyScope !== undefined) patch.privacy_scope = input.privacyScope;

  const { data, error } = await supabase.from("health_fitness_sessions").update(patch).eq("id", id).eq("household_id", actor.householdId).select(SESSION_SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only correct your own session, or a child you guard's.");
    throw new Error(`updateFitnessSession failed: ${error.code ?? "unknown"}`);
  }

  const session = toSession(data as Row);
  await auditChange({ householdId: actor.householdId, actorMemberId: actor.memberId, eventType: "health.fitness_session_updated", targetTable: "health_fitness_sessions", targetId: session.id });
  return session;
}

async function setSessionStatus(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  id: string,
  status: FitnessSessionStatus,
  eventType: "health.fitness_session_archived" | "health.fitness_session_reactivated",
  forbiddenMessage: string,
): Promise<FitnessSession> {
  const { data, error } = await supabase.from("health_fitness_sessions").update({ status }).eq("id", id).eq("household_id", actor.householdId).select(SESSION_SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden(forbiddenMessage);
    throw new Error(`setSessionStatus failed: ${error.code ?? "unknown"}`);
  }

  const session = toSession(data as Row);
  await auditChange({ householdId: actor.householdId, actorMemberId: actor.memberId, eventType, targetTable: "health_fitness_sessions", targetId: session.id });
  return session;
}

/** Removing a mis-logged session (CLAUDE.md rule 12) — never a hard delete. */
export function archiveFitnessSession(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, id: string): Promise<FitnessSession> {
  return setSessionStatus(supabase, actor, id, "archived", "health.fitness_session_archived", "You may only remove your own session, or a child you guard's.");
}

export function reactivateFitnessSession(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, id: string): Promise<FitnessSession> {
  return setSessionStatus(supabase, actor, id, "active", "health.fitness_session_reactivated", "You may only bring back your own session, or a child you guard's.");
}

/**
 * How many sessions logged against a goal fall inside the goal's own
 * current period — verifiable arithmetic a person can check, never a
 * judgment about whether the goal is being "met" (this module never scores
 * consistency, per the story's own no-guilt-messaging rule).
 */
export function countSessionsInCurrentPeriod(goal: Pick<FitnessGoal, "frequencyPeriod">, sessions: readonly Pick<FitnessSession, "startedAt">[], now: Date = new Date()): number {
  const periodStart = currentPeriodStart(goal.frequencyPeriod, now);
  return sessions.filter((session) => new Date(session.startedAt) >= periodStart).length;
}

function currentPeriodStart(period: FitnessFrequencyPeriod, now: Date): Date {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (period === "day") return start;
  if (period === "week") {
    const day = start.getUTCDay();
    // Monday-start week.
    const back = (day + 6) % 7;
    start.setUTCDate(start.getUTCDate() - back);
    return start;
  }
  start.setUTCDate(1);
  return start;
}
