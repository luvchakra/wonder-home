import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import { parseHouseholdSettings, parseLocaleSetup, parseMemberChoices } from "../i18n/preferences";
import { completedYears, parseDateOfBirth } from "./age";
import { dispatchWebhookEvent } from "../webhooks/dispatch";
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
  key_member_id: string | null;
  region?: string | null;
  currency?: string | null;
  measurement_system?: string | null;
  default_language?: string | null;
};

type MembershipRow = {
  id: string;
  display_name: string;
  member_type: MemberType;
  date_of_birth?: string | null;
  first_seen_at?: string | null;
  language?: string | null;
  date_format?: string | null;
  time_format?: string | null;
  measurement_system?: string | null;
  locale_setup_status?: string | null;
  locale_setup_step?: string | null;
  locale_prompt_dismissed_at?: string | null;
  // A to-one embed comes back as an object, but the client's inferred types
  // describe every embed as an array, so both shapes are accepted here rather
  // than asserted away.
  households: HouseholdRow | HouseholdRow[] | null;
  household_roles: { role: HouseholdRole; created_at?: string | null }[] | null;
};

/**
 * Creates a household and makes the caller its owner and Admin.
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
 * `profile_id = auth.uid()` is not optional here even though RLS already
 * scopes the underlying table: `household_members_select_member` lets any
 * member read *every* row of their own household (the family list needs
 * that), so an unfiltered query here would return every family member's row,
 * not just the caller's — one household could produce several entries, and
 * every caller of this function assumes exactly one per household, their
 * own. Without this filter, `requireSession`'s `memberships[0]` (and every
 * other `.find(household.id === x)` downstream) picks whichever member's
 * row an unordered query happened to return first — which member that is
 * is undefined behaviour, not necessarily the signed-in person. That is
 * exactly how one household's parent ended up signed in behind their
 * child's own personalized view.
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
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return [];

  const { data, error } = await supabase
    .from("household_members")
    .select(
      "id, display_name, member_type, date_of_birth, first_seen_at, language, date_format, time_format, measurement_system, locale_setup_status, locale_setup_step, locale_prompt_dismissed_at, households!household_members_household_id_fkey(id, name, timezone, status, owner_member_id, key_member_id, region, currency, measurement_system, default_language), household_roles(role, created_at)",
    )
    .eq("status", "active")
    .eq("profile_id", userId);

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
        keyMemberId: household.key_member_id,
      },
      locale: {
        household: parseHouseholdSettings({
          region: household.region,
          currency: household.currency,
          timezone: household.timezone,
          measurement_system: household.measurement_system,
          language: household.default_language,
        }),
        member: parseMemberChoices(row),
        setup: parseLocaleSetup(row),
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
    throw ApiError.forbidden("Only an Admin can do this.");
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
  dateOfBirth: string | null;
  nickname: string | null;
  relationship: string | null;
  occupation: string | null;
  schoolOrWorkLocation: string | null;
  specialOccasionLabel: string | null;
  specialOccasionDate: string | null;
  /** How they describe their gender, if the household records it — open text. */
  gender: string | null;
  /** Anything the household wants to remember about them. */
  notes: string | null;
  /** A short-lived signed URL, minted fresh by `listMembers` on every read — never stored or cached (the bucket is private). */
  avatarUrl: string | null;
  /** How an adult works, as the family said it during setup — shapes suggestions, never a permission. */
  workArrangement?: WorkArrangement | null;
  /** Current age in whole years: from the date of birth when there is one, else from an age the family stated. */
  ageYears?: number | null;
  /** Whether they sign in themselves — false for a child, a helper, or an adult added during setup who has not accepted an invitation yet. */
  hasAccount?: boolean;
};

export const WORK_ARRANGEMENTS = ["office", "home", "hybrid", "not_working"] as const;
export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];
export const WORK_ARRANGEMENT_LABELS: Record<WorkArrangement, string> = {
  office: "Works from the office",
  home: "Works from home",
  hybrid: "Hybrid",
  not_working: "Not working",
};

