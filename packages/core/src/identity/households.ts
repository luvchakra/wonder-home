import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";

import { auditChange } from "../api/audit";
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
  date_of_birth?: string | null;
  first_seen_at?: string | null;
  // A to-one embed comes back as an object, but the client's inferred types
  // describe every embed as an array, so both shapes are accepted here rather
  // than asserted away.
  households: HouseholdRow | HouseholdRow[] | null;
  household_roles: { role: HouseholdRole; created_at?: string | null }[] | null;
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

/**
 * Every household the caller belongs to, with their identity and roles in each.
 *
 * The embed names its foreign key explicitly, and has to. Two relationships
 * connect these tables — a member belongs to a household, and a household names
 * one member as its owner — so an unqualified `households(...)` is ambiguous and
 * PostgREST refuses the whole request with PGRST201 rather than guessing. That
 * refusal is invisible to SQL-level tests, because it is a property of the REST
 * layer and not of the schema.
 */
/**
 * Memoised per request: the shell, the page and its sections all need the
 * membership, and asking once is the difference between one query and four.
 */
export const listMemberships = cache(async (supabase: SupabaseClient): Promise<HouseholdMembership[]> => {
  const { data, error } = await supabase
    .from("household_members")
    .select(
      "id, display_name, member_type, date_of_birth, first_seen_at, households!household_members_household_id_fkey(id, name, timezone, status, owner_member_id), household_roles(role, created_at)",
    )
    .eq("status", "active");

  if (error) throw new Error(`listMemberships failed: ${error.code ?? "unknown"}`);

  return ((data ?? []) as unknown as MembershipRow[]).flatMap(toMembership);
});

