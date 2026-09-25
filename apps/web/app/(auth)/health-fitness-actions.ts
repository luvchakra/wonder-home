"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import {
  archiveFitnessSession,
  createFitnessGoal,
  createFitnessSession,
  dismissFitnessGoal,
  FITNESS_ACTIVITY_TYPES,
  FITNESS_FREQUENCY_PERIODS,
  reactivateFitnessGoal,
  reactivateFitnessSession,
  updateFitnessGoal,
  updateFitnessSession,
} from "@wonderhome/core/health/fitness";
import { PRIVACY_SCOPES } from "@wonderhome/core/health/repository";
import { requireMembership } from "@wonderhome/core/identity/households";
import { householdInstant } from "@wonderhome/core/school/times";

import type { ActionState } from "./actions";

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

const createGoalSchema = z.object({
  householdId: z.uuid(),
  memberId: z.uuid(),
  activityType: z.enum(FITNESS_ACTIVITY_TYPES),
  customLabel: z.string().trim().max(80).optional(),
  targetCount: z.coerce.number().int().positive(),
  frequencyPeriod: z.enum(FITNESS_FREQUENCY_PERIODS),
  preferredTime: z.string().optional(),
  privacyScope: z.enum(PRIVACY_SCOPES),
  notes: z.string().trim().max(1000).optional(),
});