/**
 * Whole years now, from a date of birth if the household gave one, else from
 * an age it stated on a given day (story 02-009). A real birthday always wins,
 * and a stated age grows with the calendar rather than staying frozen.
 */
export function currentAge(
  input: { dateOfBirth: string | null; ageYears: number | null; ageRecordedOn: string | null },
  now: Date = new Date(),
): number | null {
  const birth = parseDateOfBirth(input.dateOfBirth);
  if (birth) return completedYears(birth, now);
  if (input.ageYears === null) return null;
  const recorded = parseDateOfBirth(input.ageRecordedOn);
  return recorded ? input.ageYears + completedYears(recorded, now) : input.ageYears;
}

/** The fields a household can edit about one of its own members, beyond creation. */
export type MemberProfileUpdate = {
  displayName?: string;
  dateOfBirth?: string | null;
  nickname?: string | null;
  relationship?: string | null;
  occupation?: string | null;
  schoolOrWorkLocation?: string | null;
  specialOccasionLabel?: string | null;
  specialOccasionDate?: string | null;
  gender?: string | null;
  notes?: string | null;
  /** The storage object path just uploaded to the `avatars` bucket, or null to clear the photo. */
  avatarPath?: string | null;
  workArrangement?: WorkArrangement | null;
  /** An age stated instead of a date of birth; recorded as true today. */
  ageYears?: number | null;
};

const MEMBER_SELECT =
  "id, profile_id, display_name, member_type, status, date_of_birth, nickname, relationship, occupation, school_or_work_location, special_occasion_label, special_occasion_date, gender, notes, avatar_path, work_arrangement, age_years, age_recorded_on, household_roles(role)";

type MemberRow = {
  id: string;
  profile_id?: string | null;
  display_name: string;
  member_type: string;
  status: string;
  date_of_birth: string | null;
  nickname: string | null;
  relationship: string | null;
  occupation: string | null;
  school_or_work_location: string | null;
  special_occasion_label: string | null;
  special_occasion_date: string | null;
  gender: string | null;
  notes: string | null;
  avatar_path: string | null;
  work_arrangement: string | null;
  age_years: number | null;
  age_recorded_on: string | null;
  household_roles: { role: HouseholdRole }[] | null;
};

function toHouseholdMember(row: MemberRow, ownerMemberId: string | null, avatarUrl: string | null): HouseholdMember {
  return {
    id: row.id,
    displayName: row.display_name,
    memberType: row.member_type as MemberType,
    status: row.status as HouseholdMember["status"],
    roles: (row.household_roles ?? []).map((entry) => entry.role),
    isOwner: row.id === ownerMemberId,
    dateOfBirth: row.date_of_birth,
    nickname: row.nickname,
    relationship: row.relationship,
    occupation: row.occupation,
    schoolOrWorkLocation: row.school_or_work_location,
    specialOccasionLabel: row.special_occasion_label,
    specialOccasionDate: row.special_occasion_date,
    gender: row.gender,
    notes: row.notes,
    avatarUrl,
    workArrangement: (WORK_ARRANGEMENTS as readonly string[]).includes(row.work_arrangement ?? "") ? (row.work_arrangement as WorkArrangement) : null,
    ageYears: currentAge({ dateOfBirth: row.date_of_birth, ageYears: row.age_years, ageRecordedOn: row.age_recorded_on }),
    hasAccount: Boolean(row.profile_id),
  };
}

/** How long a minted avatar URL stays valid — one render's worth, not a link worth saving. */
const AVATAR_SIGNED_URL_TTL_SECONDS = 3600;

/**
 * Everyone in a household, as any member of it may see them.
 *
 * A photo's `avatar_path` is a storage object path, not a URL — the
 * `avatars` bucket is private, so a signed URL is minted here, fresh on
 * every call, rather than stored anywhere. Storage's own `createSignedUrls`
 * batches every path a household actually has photos for into one round
 * trip rather than one request per member.
 */
