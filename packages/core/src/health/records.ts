import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import type { PrivacyScope } from "./repository";

/**
 * Health records (story 21-005) — a household document filed against
 * exactly one member, with the same self-or-guardian-only write model every
 * other health entity uses. Never a medical-record replacement: just a
 * filed document (lab result, prescription, discharge summary…) with
 * provenance, so "why does WonderHome have this" is always answerable.
 */

export const RECORD_TYPES = [
  "lab_result",
  "prescription",
  "imaging_report",
  "vaccination_certificate",
  "discharge_summary",
  "referral",
  "insurance_document",
  "visit_summary",
  "other",
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const RECORD_STATUSES = ["active", "archived"] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

export const RECORD_SOURCE_TYPES = ["manual_entry", "home_send_document"] as const;
export type RecordSourceType = (typeof RECORD_SOURCE_TYPES)[number];

type Row = Record<string, unknown>;

export type HealthRecord = {
  id: string;
  householdId: string;
  memberId: string;
  label: string;
  recordType: RecordType;
  documentDate: string | null;
  filePath: string | null;
  notes: string | null;
  privacyScope: PrivacyScope;
  status: RecordStatus;
  sourceType: RecordSourceType;
  provenanceId: string | null;
  createdByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
};

const SELECT =
  "id, household_id, member_id, label, record_type, document_date, file_path, notes, privacy_scope, status, source_type, provenance_id, created_by_member_id, created_at, updated_at";

function toRecord(row: Row): HealthRecord {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    memberId: row.member_id as string,
    label: row.label as string,
    recordType: row.record_type as RecordType,
    documentDate: (row.document_date as string | null) ?? null,
    filePath: (row.file_path as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    privacyScope: row.privacy_scope as PrivacyScope,
    status: row.status as RecordStatus,
    sourceType: row.source_type as RecordSourceType,
    provenanceId: (row.provenance_id as string | null) ?? null,
    createdByMemberId: (row.created_by_member_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listRecords(
  supabase: SupabaseClient,
  householdId: string,
  options: { memberId?: string; statuses?: readonly RecordStatus[] } = {},
): Promise<HealthRecord[]> {
  let query = supabase.from("health_records").select(SELECT).eq("household_id", householdId).order("created_at", { ascending: false });
  if (options.memberId) query = query.eq("member_id", options.memberId);
  if (options.statuses?.length) query = query.in("status", options.statuses);
  else query = query.eq("status", "active");

  const { data, error } = await query;
  if (error) throw new Error(`listRecords failed: ${error.code ?? "unknown"}`);
  return (data ?? []).map((row) => toRecord(row as Row));
}

export async function getRecord(supabase: SupabaseClient, householdId: string, id: string): Promise<HealthRecord | null> {
  const { data, error } = await supabase.from("health_records").select(SELECT).eq("household_id", householdId).eq("id", id).maybeSingle();
  if (error) throw new Error(`getRecord failed: ${error.code ?? "unknown"}`);
  return data ? toRecord(data as Row) : null;
}

export type CreateRecordInput = {
  memberId: string;
  label: string;
  recordType: RecordType;
  documentDate?: string | null;
  filePath?: string | null;
  notes?: string | null;
  privacyScope: PrivacyScope;
  /** Defaults to `manual_entry`; `classifyAndSave`'s HomeSend caller passes `home_send_document`. */
  sourceType?: RecordSourceType;
};

/**
 * Files a new record for the caller's own household member row, or for a
 * child they guard — RLS enforces which. Always creates a matching
 * `health_provenance` row, confirmed by the actor immediately: a person
 * reviewing and submitting the confirm form has already confirmed it,
 * whether that form was filled by hand or prefilled from HomeSend's
 * extraction (never trusted with a write on its own — see
 * `ai/classify-intake.ts`).
 */
export async function createRecord(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  input: CreateRecordInput,
): Promise<HealthRecord> {
  const { data: provenanceRow, error: provenanceError } = await supabase
    .from("health_provenance")
    .insert({
      household_id: actor.householdId,
      source_type: input.sourceType === "home_send_document" ? "home_send_document" : "manual_entry",
      confidence: 1.0,
      confirmed_by: actor.memberId,
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (provenanceError) throw new Error(`createRecord failed to record provenance: ${provenanceError.code ?? "unknown"}`);

  const { data, error } = await supabase
    .from("health_records")
    .insert({
      household_id: actor.householdId,
      member_id: input.memberId,
      label: input.label,
      record_type: input.recordType,
      document_date: input.documentDate ?? null,
      file_path: input.filePath ?? null,
      notes: input.notes ?? null,
      privacy_scope: input.privacyScope,
      source_type: input.sourceType ?? "manual_entry",
      provenance_id: (provenanceRow as { id: string }).id,
      created_by_member_id: actor.memberId,
    })
    .select(SELECT)
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You may only file a record for yourself, or a child you guard.");
    throw new Error(`createRecord failed: ${error.code ?? "unknown"}`);
  }

  const record = toRecord(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.record_created",
    targetTable: "health_records",
    targetId: record.id,
    metadata: { memberId: record.memberId, recordType: record.recordType },
  });

  return record;
}

export type UpdateRecordInput = {
  label?: string;
  recordType?: RecordType;
  documentDate?: string | null;
  notes?: string | null;
  privacyScope?: PrivacyScope;
};

export async function updateRecord(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  id: string,
  input: UpdateRecordInput,
): Promise<HealthRecord> {
  const patch: Row = {};
  if (input.label !== undefined) patch.label = input.label;
  if (input.recordType !== undefined) patch.record_type = input.recordType;
  if (input.documentDate !== undefined) patch.document_date = input.documentDate;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.privacyScope !== undefined) patch.privacy_scope = input.privacyScope;

  const { data, error } = await supabase.from("health_records").update(patch).eq("id", id).eq("household_id", actor.householdId).select(SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only update your own record, or a child you guard's.");
    throw new Error(`updateRecord failed: ${error.code ?? "unknown"}`);
  }

  const record = toRecord(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.record_updated",
    targetTable: "health_records",
    targetId: record.id,
  });

  return record;
}

async function setRecordStatus(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  id: string,
  status: RecordStatus,
  eventType: "health.record_archived" | "health.record_reactivated",
): Promise<HealthRecord> {
  const { data, error } = await supabase.from("health_records").update({ status }).eq("id", id).eq("household_id", actor.householdId).select(SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only change your own record, or a child you guard's.");
    throw new Error(`setRecordStatus failed: ${error.code ?? "unknown"}`);
  }

  const record = toRecord(data as Row);

  await auditChange({ householdId: actor.householdId, actorMemberId: actor.memberId, eventType, targetTable: "health_records", targetId: record.id });

  return record;
}

/** Removing a record (CLAUDE.md rule 12) — the document stays filed, just out of the way; never a hard delete. */
export function archiveRecord(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, id: string): Promise<HealthRecord> {
  return setRecordStatus(supabase, actor, id, "archived", "health.record_archived");
}

export function reactivateRecord(supabase: SupabaseClient, actor: { householdId: string; memberId: string }, id: string): Promise<HealthRecord> {
  return setRecordStatus(supabase, actor, id, "active", "health.record_reactivated");
}
