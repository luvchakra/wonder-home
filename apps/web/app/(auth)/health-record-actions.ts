"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { may } from "@wonderhome/core/billing/repository";
import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { archiveRecord, createRecord, reactivateRecord, RECORD_TYPES, updateRecord } from "@wonderhome/core/health/records";
import { PRIVACY_SCOPES } from "@wonderhome/core/health/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";

/** Adding, editing and removing a health record by hand (story 21-005) — HomeSend's own confirm writes through `routeHomeSendItemAction` instead. */
const createSchema = z.object({
  householdId: z.uuid(),
  memberId: z.uuid(),
  label: z.string().trim().min(1).max(160),
  recordType: z.enum(RECORD_TYPES),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  privacyScope: z.enum(PRIVACY_SCOPES),
  notes: z.string().trim().max(2000).optional(),
});

export async function createRecordAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = createSchema.safeParse({
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
    label: formData.get("label"),
    recordType: formData.get("recordType"),
    documentDate: formData.get("documentDate") || undefined,
    privacyScope: formData.get("privacyScope"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    const entitlement = await may(supabase, parsed.data.householdId, "health.tracking");
    if (!entitlement.allowed) return { error: entitlement.reason };

    const { memberId, label, recordType, documentDate, privacyScope, notes } = parsed.data;

    await createRecord(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, {
      memberId,
      label,
      recordType,
      documentDate: documentDate ?? null,
      privacyScope,
      notes,
    });

    revalidatePath("/health");
    return { notice: "Filed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-records").body.error.message };
  }
}

const idSchema = z.object({ householdId: z.uuid(), recordId: z.uuid() });

export async function archiveRecordAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = idSchema.safeParse({ householdId: formData.get("householdId"), recordId: formData.get("recordId") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    await archiveRecord(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, parsed.data.recordId);

    revalidatePath("/health");
    return { notice: "Removed." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-records").body.error.message };
  }
}

export async function reactivateRecordAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = idSchema.safeParse({ householdId: formData.get("householdId"), recordId: formData.get("recordId") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    await reactivateRecord(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, parsed.data.recordId);

    revalidatePath("/health");
    return { notice: "Brought back." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-records").body.error.message };
  }
}

const updateSchema = z.object({
  householdId: z.uuid(),
  recordId: z.uuid(),
  label: z.string().trim().min(1).max(160).optional(),
  recordType: z.enum(RECORD_TYPES).optional(),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export async function updateRecordAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateSchema.safeParse({
    householdId: formData.get("householdId"),
    recordId: formData.get("recordId"),
    label: formData.get("label") || undefined,
    recordType: formData.get("recordType") || undefined,
    documentDate: formData.get("documentDate") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    await updateRecord(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, parsed.data.recordId, {
      label: parsed.data.label,
      recordType: parsed.data.recordType,
      documentDate: parsed.data.documentDate,
      notes: parsed.data.notes,
    });

    revalidatePath("/health");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-records").body.error.message };
  }
}