export async function listMembers(
  supabase: SupabaseClient,
  householdId: string,
  ownerMemberId: string | null,
): Promise<HouseholdMember[]> {
  const { data, error } = await supabase
    .from("household_members")
    .select(MEMBER_SELECT)
    .eq("household_id", householdId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`listMembers failed: ${error.code ?? "unknown"}`);

  const rows = (data ?? []) as MemberRow[];
  const avatarUrlByPath = await signAvatarPaths(
    supabase,
    rows.map((row) => row.avatar_path).filter((path): path is string => path !== null),
  );

  return rows.map((row) => toHouseholdMember(row, ownerMemberId, row.avatar_path ? (avatarUrlByPath.get(row.avatar_path) ?? null) : null));
}

async function signAvatarPaths(supabase: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (paths.length === 0) return result;

  const { data, error } = await supabase.storage.from("avatars").createSignedUrls(paths, AVATAR_SIGNED_URL_TTL_SECONDS);
  if (error || !data) return result;

  for (const entry of data) {
    if (entry.signedUrl && !entry.error) result.set(entry.path ?? "", entry.signedUrl);
  }
  return result;
}

/**
 * Updates the extended details a household keeps about one of its members —
 * the other half of `createHelperMember`/`createChildMember`/invitation
 * acceptance, none of which can be revisited once the person exists
 * (CLAUDE.md's "every entity can be added, updated and removed").
 *
 * An Admin may edit anyone; any member may also edit themselves — the
 * `household_members_update_self` RLS policy (and the trigger that keeps it
 * from reaching `member_type`/`status`/`household_id`/`profile_id`) is what
 * actually enforces this, not the check below, which only turns a doomed
 * request into a clear error before a network round trip.
 */
export async function updateMemberProfile(
  supabase: SupabaseClient,
  actor: HouseholdMembership,
  input: { memberId: string } & MemberProfileUpdate,
): Promise<void> {
  if (!isHouseholdAdmin(actor) && input.memberId !== actor.memberId) {
    throw ApiError.forbidden("You can edit your own details, or an Admin can edit anyone's.");
  }

  const householdId = actor.household.id;
  const patch: Record<string, unknown> = {};
  if (input.displayName !== undefined) patch.display_name = input.displayName;
  if (input.dateOfBirth !== undefined) patch.date_of_birth = input.dateOfBirth;
  if (input.nickname !== undefined) patch.nickname = input.nickname;
  if (input.relationship !== undefined) patch.relationship = input.relationship;
  if (input.occupation !== undefined) patch.occupation = input.occupation;
  if (input.schoolOrWorkLocation !== undefined) patch.school_or_work_location = input.schoolOrWorkLocation;
  if (input.specialOccasionLabel !== undefined) patch.special_occasion_label = input.specialOccasionLabel;
  if (input.specialOccasionDate !== undefined) patch.special_occasion_date = input.specialOccasionDate;
  if (input.gender !== undefined) patch.gender = input.gender;
  if (input.notes !== undefined) patch.notes = input.notes;
  if (input.avatarPath !== undefined) patch.avatar_path = input.avatarPath;
  if (input.workArrangement !== undefined) patch.work_arrangement = input.workArrangement;
  if (input.ageYears !== undefined) {
    patch.age_years = input.ageYears;
    patch.age_recorded_on = input.ageYears === null ? null : new Date().toISOString().slice(0, 10);
  }

  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase
    .from("household_members")
    .update(patch)
    .eq("id", input.memberId)
    .eq("household_id", householdId);

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You can edit your own details, or an Admin can edit anyone's.");
    throw new Error(`updateMemberProfile failed: ${error.code ?? "unknown"}`);
  }

  await auditChange({
    householdId,
    actorMemberId: actor.memberId,
    eventType: "member.profile_updated",
    targetTable: "household_members",
    targetId: input.memberId,
    metadata: { fields: Object.keys(patch) },
  });
}

/**
 * An adult the household records before they have a login (story 02-009) —
 * a partner, a grandparent — named during setup so responsibilities can be
 * shared with them from day one. The same shape as `createHelperMember`: a
 * member with no profile, managed by an Admin. If they are invited later,
 * the invitation names this member and accepting it links the new account
 * here (`wh.accept_invitation`) rather than creating a second person.
 */
