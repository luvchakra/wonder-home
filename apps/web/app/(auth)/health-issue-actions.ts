"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { may } from "@wonderhome/core/billing/repository";
import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { ISSUE_STATUSES, createIssue, setIssueStatus, updateIssue } from "@wonderhome/core/health/issues";
import { PRIVACY_SCOPES } from "@wonderhome/core/health/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";

/** Recording, editing and moving a health issue through its status (story 21-003). */
const createSchema = z.object({
  householdId: z.uuid(),
  memberId: z.uuid(),
  label: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  privacyScope: z.enum(PRIVACY_SCOPES),
  notes: z.string().trim().max(1000).optional(),
  startedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function createIssueAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse({
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
    label: formData.get("label"),
    description: formData.get("description") || undefined,
    privacyScope: formData.get("privacyScope"),
    notes: formData.get("notes") || undefined,
    startedAt: formData.get("startedAt") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    const entitlement = await may(supabase, parsed.data.householdId, "health.tracking");
    if (!entitlement.allowed) return { error: entitlement.reason };

    const { memberId, label, description, privacyScope, notes, startedAt } = parsed.data;
    const result = await createIssue(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, {
      memberId,
      label,
      description,
      privacyScope,
      notes,
      startedAt,
    });

    revalidatePath("/health");

    return {
      notice: result.medicalAttention.recommend ? `Recorded. ${result.medicalAttention.message}` : "Recorded.",
    };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-issues").body.error.message };
  }
}

const updateSchema = z.object({
  householdId: z.uuid(),
  issueId: z.uuid(),
  label: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function updateIssueAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateSchema.safeParse({
    householdId: formData.get("householdId"),
    issueId: formData.get("issueId"),
    label: formData.get("label") || undefined,
    description: formData.get("description") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    const { issueId, label, description, notes } = parsed.data;
    const result = await updateIssue(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, issueId, {
      label,
      description,
      notes,
    });

    revalidatePath("/health");

    return {
      notice: result.medicalAttention.recommend ? `Saved. ${result.medicalAttention.message}` : "Saved.",
    };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-issues").body.error.message };
  }
}

const statusSchema = z.object({
  householdId: z.uuid(),
  issueId: z.uuid(),
  status: z.enum(ISSUE_STATUSES),
});

export async function setIssueStatusAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = statusSchema.safeParse({
    householdId: formData.get("householdId"),
    issueId: formData.get("issueId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    await setIssueStatus(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, parsed.data.issueId, parsed.data.status);

    revalidatePath("/health");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-issues").body.error.message };
  }
}
