import type { SupabaseClient } from "@supabase/supabase-js";

import { recordAuditEvent } from "../api/audit";
import { ApiError } from "../api/errors";
import { platformCan, type PlatformAdmin } from "./admin";

/**
 * Platform-side visibility into export/deletion requests (story 16-007).
 *
 * `privacy_requests` has never had a platform-admin read or write policy —
 * only the household's own session could ever see a request, which meant
 * staff had no way to see what was pending across the fleet, or to refuse
 * one (the schema has always supported `status: 'refused'` and
 * `refusal_reason`; nothing ever wrote either). This is that visibility and
 * that action, on the admin client the same way every other platform-admin
 * capability reaches data RLS does not grant a household session.
 *
 * Actually fulfilling a matured deletion is `fulfill-deletion.ts`'s job, not
 * this module's — this is read/refuse only, the same "operator/owner, not
 * support" boundary `feature_flags.manage` already draws for a comparably
 * consequential household-affecting action.
 */

export type PlatformPrivacyRequest = {
  id: string;
  householdId: string;
  kind: "export" | "deletion";
  status: "pending" | "ready" | "completed" | "cancelled" | "refused";
  subjectMemberId: string | null;
  requestedByMemberId: string | null;
  actsAt: string | null;
  completedAt: string | null;
  refusalReason: string | null;
  createdAt: string;
};

export type ListPrivacyRequestsFilter = {
  status?: PlatformPrivacyRequest["status"];
  kind?: PlatformPrivacyRequest["kind"];
  householdId?: string;
};

type Row = Record<string, unknown>;

function toRequest(row: Row): PlatformPrivacyRequest {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    kind: row.kind as PlatformPrivacyRequest["kind"],
    status: row.status as PlatformPrivacyRequest["status"],
    subjectMemberId: (row.subject_member_id as string | null) ?? null,
    requestedByMemberId: (row.requested_by_member_id as string | null) ?? null,
    actsAt: (row.acts_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
    refusalReason: (row.refusal_reason as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

function requirePrivacyRequestAccess(actor: PlatformAdmin): void {
  if (!platformCan(actor, "privacy_requests.manage")) {
    throw ApiError.forbidden("Your platform role cannot manage privacy requests.");
  }
}

/** Platform-wide, for the screen that shows staff what's pending across every household. */
export async function listPlatformPrivacyRequests(
  adminClient: SupabaseClient,
  actor: PlatformAdmin,
  filter: ListPrivacyRequestsFilter = {},
): Promise<PlatformPrivacyRequest[]> {
  requirePrivacyRequestAccess(actor);

  let query = adminClient
    .from("privacy_requests")
    .select(
      "id, household_id, kind, status, subject_member_id, requested_by_member_id, acts_at, completed_at, refusal_reason, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (filter.status) query = query.eq("status", filter.status);
  if (filter.kind) query = query.eq("kind", filter.kind);
  if (filter.householdId) query = query.eq("household_id", filter.householdId);

  const { data, error } = await query;
  if (error) throw new Error(`listPlatformPrivacyRequests failed: ${error.code ?? "unknown"}`);

  return ((data ?? []) as Row[]).map(toRequest);
}

/**
 * Refuses a pending or ready request, with a reason someone reviewing this
 * later could understand.
 *
 * Refusing an export is rare but real (a legal hold on the data it would
 * include); refusing a deletion stops its grace window from ever maturing —
 * the household still owns the decision to ask again, this only says no to
 * the one already waiting.
 */
export async function refusePrivacyRequest(
  adminClient: SupabaseClient,
  actor: PlatformAdmin,
  input: { requestId: string; reason: string },
): Promise<void> {
  requirePrivacyRequestAccess(actor);

  if (input.reason.trim().length < 10) {
    throw ApiError.badRequest("Give a reason someone reviewing this later can understand.");
  }

  const { data, error } = await adminClient
    .from("privacy_requests")
    .update({ status: "refused", refusal_reason: input.reason.trim() })
    .eq("id", input.requestId)
    .in("status", ["pending", "ready"])
    .select("id, household_id")
    .maybeSingle();

  if (error) throw new Error(`refusePrivacyRequest failed: ${error.code ?? "unknown"}`);
  if (!data) throw ApiError.notFound("There is no pending or ready request with that id.");

  // The reason lives on the request row itself (`refusal_reason`), which
  // the subject can already read under its own RLS policy — not duplicated
  // into audit metadata, the same "one place for free text" choice
  // `feature_flags.manage`'s own audit write already makes.
  await recordAuditEvent(adminClient, {
    householdId: (data as Row).household_id as string,
    eventType: "privacy.request_refused",
    actorProfileId: actor.profileId,
    targetTable: "privacy_requests",
    targetId: input.requestId,
  });
}