export async function createAdultMember(
  supabase: SupabaseClient,
  actor: HouseholdMembership,
  input: { displayName: string; relationship?: string | null; workArrangement?: WorkArrangement | null },
): Promise<{ memberId: string }> {
  if (!isHouseholdAdmin(actor)) {
    throw ApiError.forbidden("Only an Admin can add someone to the household.");
  }

  const householdId = actor.household.id;
  const { data, error } = await supabase
    .from("household_members")
    .insert({
      household_id: householdId,
      profile_id: null,
      member_type: "adult",
      display_name: input.displayName,
      relationship: input.relationship ?? null,
      work_arrangement: input.workArrangement ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only an Admin can add someone to the household.");
    throw new Error(`createAdultMember failed: ${error.code ?? "unknown"}`);
  }

  const memberId = (data as { id: string }).id;
  const { error: roleError } = await supabase
    .from("household_roles")
    .insert({ household_id: householdId, member_id: memberId, role: "adult" });
  if (roleError) throw new Error(`createAdultMember role failed: ${roleError.code ?? "unknown"}`);

  await auditChange({
    householdId,
    actorMemberId: actor.memberId,
    eventType: "member.added",
    targetTable: "household_members",
    targetId: memberId,
    metadata: { memberType: "adult" },
  });

  return { memberId };
}

/**
 * Whether this member is the older or younger sibling among the household's
 * other children — derived from `date_of_birth`, never stored, so it can
 * never disagree with the birthdate the household already keeps (design
 * principle 9: a fact somebody can explain, not a second copy of one).
 *
 * Says nothing when there is only one child, or when a birthdate is missing
 * for this member or every other child — there is nothing true to compare.
 */
export function siblingOrder(member: HouseholdMember, allMembers: readonly HouseholdMember[]): string | null {
  if (!member.dateOfBirth) return null;
  const ownBirth = Date.parse(member.dateOfBirth);

  const otherSiblings = allMembers
    .filter((other) => other.id !== member.id && other.memberType === "child" && other.dateOfBirth)
    .map((other) => ({ name: other.displayName, birth: Date.parse(other.dateOfBirth as string) }))
    .filter((other) => Number.isFinite(other.birth));

  if (otherSiblings.length === 0) return null;

  const older = otherSiblings.filter((other) => other.birth < ownBirth).map((other) => other.name);
  const younger = otherSiblings.filter((other) => other.birth > ownBirth).map((other) => other.name);

  const parts: string[] = [];
  if (younger.length > 0) parts.push(`Older sibling of ${younger.join(", ")}`);
  if (older.length > 0) parts.push(`Younger sibling of ${older.join(", ")}`);
  return parts.length > 0 ? parts.join(" · ") : null;
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
        ? "Only the household's owner can change who administers the household."
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
  input: { displayName: string; gender?: string | null; notes?: string | null },
): Promise<{ memberId: string }> {
  if (!isHouseholdAdmin(actor)) {
    throw ApiError.forbidden("Only an Admin can add a helper.");
  }

  const householdId = actor.household.id;

  const { data, error } = await supabase
    .from("household_members")
    .insert({
      household_id: householdId,
      profile_id: null,
      member_type: "helper",
      display_name: input.displayName,
      gender: input.gender ?? null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only an Admin can add a helper.");
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
 * The household's owner cannot be removed this way: ownership transfer is its
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
    throw ApiError.forbidden("Only an Admin can remove a member.");
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
    throw ApiError.badRequest("The household's owner cannot be removed. Transferring ownership is a separate decision.");
  }

  const { error } = await supabase
    .from("household_members")
    .update({ status: "inactive" })
    .eq("id", input.memberId)
    .eq("household_id", householdId);

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only an Admin can remove a member.");
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

  await dispatchWebhookEvent({
    householdId,
    eventType: "member.removed",
    data: { memberId: input.memberId },
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
