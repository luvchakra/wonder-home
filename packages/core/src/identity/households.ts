import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import type {
  CreateHouseholdInput,
  Household,
  HouseholdMembership,
  HouseholdRole,
  MemberType,
} from "./schemas";

/**
 * Household domain service (story 01-001).
 *
 * Business logic lives here, not in the route handler and not in a React
 * component, so the web UI and governed AI tools reach the same behaviour
 * through the same path (architecture/API-ARCHITECTURE.md).
 *
 * The client passed in is the caller's own session-scoped client, so RLS is in
 * force underneath every query here. That is deliberate: this layer is the
 * authoritative check, and RLS is the second line if it is ever wrong.
 */

type HouseholdRow = {
  id: string;
  name: string;
  timezone: string;
  status: Household["status"];
  owner_member_id: string | null;
};

type MembershipRow = {
  id: string;
  display_name: string;
  member_type: MemberType;
  // A to-one embed comes back as an object, but the client's inferred types
  // describe every embed as an array, so both shapes are accepted here rather
  // than asserted away.
  households: HouseholdRow | HouseholdRow[] | null;
  household_roles: { role: HouseholdRole }[] | null;
};

/**
 * Creates a household and makes the caller its Head of Family.
 *
 * Delegates to wh.create_household() so the household, its first member, that
 * member's head role and the audit record are one transaction — a half-created
 * tenant cannot exist, and no direct INSERT policy on households is needed.
 */
export async function createHousehold(
  supabase: SupabaseClient,
  input: CreateHouseholdInput,
): Promise<{ householdId: string; memberId: string }> {
  const { data, error } = await supabase
    .rpc("create_household", {
      p_household_name: input.householdName,
      p_display_name: input.displayName,
      p_timezone: input.timezone,
    })
    .select()
    .single();

  if (error) {
    // The function raises insufficient_privilege when there is no session.
    if (error.code === "42501") throw ApiError.unauthenticated();
    throw new Error(`create_household failed: ${error.code ?? "unknown"}`);
  }

  const row = data as { household_id: string; member_id: string };
  return { householdId: row.household_id, memberId: row.member_id };
}

/** Every household the caller belongs to, with their identity and roles in each. */
export async function listMemberships(supabase: SupabaseClient): Promise<HouseholdMembership[]> {
  const { data, error } = await supabase
    .from("household_members")
    .select(
      "id, display_name, member_type, households(id, name, timezone, status, owner_member_id), household_roles(role)",
    )
    .eq("status", "active");

  if (error) throw new Error(`listMemberships failed: ${error.code ?? "unknown"}`);

  return ((data ?? []) as unknown as MembershipRow[]).flatMap(toMembership);
}

export function toMembership(row: MembershipRow): HouseholdMembership[] {
  const household = Array.isArray(row.households) ? row.households[0] : row.households;
  if (!household) return [];

  return [
    {
      memberId: row.id,
      displayName: row.display_name,
      memberType: row.member_type,
      roles: (row.household_roles ?? []).map((entry) => entry.role),
      household: {
        id: household.id,
        name: household.name,
        timezone: household.timezone,
        status: household.status,
        ownerMemberId: household.owner_member_id,
      },
    },
  ];
}

/**
 * The caller's membership in one household, or a refusal.
 *
 * Every household-scoped endpoint starts here: application authorization is
 * authoritative, so the answer is computed explicitly rather than inferred from
 * whether a query happened to return rows.
 */
export async function requireMembership(
  supabase: SupabaseClient,
  householdId: string,
): Promise<HouseholdMembership> {
  const membership = (await listMemberships(supabase)).find(
    (entry) => entry.household.id === householdId,
  );
  // Not a member and no such household give the same answer on purpose: any
  // other response would confirm that a household with this id exists.
  if (!membership) throw ApiError.notFound();
  return membership;
}

export function isHouseholdAdmin(membership: HouseholdMembership): boolean {
  return membership.roles.includes("head") || membership.roles.includes("administrator");
}

export async function requireHouseholdAdmin(
  supabase: SupabaseClient,
  householdId: string,
): Promise<HouseholdMembership> {
  const membership = await requireMembership(supabase, householdId);
  if (!isHouseholdAdmin(membership)) {
    throw ApiError.forbidden("Only the Head of Family or a Household Administrator can do this.");
  }
  return membership;
}

export type HouseholdMember = {
  id: string;
  displayName: string;
  memberType: MemberType;
  status: "active" | "invited" | "inactive";
  roles: HouseholdRole[];
  isOwner: boolean;
};

/** Everyone in a household, as any member of it may see them. */
export async function listMembers(
  supabase: SupabaseClient,
  householdId: string,
  ownerMemberId: string | null,
): Promise<HouseholdMember[]> {
  const { data, error } = await supabase
    .from("household_members")
    .select("id, display_name, member_type, status, household_roles(role)")
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`listMembers failed: ${error.code ?? "unknown"}`);

  return (data ?? []).map((row) => ({
    id: row.id as string,
    displayName: row.display_name as string,
    memberType: row.member_type as MemberType,
    status: row.status as HouseholdMember["status"],
    roles: ((row.household_roles ?? []) as { role: HouseholdRole }[]).map((entry) => entry.role),
    isOwner: row.id === ownerMemberId,
  }));
}