export function toMembership(row: MembershipRow): HouseholdMembership[] {
  const household = Array.isArray(row.households) ? row.households[0] : row.households;
  if (!household) return [];

  return [
    {
      memberId: row.id,
      displayName: row.display_name,
      memberType: row.member_type,
      dateOfBirth: row.date_of_birth ?? null,
      roles: (row.household_roles ?? []).map((entry) => entry.role),
      firstSeenAt: row.first_seen_at ?? null,
      adminSince: adminSince(row.household_roles ?? []),
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

/**
 * Grants or revokes a role on a member (story 01-003).
 *
 * Authorization is decided here, in application code, before the database is
 * touched: canAssignRole() is authoritative and the RLS policy behind it is the
 * second line. Both refuse the same things, so neither is load-bearing alone.
 */
export async function setMemberRole(
  supabase: SupabaseClient,
  actor: HouseholdMembership,
  input: { memberId: string; role: HouseholdRole; granted: boolean },
): Promise<void> {
  const { canAssignRole } = await import("./permissions");

  if (!canAssignRole({ roles: actor.roles }, input.role)) {
    throw ApiError.forbidden(
      input.role === "administrator"
        ? "Only the Head of Family can change who administers the household."
        : "You do not have permission to change roles.",
    );
  }

  const householdId = actor.household.id;

  // A member of another household is not this actor's to change; the query is
  // scoped so a mismatched id simply matches nothing.
  const { data: target, error: lookupError } = await supabase
    .from("household_members")
    .select("id")
    .eq("id", input.memberId)
    .eq("household_id", householdId)
    .maybeSingle();

  if (lookupError) throw new Error(`setMemberRole lookup failed: ${lookupError.code ?? "unknown"}`);
  if (!target) throw ApiError.notFound("That member is not part of this household.");

  if (input.granted) {
    const { error } = await supabase
      .from("household_roles")
      .upsert(
        { household_id: householdId, member_id: input.memberId, role: input.role },
        { onConflict: "household_id,member_id,role" },
      );
    if (error) throw new Error(`granting role failed: ${error.code ?? "unknown"}`);
  } else {
    const { error } = await supabase
      .from("household_roles")
      .delete()
      .eq("household_id", householdId)
      .eq("member_id", input.memberId)
      .eq("role", input.role);
    if (error) throw new Error(`revoking role failed: ${error.code ?? "unknown"}`);
  }

  // Who may do what, and when it changed (story 15-006). The person it
  // happened to is the one most likely to ask, and the role name is the whole
  // of what is recorded — no names, no reason text, nothing private.
  await auditChange({
    householdId,
    actorMemberId: actor.memberId,
    eventType: input.granted ? "member.role_granted" : "member.role_revoked",
    targetTable: "household_roles",
    targetId: input.memberId,
    metadata: { role: input.role },
  });
}

/**
 * Adds a household helper with no account of their own (story 01-002, and
 * the same reasoning `identity/children.ts` states for a child: nothing here
 * should require a person the household is only tracking to hold an email
 * address or a session).
 *
 * `createInvitation`'s helper path assumes the helper has an email and will
 * accept for themselves; this is the other case — a helper the household
 * manages directly, the same way it already manages a child.
 */
export async function createHelperMember(
  supabase: SupabaseClient,
  actor: HouseholdMembership,
  input: { displayName: string },
): Promise<{ memberId: string }> {
  if (!isHouseholdAdmin(actor)) {
    throw ApiError.forbidden("Only the Head of Family or a Household Administrator can add a helper.");
  }

  const householdId = actor.household.id;

  const { data, error } = await supabase
    .from("household_members")
    .insert({ household_id: householdId, profile_id: null, member_type: "helper", display_name: input.displayName })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only the Head of Family or a Household Administrator can add a helper.");
    throw new Error(`createHelperMember failed: ${error.code ?? "unknown"}`);
  }

  const memberId = (data as { id: string }).id;

  const { error: roleError } = await supabase
    .from("household_roles")
    .insert({ household_id: householdId, member_id: memberId, role: "helper" });
  if (roleError) throw new Error(`createHelperMember role failed: ${roleError.code ?? "unknown"}`);

  await auditChange({
    householdId,
    actorMemberId: actor.memberId,
    eventType: "member.added",
    targetTable: "household_members",
    targetId: memberId,
    metadata: { memberType: "helper" },
  });

  return { memberId };
}

/**
 * Removes someone from the household (the other half of `createHelperMember`
 * and `createChildMember`, and of inviting someone in the first place — a
 * household that can add a person could not otherwise undo it).
 *
 * The Head of Family cannot be removed this way: ownership transfer is its
 * own operation, and a household is never left without one. Removing
 * yourself is not this control either — leaving a household you belong to is
 * a different action from removing someone else from it.
 *
 * A removed member's status becomes 'inactive' rather than the row being
 * deleted: everything that already references them (a past responsibility,
 * an audit entry, a certification item) stays readable, exactly as
 * `member_type` and the rest of this schema already assume.
 */
export async function deactivateMember(
  supabase: SupabaseClient,
  actor: HouseholdMembership,
  input: { memberId: string },
): Promise<void> {
  if (!isHouseholdAdmin(actor)) {
    throw ApiError.forbidden("Only the Head of Family or a Household Administrator can remove a member.");
  }
  if (input.memberId === actor.memberId) {
    throw ApiError.badRequest("You cannot remove yourself this way.");
  }

  const householdId = actor.household.id;

  const { data: target, error: lookupError } = await supabase
    .from("household_members")
    .select("id, household_roles(role)")
    .eq("id", input.memberId)
    .eq("household_id", householdId)
    .maybeSingle();

  if (lookupError) throw new Error(`deactivateMember lookup failed: ${lookupError.code ?? "unknown"}`);
  if (!target) throw ApiError.notFound("That member is not part of this household.");

  const roles = ((target as { household_roles: { role: HouseholdRole }[] | null }).household_roles ?? []).map((entry) => entry.role);
  if (roles.includes("head")) {
    throw ApiError.badRequest("The Head of Family cannot be removed. Transferring headship is a separate decision.");
  }

  const { error } = await supabase
    .from("household_members")
    .update({ status: "inactive" })
    .eq("id", input.memberId)
    .eq("household_id", householdId);

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only the Head of Family or a Household Administrator can remove a member.");
    throw new Error(`deactivateMember failed: ${error.code ?? "unknown"}`);
  }

  // Roles lapse with membership — an inactive member holding "administrator"
  // would be a permission nobody meant to leave granted.
  await supabase.from("household_roles").delete().eq("household_id", householdId).eq("member_id", input.memberId);

  await auditChange({
    householdId,
    actorMemberId: actor.memberId,
    eventType: "member.removed",
    targetTable: "household_members",
    targetId: input.memberId,
    metadata: { previousRoles: roles },
  });
}

/** The most recent grant of head or administrator: when this person's setup week begins. */
function adminSince(roles: readonly { role: HouseholdRole; created_at?: string | null }[]): string | null {
  const grants = roles
    .filter((entry) => (entry.role === "head" || entry.role === "administrator") && entry.created_at)
    .map((entry) => entry.created_at as string)
    .sort();
  return grants.length > 0 ? grants[grants.length - 1]! : null;
}
