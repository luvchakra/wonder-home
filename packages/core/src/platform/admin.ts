import type { SupabaseClient } from "@supabase/supabase-js";

import { recordAuditEvent } from "../api/audit";
import { ApiError } from "../api/errors";
import { verifyUser } from "../db/server";

/**
 * Platform administration (stories 16-001, 16-002, 16-004).
 *
 * A separate authorization boundary from household roles: the two systems do
 * not compose, and neither confers the other.
 *
 * Support access is applied here rather than in RLS. Threading it through every
 * tenant policy would put a backdoor in all of them, where one mistake reopens
 * every household; keeping it in one function means there is one place to
 * review and one place that audits.
 */

export type PlatformRole = "support" | "operator" | "owner";

export type PlatformAdmin = {
  profileId: string;
  role: PlatformRole;
};

/** What each platform role may do. Support deliberately cannot grant itself access. */
const PLATFORM_CAPABILITIES: Record<PlatformRole, readonly string[]> = {
  support: ["household.read_with_grant", "operations.read"],
  operator: [
    "household.read_with_grant",
    "operations.read",
    "ai_operations.read",
    "support_access.grant",
    "subscription.manage",
    "feature_flags.manage",
    "audit.read_platform",
    "privacy_requests.manage",
  ],
  owner: [
    "household.read_with_grant",
    "operations.read",
    "ai_operations.read",
    "support_access.grant",
    "subscription.manage",
    "feature_flags.manage",
    "audit.read_platform",
    "platform_admin.manage",
    "privacy_requests.manage",
  ],
};

export function platformCan(admin: PlatformAdmin, capability: string): boolean {
  return PLATFORM_CAPABILITIES[admin.role].includes(capability);
}

export async function requirePlatformAdmin(supabase: SupabaseClient): Promise<PlatformAdmin> {
  const user = await verifyUser(supabase);
  if (!user) throw ApiError.unauthenticated();

  const { data, error } = await supabase
    .from("platform_admins")
    .select("profile_id, role")
    .eq("profile_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (error) throw new Error(`platform admin lookup failed: ${error.code ?? "unknown"}`);
  // Not staff and no such boundary look identical from outside.
  if (!data) throw ApiError.notFound();

  return { profileId: data.profile_id as string, role: data.role as PlatformRole };
}

export type SupportReasonCode =
  | "user_reported_issue"
  | "billing_dispute"
  | "data_correction"
  | "security_investigation"
  | "legal_request";

export type SupportAccessRequest = {
  householdId: string;
  reasonCode: SupportReasonCode;
  reasonNote: string;
  scope?: "read" | "write";
  hours?: number;
};

/** Grants must end; an unbounded grant is standing access with extra steps. */
export const MAX_SUPPORT_HOURS = 24;
export const DEFAULT_SUPPORT_HOURS = 2;

export async function grantSupportAccess(
  adminClient: SupabaseClient,
  actor: PlatformAdmin,
  request: SupportAccessRequest,
  requestId?: string,
): Promise<{ grantId: string; expiresAt: string; hours: number }> {
  if (!platformCan(actor, "support_access.grant")) {
    throw ApiError.forbidden("Your platform role cannot grant household access.");
  }
  if (request.reasonNote.trim().length < 10) {
    throw ApiError.badRequest("Give a reason someone reviewing this later can understand.");
  }

  const hours = clampHours(request.hours ?? DEFAULT_SUPPORT_HOURS);
  const expiresAt = new Date(Date.now() + hours * 3_600_000).toISOString();

  const { data, error } = await adminClient
    .from("support_access_grants")
    .insert({
      household_id: request.householdId,
      admin_profile_id: actor.profileId,
      reason_code: request.reasonCode,
      reason_note: request.reasonNote.trim(),
      scope: request.scope ?? "read",
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (error) throw new Error(`grantSupportAccess failed: ${error.code ?? "unknown"}`);

  // The household can read this event; support access being visible to the
  // family it concerns is what separates it from surveillance.
  await recordAuditEvent(adminClient, {
    householdId: request.householdId,
    eventType: "support.access_granted",
    actorProfileId: actor.profileId,
    targetTable: "support_access_grants",
    targetId: data.id as string,
    metadata: { reasonCode: request.reasonCode, scope: request.scope ?? "read", hours },
    requestId,
  });

  return { grantId: data.id as string, expiresAt, hours };
}

export function clampHours(hours: number): number {
  if (!Number.isFinite(hours)) return DEFAULT_SUPPORT_HOURS;
  return Math.min(Math.max(Math.trunc(hours), 1), MAX_SUPPORT_HOURS);
}

/**
 * Confirms a live grant before staff touch household data.
 *
 * Every read of a household through the admin surface goes through this, so the
 * check cannot be present in most handlers and forgotten in one.
 */
export async function assertSupportAccess(
  adminClient: SupabaseClient,
  actor: PlatformAdmin,
  householdId: string,
): Promise<void> {
  const { data, error } = await adminClient
    .from("support_access_grants")
    .select("id")
    .eq("household_id", householdId)
    .eq("admin_profile_id", actor.profileId)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1);

  if (error) throw new Error(`support access check failed: ${error.code ?? "unknown"}`);
  if (!data || data.length === 0) {
    throw ApiError.forbidden("No active support grant for that household.");
  }
}

export type OperationsSummary = {
  households: number;
  members: number;
  activeSupportGrants: number;
};

/**
 * Platform-wide counts for the operations view.
 *
 * Aggregates only. An operations dashboard has no business showing what a
 * particular family is doing, and a count cannot become a window into one.
 */
export async function operationsSummary(adminClient: SupabaseClient): Promise<OperationsSummary> {
  const [households, members, grants] = await Promise.all([
    adminClient.from("households").select("id", { count: "exact", head: true }),
    adminClient.from("household_members").select("id", { count: "exact", head: true }),
    adminClient
      .from("support_access_grants")
      .select("id", { count: "exact", head: true })
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString()),
  ]);

  return {
    households: households.count ?? 0,
    members: members.count ?? 0,
    activeSupportGrants: grants.count ?? 0,
  };
}
