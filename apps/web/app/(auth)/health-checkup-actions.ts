"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { may } from "@wonderhome/core/billing/repository";
import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import {
  CHECKUP_TYPES,
  completeCheckup,
  createCheckup,
  dismissCheckup,
  reactivateCheckup,
  rescheduleCheckup,
  updateCheckup,
} from "@wonderhome/core/health/checkups";
import { PRIVACY_SCOPES } from "@wonderhome/core/health/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";

/** Adding, editing, rescheduling, completing and removing a checkup (story 21-004). */
const createSchema = z.object({
  householdId: z.uuid(),
  memberId: z.uuid(),
  label: z.string().trim().min(1).max(160),
  checkupType: z.enum(CHECKUP_TYPES),
  cadenceDays: z.string().optional(),
  nextDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  privacyScope: z.enum(PRIVACY_SCOPES),
  notes: z.string().trim().max(1000).optional(),
});

export async function createCheckupAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse({
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
    label: formData.get("label"),
    checkupType: formData.get("checkupType"),
    cadenceDays: formData.get("cadenceDays") || undefined,
    nextDueOn: formData.get("nextDueOn"),
    privacyScope: formData.get("privacyScope"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    const entitlement = await may(supabase, parsed.data.householdId, "health.tracking");
    if (!entitlement.allowed) return { error: entitlement.reason };

    const { memberId, label, checkupType, nextDueOn, privacyScope, notes } = parsed.data;
    const cadenceDays = parsed.data.cadenceDays ? Number(parsed.data.cadenceDays) : null;

    await createCheckup(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, {
      memberId,
      label,
      checkupType,
      cadenceDays,
      nextDueOn,
      privacyScope,
      notes,
    });

    revalidatePath("/health");
    return { notice: "Added." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-checkups").body.error.message };
  }
}

const idSchema = z.object({ householdId: z.uuid(), checkupId: z.uuid() });

export async function completeCheckupAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = idSchema.safeParse({ householdId: formData.get("householdId"), checkupId: formData.get("checkupId") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    await completeCheckup(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, parsed.data.checkupId);

    revalidatePath("/health");
    return { notice: "Marked done." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-checkups").body.error.message };
  }
}

export async function dismissCheckupAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = idSchema.safeParse({ householdId: formData.get("householdId"), checkupId: formData.get("checkupId") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    await dismissCheckup(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, parsed.data.checkupId);

    revalidatePath("/health");
    return { notice: "Removed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-checkups").body.error.message };
  }
}

export async function reactivateCheckupAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = idSchema.safeParse({ householdId: formData.get("householdId"), checkupId: formData.get("checkupId") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    await reactivateCheckup(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, parsed.data.checkupId);

    revalidatePath("/health");
    return { notice: "Brought back." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-checkups").body.error.message };
  }
}

const updateSchema = z.object({
  householdId: z.uuid(),
  checkupId: z.uuid(),
  label: z.string().trim().min(1).max(160).optional(),
  cadenceDays: z.string().optional(),
  notes: z.string().trim().max(1000).optional(),
  nextDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/** Content, cadence and the next due date, all from the one edit sheet — kept as one action so the row's edit button covers everything about a checkup at once. */
export async function updateCheckupAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateSchema.safeParse({
    householdId: formData.get("householdId"),
    checkupId: formData.get("checkupId"),
    label: formData.get("label") || undefined,
    cadenceDays: formData.get("cadenceDays") ?? undefined,
    notes: formData.get("notes") || undefined,
    nextDueOn: formData.get("nextDueOn") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    const actor = { householdId: parsed.data.householdId, memberId: membership.memberId };

    const cadenceDays = parsed.data.cadenceDays === undefined ? undefined : parsed.data.cadenceDays ? Number(parsed.data.cadenceDays) : null;

    await updateCheckup(supabase, actor, parsed.data.checkupId, {
      label: parsed.data.label,
      cadenceDays,
      notes: parsed.data.notes,
    });
    if (parsed.data.nextDueOn) {
      await rescheduleCheckup(supabase, actor, parsed.data.checkupId, parsed.data.nextDueOn);
    }

    revalidatePath("/health");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-checkups").body.error.message };
  }
}
