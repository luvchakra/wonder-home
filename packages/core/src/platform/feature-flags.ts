import type { SupabaseClient } from "@supabase/supabase-js";

import { recordAuditEvent } from "../api/audit";
import { ApiError } from "../api/errors";
import { platformCan, type PlatformAdmin } from "./admin";

/**
 * Household feature flags (story 16-008).
 *
 * A staged capability turned on for one household without a code deploy —
 * the same reason-coded, audited shape 16-005's plan changes already use.
 * The flag key is free text rather than a fixed catalog: the set of flags
 * this product actually has changes with the code, and this module has no
 * business pinning it. What it does own is the boundary — least-privilege,
 * validated, and never reachable without a reason someone reviewing this
 * later could understand.
 */

const FLAG_KEY_PATTERN = /^[a-z][a-z0-9_.]{1,80}$/;
const MIN_REASON_LENGTH = 10;

export type HouseholdFeatureFlag = {
  id: string;
  householdId: string;
  flagKey: string;
  enabled: boolean;
  reason: string;
  setByProfileId: string | null;
  updatedAt: Date;
};

export type SetFeatureFlagRequest = {
  householdId: string;
  flagKey: string;
  enabled: boolean;
  reason: string;
};

type Row = Record<string, unknown>;

function toFlag(row: Row): HouseholdFeatureFlag {
  return {
    id: row.id as string,
    householdId: row.household_id as string,
    flagKey: row.flag_key as string,
    enabled: row.enabled as boolean,
    reason: row.reason as string,
    setByProfileId: (row.set_by_profile_id as string | null) ?? null,
    updatedAt: new Date(row.updated_at as string),
  };
}

function requireFeatureFlagAccess(actor: PlatformAdmin): void {
  if (!platformCan(actor, "feature_flags.manage")) {
    throw ApiError.forbidden("Your platform role cannot manage a household's feature flags.");
  }
}

/**
 * Turns a flag on or off for one household.
 *
 * One row per household per key — setting the same key again replaces the
 * previous value and reason rather than accumulating a history of them,
 * because "what is this flag right now" is the question this table answers;
 * "who changed it, and why, over time" is what the audit trail is for.
 */
export async function setHouseholdFeatureFlag(
  adminClient: SupabaseClient,
  actor: PlatformAdmin,
  request: SetFeatureFlagRequest,
): Promise<HouseholdFeatureFlag> {
  requireFeatureFlagAccess(actor);

  if (!FLAG_KEY_PATTERN.test(request.flagKey)) {
    throw ApiError.badRequest("That is not a valid flag key.");
  }
  if (request.reason.trim().length < MIN_REASON_LENGTH) {
    throw ApiError.badRequest("Give a reason someone reviewing this later can understand.");
  }

  const { data, error } = await adminClient
    .from("household_feature_flags")
    .upsert(
      {
        household_id: request.householdId,
        flag_key: request.flagKey,
        enabled: request.enabled,
        set_by_profile_id: actor.profileId,
        reason: request.reason.trim(),
      },
      { onConflict: "household_id,flag_key" },
    )
    .select("id, household_id, flag_key, enabled, reason, set_by_profile_id, updated_at")
    .single();

  if (error) throw new Error(`setHouseholdFeatureFlag failed: ${error.code ?? "unknown"}`);

  await recordAuditEvent(adminClient, {
    householdId: request.householdId,
    eventType: "feature_flag.changed",
    actorProfileId: actor.profileId,
    targetTable: "household_feature_flags",
    targetId: (data as Row).id as string,
    metadata: { flagKey: request.flagKey, enabled: request.enabled },
  });

  return toFlag(data as Row);
}

/** Every flag set for one household, for the screen that shows staff what is on. */
export async function listHouseholdFeatureFlags(
  adminClient: SupabaseClient,
  actor: PlatformAdmin,
  householdId: string,
): Promise<HouseholdFeatureFlag[]> {
  requireFeatureFlagAccess(actor);

  const { data, error } = await adminClient
    .from("household_feature_flags")
    .select("id, household_id, flag_key, enabled, reason, set_by_profile_id, updated_at")
    .eq("household_id", householdId)
    .order("flag_key");

  if (error) throw new Error(`listHouseholdFeatureFlags failed: ${error.code ?? "unknown"}`);

  return ((data as Row[] | null) ?? []).map(toFlag);
}
