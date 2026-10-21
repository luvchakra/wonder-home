"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { SupabaseClient } from "@supabase/supabase-js";

import { may } from "@wonderhome/core/billing/repository";
import { toErrorBody } from "@wonderhome/core/api/errors";
import { createAdminClient } from "@wonderhome/core/db/admin";
import { createClient } from "@wonderhome/core/db/server";
import { forgetReadingsOf } from "@wonderhome/core/health/report-readings";
import { checkReportUpload, HEALTH_REPORT_BUCKET, REPORT_MAX_BYTES, REPORT_UPLOAD_REFUSAL, reportPath } from "@wonderhome/core/health/report-upload";
import { archiveRecord, createRecord, getRecord, reactivateRecord, RECORD_TYPES, updateRecord } from "@wonderhome/core/health/records";
import { PRIVACY_SCOPES } from "@wonderhome/core/health/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";
import { applyHealthSharing, sharingNotSaved } from "./health-sharing";

/**
 * The attached report (story 21-012), when the sheet carries one: checked from
 * its bytes (`checkReportUpload`), then uploaded through the person's own
 * session into the household's folder of the private `health-records` bucket.
 * Null when no file was chosen.
 */
async function uploadReport(supabase: SupabaseClient, householdId: string, formData: FormData): Promise<{ path: string } | { error: string } | null> {
  const file = formData.get("report");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > REPORT_MAX_BYTES) return { error: REPORT_UPLOAD_REFUSAL.too_large };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = await checkReportUpload(bytes, file.type, file.name || null);
  if (!check.ok) return { error: REPORT_UPLOAD_REFUSAL[check.reason] };
  const path = reportPath(householdId, check.extension);
  const { error } = await supabase.storage.from(HEALTH_REPORT_BUCKET).upload(path, bytes, { contentType: check.contentType, upsert: false });
  if (error) return { error: "The report could not be uploaded. Please try again." };
  return { path };
}

/**
 * Lets go of a report file no record carries any more — one replaced or
 * removed, or one uploaded for a save that then failed. Only after the
 * person's own session has changed the record (so RLS has already said they
 * may), only inside this household's folder, and only when no record still
 * points at it. The bucket has no delete policy for sessions, so this is the
 * server's own client. Best effort: an object left behind is unreadable,
 * since reading needs a record that carries it.
 */
async function discardReportFile(householdId: string, path: string): Promise<void> {
  if (!path.startsWith(`${householdId}/`)) return;
  try {
    const admin = createAdminClient();
    const { count, error } = await admin.from("health_records").select("id", { count: "exact", head: true }).eq("file_path", path);
    if (error || (count ?? 0) > 0) return;
    await admin.storage.from(HEALTH_REPORT_BUCKET).remove([path]);
  } catch {
    // Left behind, and unreadable without a record that carries it.
  }
}

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

    const upload = await uploadReport(supabase, parsed.data.householdId, formData);
    if (upload && "error" in upload) return { error: upload.error };

    try {
      await createRecord(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, {
        memberId,
        label,
        recordType,
        documentDate: documentDate ?? null,
        filePath: upload?.path ?? null,
        privacyScope,
        notes,
      });
    } catch (thrown) {
      if (upload) await discardReportFile(parsed.data.householdId, upload.path);
      throw thrown;
    }

    const sharing = await applyHealthSharing(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, formData, { subjectMemberId: memberId, privacyScope: privacyScope });
    revalidatePath("/health");
    return { notice: sharing ? `Filed. ${sharingNotSaved(sharing)}` : "Filed." };
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
  privacyScope: z.enum(PRIVACY_SCOPES).optional(),
  removeReport: z.boolean(),
});

export async function updateRecordAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateSchema.safeParse({
    householdId: formData.get("householdId"),
    recordId: formData.get("recordId"),
    label: formData.get("label") || undefined,
    recordType: formData.get("recordType") || undefined,
    documentDate: formData.get("documentDate") || undefined,
    notes: formData.get("notes") || undefined,
    privacyScope: formData.get("privacyScope") || undefined,
    removeReport: formData.get("removeReport") === "true",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    const householdId = parsed.data.householdId;

    const current = await getRecord(supabase, householdId, parsed.data.recordId);
    if (!current) return { error: "That record is not part of this household." };

    // A new report replaces the old one; "Remove the report" takes it off the record. Neither touches the record's history.
    const upload = await uploadReport(supabase, householdId, formData);
    if (upload && "error" in upload) return { error: upload.error };
    const filePath = upload ? upload.path : parsed.data.removeReport ? null : undefined;

    let record;
    try {
      record = await updateRecord(supabase, { householdId, memberId: membership.memberId }, parsed.data.recordId, {
        label: parsed.data.label,
        recordType: parsed.data.recordType,
        documentDate: parsed.data.documentDate,
        filePath,
        notes: parsed.data.notes,
        privacyScope: parsed.data.privacyScope,
      });
    } catch (thrown) {
      if (upload) await discardReportFile(householdId, upload.path);
      throw thrown;
    }
    if (filePath !== undefined && current.filePath && current.filePath !== filePath) {
      // What was read from the old report goes with it.
      await forgetReadingsOf(supabase, householdId, record.id, current.filePath).catch(() => undefined);
      await discardReportFile(householdId, current.filePath);
    }
    const sharing = await applyHealthSharing(supabase, { householdId: parsed.data.householdId, memberId: membership.memberId }, formData, { subjectMemberId: record.memberId, privacyScope: record.privacyScope });
    if (sharing) return { error: sharingNotSaved(sharing) };

    revalidatePath("/health");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "health-records").body.error.message };
  }
}