export async function createFitnessGoalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createGoalSchema.safeParse({
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
    activityType: formData.get("activityType"),
    customLabel: formData.get("customLabel") || undefined,
    targetCount: formData.get("targetCount"),
    frequencyPeriod: formData.get("frequencyPeriod"),
    preferredTime: formData.get("preferredTime") || undefined,
    privacyScope: formData.get("privacyScope"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  if (parsed.data.activityType === "other" && !parsed.data.customLabel) return { error: "A custom activity needs a name." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    const entitlement = await may(supabase, parsed.data.householdId, "health.tracking");
    if (!entitlement.allowed) return { error: entitlement.reason };

    const { memberId, activityType, customLabel, targetCount, frequencyPeriod, preferredTime, privacyScope, notes } = parsed.data;
    await createFitnessGoal(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, {
      memberId,
      activityType,
      customLabel,
      targetCount,
      frequencyPeriod,
      preferredTime,
      privacyScope,
      notes,
    });

    revalidatePath("/health");
    return { notice: "Goal set." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-fitness-goals").body.error.message };
  }
}

const goalIdSchema = z.object({ householdId: z.uuid(), goalId: z.uuid() });

export async function dismissFitnessGoalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = goalIdSchema.safeParse({ householdId: formData.get("householdId"), goalId: formData.get("goalId") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await dismissFitnessGoal(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, parsed.data.goalId);

    revalidatePath("/health");
    return { notice: "Removed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-fitness-goals").body.error.message };
  }
}

export async function reactivateFitnessGoalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = goalIdSchema.safeParse({ householdId: formData.get("householdId"), goalId: formData.get("goalId") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await reactivateFitnessGoal(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, parsed.data.goalId);

    revalidatePath("/health");
    return { notice: "Brought back." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-fitness-goals").body.error.message };
  }
}

const updateGoalSchema = z.object({
  householdId: z.uuid(),
  goalId: z.uuid(),
  targetCount: z.coerce.number().int().positive().optional(),
  frequencyPeriod: z.enum(FITNESS_FREQUENCY_PERIODS).optional(),
  preferredTime: z.string().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function updateFitnessGoalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateGoalSchema.safeParse({
    householdId: formData.get("householdId"),
    goalId: formData.get("goalId"),
    targetCount: formData.get("targetCount") || undefined,
    frequencyPeriod: formData.get("frequencyPeriod") || undefined,
    preferredTime: formData.get("preferredTime") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    const { goalId, targetCount, frequencyPeriod, preferredTime, notes } = parsed.data;

    await updateFitnessGoal(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, goalId, { targetCount, frequencyPeriod, preferredTime, notes });

    revalidatePath("/health");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-fitness-goals").body.error.message };
  }
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const createSessionSchema = z.object({
  householdId: z.uuid(),
  memberId: z.uuid(),
  goalId: z.uuid().optional(),
  activityType: z.enum(FITNESS_ACTIVITY_TYPES),
  customLabel: z.string().trim().max(80).optional(),
  durationMinutes: z.coerce.number().int().positive(),
  distanceValue: z.coerce.number().positive().optional(),
  distanceUnit: z.string().trim().min(1).max(20).optional(),
  startedAt: z.string().optional(),
  privacyScope: z.enum(PRIVACY_SCOPES),
  notes: z.string().trim().max(1000).optional(),
});

export async function createFitnessSessionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSessionSchema.safeParse({
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
    goalId: formData.get("goalId") || undefined,
    activityType: formData.get("activityType"),
    customLabel: formData.get("customLabel") || undefined,
    durationMinutes: formData.get("durationMinutes"),
    distanceValue: formData.get("distanceValue") || undefined,
    distanceUnit: formData.get("distanceUnit") || undefined,
    startedAt: formData.get("startedAt") || undefined,
    privacyScope: formData.get("privacyScope"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  if (parsed.data.activityType === "other" && !parsed.data.customLabel) return { error: "A custom activity needs a name." };
  if ((parsed.data.distanceValue !== undefined) !== (parsed.data.distanceUnit !== undefined)) return { error: "A distance needs both a value and a unit." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    const entitlement = await may(supabase, parsed.data.householdId, "health.tracking");
    if (!entitlement.allowed) return { error: entitlement.reason };

    const { memberId, goalId, activityType, customLabel, durationMinutes, distanceValue, distanceUnit, startedAt, privacyScope, notes } = parsed.data;
    await createFitnessSession(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, {
      memberId,
      goalId,
      activityType,
      customLabel,
      durationMinutes,
      distanceValue,
      distanceUnit,
      // The household's wall clock, not the server's.
      startedAt: startedAt ? (householdInstant(startedAt, membership.household.timezone) ?? undefined) : undefined,
      privacyScope,
      notes,
    });

    revalidatePath("/health");
    return { notice: "Logged." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-fitness-sessions").body.error.message };
  }
}

const sessionIdSchema = z.object({ householdId: z.uuid(), sessionId: z.uuid() });

export async function archiveFitnessSessionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = sessionIdSchema.safeParse({ householdId: formData.get("householdId"), sessionId: formData.get("sessionId") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await archiveFitnessSession(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, parsed.data.sessionId);

    revalidatePath("/health");
    return { notice: "Removed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-fitness-sessions").body.error.message };
  }
}

export async function reactivateFitnessSessionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = sessionIdSchema.safeParse({ householdId: formData.get("householdId"), sessionId: formData.get("sessionId") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await reactivateFitnessSession(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, parsed.data.sessionId);

    revalidatePath("/health");
    return { notice: "Brought back." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-fitness-sessions").body.error.message };
  }
}

const updateSessionSchema = z.object({
  householdId: z.uuid(),
  sessionId: z.uuid(),
  durationMinutes: z.coerce.number().int().positive().optional(),
  distanceValue: z.coerce.number().positive().optional(),
  distanceUnit: z.string().trim().min(1).max(20).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function updateFitnessSessionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateSessionSchema.safeParse({
    householdId: formData.get("householdId"),
    sessionId: formData.get("sessionId"),
    durationMinutes: formData.get("durationMinutes") || undefined,
    distanceValue: formData.get("distanceValue") || undefined,
    distanceUnit: formData.get("distanceUnit") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  if ((parsed.data.distanceValue !== undefined) !== (parsed.data.distanceUnit !== undefined)) return { error: "A distance needs both a value and a unit." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    const { sessionId, durationMinutes, distanceValue, distanceUnit, notes } = parsed.data;

    await updateFitnessSession(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, sessionId, { durationMinutes, distanceValue, distanceUnit, notes });

    revalidatePath("/health");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-fitness-sessions").body.error.message };
  }
}
