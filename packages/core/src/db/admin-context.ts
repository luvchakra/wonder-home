import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdMembership } from "../identity/schemas";
import type { PlatformAdmin } from "../platform/admin";
import { createAdminClient } from "./admin";

/**
 * The service-role client, handed out only against the authorization it relies on
 * (story SEC-04).
 *
 * `createAdminClient()` bypasses Row Level Security, so every caller must decide
 * first who may cross which boundary. Before SEC-04 that decision was a convention
 * per call site; here it is a required argument. A grant is minted only from the
 * evidence an existing check returned — the membership from `requireMembership`, the
 * staff row from `requirePlatformAdmin`, a webhook whose signature verified — and it
 * says which household (if any) it covers, so `adminClientFor` can refuse a grant
 * that is pointed at another household.
 *
 * Raw `createAdminClient()` that writes is checked by `npm run lint:service-role`
 * (scripts/lint-service-role.mjs): it must go through here or be on the documented
 * RLS-bypass list in security/service-role-baseline.json.
 */
declare const grantBrand: unique symbol;

export type AdminGrantKind =
  /** A signed-in member of `householdId`, from `requireMembership`. */
  | "household-member"
  /** An Admin of `householdId`, from `requireHouseholdAdmin`. */
  | "household-admin"
  /** Active WonderHome staff, from `requirePlatformAdmin`. */
  | "platform-admin"
  /** An inbound request whose sender signature or shared secret verified. */
  | "signed-request"
  /** A single-purpose token the caller verified (an email link, an invitation). */
  | "capability-token"
  /** A scheduled or queued job authenticated by the worker secret. */
  | "worker";

export type AdminGrant = {
  readonly kind: AdminGrantKind;
  /** The one household this grant covers; null when it legitimately spans households. */
  readonly householdId: string | null;
  /** Who the decision was made for (member id, staff profile id, sender, job). */
  readonly subject: string;
  /** Why the service role is needed here, in a few words. Shows up in errors. */
  readonly purpose: string;
  readonly [grantBrand]: true;
};

function mint(kind: AdminGrantKind, householdId: string | null, subject: string, purpose: string): AdminGrant {
  if (!purpose.trim()) throw new Error("adminGrant: a purpose is required");
  return Object.freeze({ kind, householdId, subject, purpose }) as AdminGrant;
}

function isAdminMembership(membership: HouseholdMembership): boolean {
  return membership.roles.includes("head") || membership.roles.includes("administrator");
}

export const adminGrant = {
  member(membership: HouseholdMembership, purpose: string): AdminGrant {
    return mint("household-member", membership.household.id, membership.memberId, purpose);
  },
  householdAdmin(membership: HouseholdMembership, purpose: string): AdminGrant {
    if (!isAdminMembership(membership)) throw new Error("adminGrant.householdAdmin: membership is not an Admin");
    return mint("household-admin", membership.household.id, membership.memberId, purpose);
  },
  platformAdmin(admin: PlatformAdmin, purpose: string): AdminGrant {
    return mint("platform-admin", null, admin.profileId, purpose);
  },
  /** `sender` names the verified source, e.g. "whatsapp" or "stripe". Scope it with `householdId` once the payload names one. */
  signedRequest(sender: string, purpose: string, householdId: string | null = null): AdminGrant {
    return mint("signed-request", householdId, sender, purpose);
  },
  capabilityToken(tokenPurpose: string, purpose: string, householdId: string | null = null): AdminGrant {
    return mint("capability-token", householdId, tokenPurpose, purpose);
  },
  worker(job: string, purpose: string, householdId: string | null = null): AdminGrant {
    return mint("worker", householdId, job, purpose);
  },
} as const;

export class AdminGrantScopeError extends Error {
  constructor(grant: AdminGrant, householdId: string) {
    super(`service-role grant (${grant.kind}: ${grant.purpose}) covers household ${grant.householdId}, not ${householdId}`);
    this.name = "AdminGrantScopeError";
  }
}

/**
 * The service-role client for this grant. Pass `householdId` when the operation
 * targets one household: a grant scoped to a different household is refused.
 */
export function adminClientFor(grant: AdminGrant, householdId?: string): SupabaseClient {
  if (householdId !== undefined) assertGrantCovers(grant, householdId);
  return createAdminClient();
}

export function assertGrantCovers(grant: AdminGrant, householdId: string): void {
  if (grant.householdId !== null && grant.householdId !== householdId) throw new AdminGrantScopeError(grant, householdId);
}
