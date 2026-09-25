"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { PRIVACY_SCOPES } from "@wonderhome/core/health/repository";
import { archiveVital, createVital, reactivateVital, updateVital, VITAL_TYPES } from "@wonderhome/core/health/vitals";
import { requireMembership } from "@wonderhome/core/identity/households";
import { householdInstant } from "@wonderhome/core/school/times";

import type { ActionState } from "./actions";

const createSchema = z.object({
  householdId: z.uuid(),
  memberId: z.uuid(),
  vitalType: z.enum(VITAL_TYPES),
  customLabel: z.string().trim().max(80).optional(),
  value: z.coerce.number().finite(),
  secondaryValue: z.coerce.number().finite().optional(),
  unit: z.string().trim().min(1).max(20),
  measuredAt: z.string().optional(),
  privacyScope: z.enum(PRIVACY_SCOPES),
  notes: z.string().trim().max(1000).optional(),
});

export async function createVitalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse({
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
    vitalType: formData.get("vitalType"),
    customLabel: formData.get("customLabel") || undefined,
    value: formData.get("value"),
    secondaryValue: formData.get("secondaryValue") || undefined,
    unit: formData.get("unit"),
    measuredAt: formData.get("measuredAt") || undefined,
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

    const { memberId, vitalType, customLabel, value, secondaryValue, unit, measuredAt, privacyScope, notes } = parsed.data;
    await createVital(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, {
      memberId,
      vitalType,
      customLabel,
      value,
      secondaryValue,
      unit,
      // The household's wall clock, not the server's.
      measuredAt: measuredAt ? (householdInstant(measuredAt, membership.household.timezone) ?? undefined) : undefined,
      privacyScope,
      notes,
    });

    revalidatePath("/health");
    return { notice: "Recorded." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-vitals").body.error.message };
  }
}

const updateSchema = z.object({
  householdId: z.uuid(),
  vitalId: z.uuid(),
  value: z.coerce.number().finite().optional(),
  secondaryValue: z.coerce.number().finite().optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function updateVitalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateSchema.safeParse({
    householdId: formData.get("householdId"),
    vitalId: formData.get("vitalId"),
    value: formData.get("value") || undefined,
    secondaryValue: formData.get("secondaryValue") || undefined,
    unit: formData.get("unit") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    const { vitalId, value, secondaryValue, unit, notes } = parsed.data;
    await updateVital(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, vitalId, { value, secondaryValue, unit, notes });

    revalidatePath("/health");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-vitals").body.error.message };
  }
}

const idSchema = z.object({ householdId: z.uuid(), vitalId: z.uuid() });

export async function archiveVitalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = idSchema.safeParse({ householdId: formData.get("householdId"), vitalId: formData.get("vitalId") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await archiveVital(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, parsed.data.vitalId);

    revalidatePath("/health");
    return { notice: "Removed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-vitals").body.error.message };
  }
}

export async function reactivateVitalAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = idSchema.safeParse({ householdId: formData.get("householdId"), vitalId: formData.get("vitalId") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await reactivateVital(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, parsed.data.vitalId);

    revalidatePath("/health");
    return { notice: "Brought back." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-vitals").body.error.message };
  }
}
