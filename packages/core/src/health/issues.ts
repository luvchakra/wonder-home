import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import { assessForMedicalAttention } from "./issue-safety";
import type { PrivacyScope } from "./repository";

/**
 * Health issues (story 21-003) — everyday observations through their own
 * lifecycle, never a diagnosis. Same self-or-guardian-only write model as
 * every other health entity; see the migration's own comment for why the
 * `health_provenance` row this creates never carries the issue's own
 * content.
 */

export const ISSUE_STATUSES = ["mentioned", "active", "monitoring", "resolved", "closed"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

const RESOLVED_STATUSES: readonly IssueStatus[] = ["resolved", "closed"];

/** Every status may move to any other status except itself — reopening a resolved or closed issue is exactly as valid as resolving an active one. */
const STATUS_TRANSITIONS: Record<IssueStatus, readonly IssueStatus[]> = {
  mentioned: ["active", "monitoring", "resolved", "closed"],
  active: ["mentioned", "monitoring", "resolved", "closed"],
  monitoring: ["mentioned", "active", "resolved", "closed"],
  resolved: ["mentioned", "active", "monitoring", "closed"],
  closed: ["mentioned", "active", "monitoring", "resolved"],
};

type Row = Record<string, unknown>;

export type HealthIssue = {
  id: string;
  householdId: string;
  memberId: string;
  label: string;
  description: string | null;
  status: IssueStatus;
  privacyScope: PrivacyScope;
  sourceType: string;
  provenanceId: string | null;
  notes: string | null;
  startedAt: string;
  resolvedAt: string | null;
  createdByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
};

const SELECT =
  "id, household_id, member_id, label, description, status, privacy_scope, source_type, provenance_id, notes, started_at, resolved_at, created_by_member_id, created_at, updated_at";

function toIssue(row: Row): HealthIssue {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    memberId: row.member_id as string,
    label: row.label as string,
    description: (row.description as string | null) ?? null,
    status: row.status as IssueStatus,
    privacyScope: row.privacy_scope as PrivacyScope,
    sourceType: row.source_type as string,
    provenanceId: (row.provenance_id as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    startedAt: row.started_at as string,
    resolvedAt: (row.resolved_at as string | null) ?? null,
    createdByMemberId: (row.created_by_member_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function listIssues(
  supabase: SupabaseClient,
  householdId: string,
  options: { memberId?: string; statuses?: readonly IssueStatus[] } = {},
): Promise<HealthIssue[]> {
  let query = supabase.from("health_issues").select(SELECT).eq("household_id", householdId).order("started_at", { ascending: false });
  if (options.memberId) query = query.eq("member_id", options.memberId);
  if (options.statuses?.length) query = query.in("status", options.statuses);

  const { data, error } = await query;
  if (error) throw new Error(`listIssues failed: ${error.code ?? "unknown"}`);
  return (data ?? []).map((row) => toIssue(row as Row));
}

export async function getIssue(supabase: SupabaseClient, householdId: string, id: string): Promise<HealthIssue | null> {
  const { data, error } = await supabase.from("health_issues").select(SELECT).eq("household_id", householdId).eq("id", id).maybeSingle();
  if (error) throw new Error(`getIssue failed: ${error.code ?? "unknown"}`);
  return data ? toIssue(data as Row) : null;
}

export type CreateIssueInput = {
  memberId: string;
  label: string;
  description?: string | null;
  privacyScope: PrivacyScope;
  notes?: string | null;
  startedAt?: string;
};

export type CreateIssueResult = {
  issue: HealthIssue;
  medicalAttention: ReturnType<typeof assessForMedicalAttention>;
};

/**
 * Records a new observation for the caller's own record, or for a child
 * they guard — RLS enforces which. Always creates a matching
 * `health_provenance` row (source `manual_entry`, confirmed by the actor
 * immediately — a person typing this in has already confirmed it) but never
 * copies the label, description or notes into that household-wide-readable
 * table.
 */
export async function createIssue(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  input: CreateIssueInput,
): Promise<CreateIssueResult> {
  const medicalAttention = assessForMedicalAttention(input.label, input.description, input.notes);

  const { data: provenanceRow, error: provenanceError } = await supabase
    .from("health_provenance")
    .insert({
      household_id: actor.householdId,
      source_type: "manual_entry",
      confidence: 1.0,
      confirmed_by: actor.memberId,
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (provenanceError) throw new Error(`createIssue failed to record provenance: ${provenanceError.code ?? "unknown"}`);

  const { data, error } = await supabase
    .from("health_issues")
    .insert({
      household_id: actor.householdId,
      member_id: input.memberId,
      label: input.label,
      description: input.description ?? null,
      privacy_scope: input.privacyScope,
      source_type: "manual_entry",
      provenance_id: (provenanceRow as { id: string }).id,
      notes: input.notes ?? null,
      started_at: input.startedAt ?? new Date().toISOString().slice(0, 10),
      created_by_member_id: actor.memberId,
    })
    .select(SELECT)
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You may only record an issue for yourself, or a child you guard.");
    throw new Error(`createIssue failed: ${error.code ?? "unknown"}`);
  }

  const issue = toIssue(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.issue_created",
    targetTable: "health_issues",
    targetId: issue.id,
    metadata: { memberId: issue.memberId },
  });

  return { issue, medicalAttention };
}

export type UpdateIssueInput = {
  label?: string;
  description?: string | null;
  notes?: string | null;
};

export type UpdateIssueResult = {
  issue: HealthIssue;
  medicalAttention: ReturnType<typeof assessForMedicalAttention>;
};

/** Editing an issue's own content — not its status, see setIssueStatus. */
export async function updateIssue(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  id: string,
  input: UpdateIssueInput,
): Promise<UpdateIssueResult> {
  const patch: Row = {};
  if (input.label !== undefined) patch.label = input.label;
  if (input.description !== undefined) patch.description = input.description;
  if (input.notes !== undefined) patch.notes = input.notes;

  const { data, error } = await supabase.from("health_issues").update(patch).eq("id", id).eq("household_id", actor.householdId).select(SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only update your own issue, or a child you guard's.");
    throw new Error(`updateIssue failed: ${error.code ?? "unknown"}`);
  }

  const issue = toIssue(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.issue_updated",
    targetTable: "health_issues",
    targetId: issue.id,
  });

  return { issue, medicalAttention: assessForMedicalAttention(issue.label, issue.description, issue.notes) };
}

/**
 * Moves an issue through mentioned → active → monitoring → resolved →
 * closed, or back — every status can reach every other one (CLAUDE.md rule
 * 12: an entity's state can always be undone, resolving is never one-way).
 */
export async function setIssueStatus(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  id: string,
  status: IssueStatus,
): Promise<HealthIssue> {
  const current = await getIssue(supabase, actor.householdId, id);
  if (!current) throw ApiError.notFound("That issue could not be found.");
  if (current.status !== status && !STATUS_TRANSITIONS[current.status].includes(status)) {
    throw ApiError.badRequest(`An issue that is ${current.status} cannot become ${status}.`);
  }

  const patch: Row = { status };
  patch.resolved_at = RESOLVED_STATUSES.includes(status) ? new Date().toISOString().slice(0, 10) : null;

  const { data, error } = await supabase.from("health_issues").update(patch).eq("id", id).eq("household_id", actor.householdId).select(SELECT).single();

  if (error) {
    if (error.code === "42501" || error.code === "PGRST116") throw ApiError.forbidden("You may only change your own issue, or a child you guard's.");
    throw new Error(`setIssueStatus failed: ${error.code ?? "unknown"}`);
  }

  const issue = toIssue(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.issue_status_changed",
    targetTable: "health_issues",
    targetId: issue.id,
    metadata: { from: current.status, to: status },
  });

  return issue;
}
