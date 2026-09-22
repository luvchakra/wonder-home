"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { completeRoutine, createRoutine, dismissRoutine, reactivateRoutine, updateRoutine } from "@wonderhome/core/health/measurement-routines";
import { PRIVACY_SCOPES } from "@wonderhome/core/health/repository";
import { VITAL_TYPES } from "@wonderhome/core/health/vitals";
import { requireMembership } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";

const createSchema = z.object({
  householdId: z.uuid(),
  memberId: z.uuid(),
  vitalType: z.enum(VITAL_TYPES),
  customLabel: z.string().trim().max(80).optional(),
  cadenceDays: z.coerce.number().int().positive(),
  preferredTime: z.string().optional(),
  reminderEnabled: z.string().optional(),
  nextDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  privacyScope: z.enum(PRIVACY_SCOPES),
  notes: z.string().trim().max(1000).optional(),
});

export async function createRoutineAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse({
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
    vitalType: formData.get("vitalType"),
    customLabel: formData.get("customLabel") || undefined,
    cadenceDays: formData.get("cadenceDays"),
    preferredTime: formData.get("preferredTime") || undefined,
    reminderEnabled: formData.get("reminderEnabled") || undefined,
    nextDueOn: formData.get("nextDueOn"),
    privacyScope: formData.get("privacyScope"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  if (parsed.data.vitalType === "custom" && !parsed.data.customLabel) return { error: "A custom measurement needs a name." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    const entitlement = await may(supabase, parsed.data.householdId, "health.tracking");
    if (!entitlement.allowed) return { error: entitlement.reason };

    const { memberId, vitalType, customLabel, cadenceDays, preferredTime, nextDueOn, privacyScope, notes } = parsed.data;
    await createRoutine(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, {
      memberId,
      vitalType,
      customLabel,
      cadenceDays,
      preferredTime,
      reminderEnabled: parsed.data.reminderEnabled !== "false",
      nextDueOn,
      privacyScope,
      notes,
    });

    revalidatePath("/health");
    return { notice: "Added." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-routines").body.error.message };
  }
}

const idSchema = z.object({ householdId: z.uuid(), routineId: z.uuid() });

export async function dismissRoutineAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = idSchema.safeParse({ householdId: formData.get("householdId"), routineId: formData.get("routineId") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await dismissRoutine(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, parsed.data.routineId);

    revalidatePath("/health");
    return { notice: "Removed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-routines").body.error.message };
  }
}

export async function reactivateRoutineAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = idSchema.safeParse({ householdId: formData.get("householdId"), routineId: formData.get("routineId") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await reactivateRoutine(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, parsed.data.routineId);

    revalidatePath("/health");
    return { notice: "Brought back." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-routines").body.error.message };
  }
}

const updateSchema = z.object({
  householdId: z.uuid(),
  routineId: z.uuid(),
  cadenceDays: z.coerce.number().int().positive().optional(),
  preferredTime: z.string().optional(),
  reminderEnabled: z.string().optional(),
  notes: z.string().trim().max(1000).optional(),
  nextDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function updateRoutineAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateSchema.safeParse({
    householdId: formData.get("householdId"),
    routineId: formData.get("routineId"),
    cadenceDays: formData.get("cadenceDays") || undefined,
    preferredTime: formData.get("preferredTime") || undefined,
    reminderEnabled: formData.get("reminderEnabled") ?? undefined,
    notes: formData.get("notes") || undefined,
    nextDueOn: formData.get("nextDueOn") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    const { routineId, cadenceDays, preferredTime, notes, nextDueOn } = parsed.data;

    await updateRoutine(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, routineId, {
      cadenceDays,
      preferredTime,
      reminderEnabled: parsed.data.reminderEnabled === undefined ? undefined : parsed.data.reminderEnabled !== "false",
      notes,
      nextDueOn,
    });

    revalidatePath("/health");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-routines").body.error.message };
  }
}

const completeSchema = z.object({
  householdId: z.uuid(),
  routineId: z.uuid(),
  value: z.coerce.number().finite(),
  secondaryValue: z.coerce.number().finite().optional(),
  unit: z.string().trim().min(1).max(20),
  notes: z.string().trim().max(1000).optional(),
});

export async function completeRoutineAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = completeSchema.safeParse({
    householdId: formData.get("householdId"),
    routineId: formData.get("routineId"),
    value: formData.get("value"),
    secondaryValue: formData.get("secondaryValue") || undefined,
    unit: formData.get("unit"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    const { routineId, value, secondaryValue, unit, notes } = parsed.data;

    await completeRoutine(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, routineId, { value, secondaryValue, unit, notes });

    revalidatePath("/health");
    return { notice: "Recorded." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-routines").body.error.message };
  }
}
