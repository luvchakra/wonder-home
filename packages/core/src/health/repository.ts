import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";

/**
 * Health foundation: profiles and the sharing ACL (story 21-001).
 *
 * Everything here goes through the household's own RLS-scoped client, never
 * the admin client — RLS is the authoritative word on who may see and write
 * what, per `wh.may_see_health()`'s per-row privacy scope. There is
 * deliberately no household-admin bypass baked into this module or into the
 * database policies underneath it: the product's own worked example draws
 * the line at household membership, not household administration, for
 * another adult's private health information (CLAUDE.md's health module
 * contract). The one relationship that does carry authority over someone
 * else's health data without their own consent is guardianship, already
 * recorded in `member_guardians` for the same reason in the school module.
 */

export const PRIVACY_SCOPES = ["private", "selected_family", "household_operational"] as const;
export type PrivacyScope = (typeof PRIVACY_SCOPES)[number];

type Row = Record<string, unknown>;

export type HealthProfile = {
  id: string;
  householdId: string;
  memberId: string;
  privacyScope: PrivacyScope;
  aiAssistanceEnabled: boolean;
  createdByMemberId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HealthConsent = {
  id: string;
  householdId: string;
  subjectMemberId: string;
  viewerMemberId: string;
  grantedByMemberId: string;
  createdAt: string;
};

function toProfile(row: Row): HealthProfile {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    memberId: row.member_id as string,
    privacyScope: row.privacy_scope as PrivacyScope,
    aiAssistanceEnabled: row.ai_assistance_enabled as boolean,
    createdByMemberId: (row.created_by_member_id as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function toConsent(row: Row): HealthConsent {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    subjectMemberId: row.subject_member_id as string,
    viewerMemberId: row.viewer_member_id as string,
    grantedByMemberId: row.granted_by_member_id as string,
    createdAt: row.created_at as string,
  };
}

/** A member's own health settings, or null if they have never set any — the household default (private, AI on) applies until they do. */
export async function getHealthProfile(
  supabase: SupabaseClient,
  householdId: string,
  memberId: string,
): Promise<HealthProfile | null> {
  const { data, error } = await supabase
    .from("health_profiles")
    .select("id, household_id, member_id, privacy_scope, ai_assistance_enabled, created_by_member_id, created_at, updated_at")
    .eq("household_id", householdId)
    .eq("member_id", memberId)
    .maybeSingle();

  if (error) throw new Error(`getHealthProfile failed: ${error.code ?? "unknown"}`);
  return data ? toProfile(data as Row) : null;
}

/**
 * Creates or updates a member's health settings.
 *
 * `input.memberId` may be the caller's own member id, or a child they guard
 * — nothing else, and RLS enforces that regardless of what this function is
 * told, `wh.may_see_health` for the read a subsequent list would need this
 * write to be visible under.
 */
export async function setHealthProfile(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  input: { memberId: string; privacyScope?: PrivacyScope; aiAssistanceEnabled?: boolean },
): Promise<HealthProfile> {
  const patch: Row = {
    household_id: actor.householdId,
    member_id: input.memberId,
    created_by_member_id: actor.memberId,
  };
  if (input.privacyScope !== undefined) patch.privacy_scope = input.privacyScope;
  if (input.aiAssistanceEnabled !== undefined) patch.ai_assistance_enabled = input.aiAssistanceEnabled;

  const { data, error } = await supabase
    .from("health_profiles")
    .upsert(patch, { onConflict: "household_id,member_id" })
    .select("id, household_id, member_id, privacy_scope, ai_assistance_enabled, created_by_member_id, created_at, updated_at")
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You may only manage your own health settings, or a child's you guard.");
    throw new Error(`setHealthProfile failed: ${error.code ?? "unknown"}`);
  }

  const profile = toProfile(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.profile_updated",
    targetTable: "health_profiles",
    targetId: profile.id,
    metadata: { memberId: input.memberId, privacyScope: profile.privacyScope },
  });

  return profile;
}

/** Everyone a subject member has explicitly granted SELECTED_FAMILY visibility into their health data. */
export async function listHealthConsents(
  supabase: SupabaseClient,
  householdId: string,
  subjectMemberId: string,
): Promise<HealthConsent[]> {
  const { data, error } = await supabase
    .from("health_consents")
    .select("id, household_id, subject_member_id, viewer_member_id, granted_by_member_id, created_at")
    .eq("household_id", householdId)
    .eq("subject_member_id", subjectMemberId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listHealthConsents failed: ${error.code ?? "unknown"}`);
  return (data ?? []).map((row) => toConsent(row as Row));
}

/**
 * Grants another member SELECTED_FAMILY visibility into the subject's
 * health data. Only the subject themselves, or a guardian granting on
 * behalf of the child they guard, may do this — RLS enforces it; this
 * function only translates the refusal into a household-facing message.
 */
export async function grantHealthConsent(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  input: { subjectMemberId: string; viewerMemberId: string },
): Promise<HealthConsent> {
  if (input.subjectMemberId === input.viewerMemberId) {
    throw ApiError.badRequest("A person cannot be granted access to their own data — they already have it.");
  }

  const { data, error } = await supabase
    .from("health_consents")
    .insert({
      household_id: actor.householdId,
      subject_member_id: input.subjectMemberId,
      viewer_member_id: input.viewerMemberId,
      granted_by_member_id: actor.memberId,
    })
    .select("id, household_id, subject_member_id, viewer_member_id, granted_by_member_id, created_at")
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only that person — or, for a child, their guardian — can share their health data.");
    if (error.code === "23505") throw ApiError.badRequest("That person already has access.");
    throw new Error(`grantHealthConsent failed: ${error.code ?? "unknown"}`);
  }

  const consent = toConsent(data as Row);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.consent_granted",
    targetTable: "health_consents",
    targetId: consent.id,
    metadata: { subjectMemberId: consent.subjectMemberId, viewerMemberId: consent.viewerMemberId },
  });

  return consent;
}

/** Revoking is this entity's "remove" (CLAUDE.md rule 12) — sharing granted can always be taken back. */
export async function revokeHealthConsent(
  supabase: SupabaseClient,
  actor: { householdId: string; memberId: string },
  consentId: string,
): Promise<void> {
  const { error } = await supabase
    .from("health_consents")
    .delete()
    .eq("household_id", actor.householdId)
    .eq("id", consentId);

  if (error) throw new Error(`revokeHealthConsent failed: ${error.code ?? "unknown"}`);

  await auditChange({
    householdId: actor.householdId,
    actorMemberId: actor.memberId,
    eventType: "health.consent_revoked",
    targetTable: "health_consents",
    targetId: consentId,
  });
}
