"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@wonderhome/core/db/server";
import { requireHouseholdAdmin, requireMembership } from "@wonderhome/core/identity/households";
import {
  acceptInvitation,
  createInvitation,
  revokeInvitation,
} from "@wonderhome/core/identity/invitations";
import { GENDER_MAX_LENGTH, MEMBER_NOTES_MAX_LENGTH } from "@wonderhome/core/identity/member-details";
import { log } from "@wonderhome/core/observability/logger";

import type { ActionState } from "./actions";

/** Membership actions for story 01-002. */

const inviteSchema = z.object({
  householdId: z.uuid(),
  email: z.email({ error: "Enter a valid email address." }),
  displayName: z.string().trim().min(1, { error: "Give them a name." }).max(80),
  role: z.enum(["administrator", "adult", "helper"]).default("adult"),
});

export type InviteState = ActionState & {
  /** Shown once so the inviter can pass it on; never stored, never logged. */
  inviteUrl?: string;
};

export async function inviteMemberAction(
  _previous: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const parsed = inviteSchema.safeParse({
    householdId: formData.get("householdId"),
    email: formData.get("email"),
    displayName: formData.get("displayName"),
    role: formData.get("role") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  const supabase = await createClient();

  try {
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);

    if (parsed.data.role === "administrator" && !membership.roles.includes("head")) {
      return { error: "Only the household's owner can invite another Admin." };
    }

    const invitation = await createInvitation(supabase, membership.memberId, {
      householdId: parsed.data.householdId,
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      memberType: parsed.data.role === "helper" ? "helper" : "adult",
      role: parsed.data.role,
    });

    revalidatePath("/household/members");

    // There is no email provider configured, and claiming one would be a fake
    // integration, so the link is handed back for the inviter to pass on.
    return { inviteUrl: `/invite/${invitation.token}` };
  } catch (error) {
    log.warn("invitation failed", { reason: error instanceof Error ? error.name : "unknown" });
    return { error: "We could not create that invitation. Please try again." };
  }
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const invitationId = z.uuid().safeParse(formData.get("invitationId"));
  if (!invitationId.success) return;

  const supabase = await createClient();
  await revokeInvitation(supabase, invitationId.data);
  revalidatePath("/household/members");
}

export async function acceptInvitationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = formData.get("token");
  if (typeof token !== "string" || token.length < 20) {
    return { error: "This invitation link is not valid." };
  }

  const supabase = await createClient();
  try {
    await acceptInvitation(supabase, token);
  } catch {
    // Every unusable token gives the same answer, so this never becomes a way
    // to discover which invitations exist.
    return { error: "This invitation is no longer valid. Ask for a new one." };
  }

  redirect("/");
}

const roleChangeSchema = z.object({
  householdId: z.uuid(),
  memberId: z.uuid(),
  role: z.enum(["administrator", "adult", "child", "helper"]),
  granted: z.enum(["true", "false"]).transform((value) => value === "true"),
});

/**
 * Grants or revokes a role. Head is not assignable here — transferring
 * ownership is its own operation, not a role grant.
 */
export async function setMemberRoleAction(formData: FormData): Promise<void> {
  const parsed = roleChangeSchema.safeParse({
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
    role: formData.get("role"),
    granted: formData.get("granted"),
  });
  if (!parsed.success) return;

  const supabase = await createClient();
  const { requireMembership, setMemberRole } = await import(
    "@wonderhome/core/identity/households"
  );

  try {
    const actor = await requireMembership(supabase, parsed.data.householdId);
    await setMemberRole(supabase, actor, {
      memberId: parsed.data.memberId,
      role: parsed.data.role,
      granted: parsed.data.granted,
    });
  } catch (error) {
    log.warn("role change refused", { reason: error instanceof Error ? error.name : "unknown" });
  }

  revalidatePath("/household/members");
}

const addChildSchema = z.object({
  householdId: z.uuid(),
  displayName: z.string().trim().min(1, { error: "Give them a name." }).max(80),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use a date like 2016-09-18." })
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

/**
 * Adds a child to the household. A child has no account of their own, so there
 * is no invitation to send and nothing for them to accept.
 */
export async function addChildAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = addChildSchema.safeParse({
    householdId: formData.get("householdId"),
    displayName: formData.get("displayName"),
    dateOfBirth: formData.get("dateOfBirth") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  const supabase = await createClient();
  const { createChildMember } = await import("@wonderhome/core/identity/children");
  const { requireHouseholdAdmin } = await import("@wonderhome/core/identity/households");

  try {
    const actor = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await createChildMember(supabase, {
      householdId: parsed.data.householdId,
      displayName: parsed.data.displayName,
      dateOfBirth: parsed.data.dateOfBirth ?? null,
      // The adult adding the child is their guardian by default; others can be
      // added afterwards.
      guardianMemberIds: [actor.memberId],
    });
  } catch (error) {
    log.warn("adding a child failed", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return { error: "We could not add that child. Please try again." };
  }

  revalidatePath("/household/members");
  return {};
}

const addHelperSchema = z.object({
  householdId: z.uuid(),
  displayName: z.string().trim().min(1, { error: "Give them a name." }).max(80),
  gender: z.string().trim().max(GENDER_MAX_LENGTH, { error: "Keep gender under 40 characters." }),
  notes: z.string().trim().max(MEMBER_NOTES_MAX_LENGTH, { error: "Keep notes under 500 characters." }),
});

/**
 * Adds a helper the household manages directly rather than inviting by
 * email — the accountless case `createHelperMember` exists for, same as a
 * child.
 */
export async function addHelperAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = addHelperSchema.safeParse({
    householdId: formData.get("householdId"),
    displayName: formData.get("displayName"),
    gender: formData.get("gender") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  const supabase = await createClient();
  const { createHelperMember, requireHouseholdAdmin } = await import(
    "@wonderhome/core/identity/households"
  );

  try {
    const actor = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await createHelperMember(supabase, actor, {
      displayName: parsed.data.displayName,
      gender: textOrNull(parsed.data.gender),
      notes: textOrNull(parsed.data.notes),
    });
  } catch (error) {
    log.warn("adding a helper failed", { reason: error instanceof Error ? error.name : "unknown" });
    return { error: "We could not add that helper. Please try again." };
  }

  revalidatePath("/household/members");
  return {};
}

const removeMemberSchema = z.object({
  householdId: z.uuid(),
  memberId: z.uuid(),
});

/** Removes someone from the household. The household's owner cannot be removed this way. */
export async function removeMemberAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = removeMemberSchema.safeParse({
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
  });
  if (!parsed.success) return { error: "Please try again." };

  const supabase = await createClient();
  const { deactivateMember, requireMembership } = await import(
    "@wonderhome/core/identity/households"
  );

  try {
    const actor = await requireMembership(supabase, parsed.data.householdId);
    await deactivateMember(supabase, actor, { memberId: parsed.data.memberId });
  } catch (error) {
    const { toErrorBody } = await import("@wonderhome/core/api/errors");
    return { error: toErrorBody(error, "household").body.error.message };
  }

  revalidatePath("/household/members");
  return {};
}

const updateMemberProfileSchema = z.object({
  householdId: z.uuid(),
  memberId: z.uuid(),
  displayName: z.string().trim().min(1, { error: "Give them a name." }).max(80),
  dateOfBirth: z.string().trim().max(10),
  nickname: z.string().trim().max(60),
  relationship: z.string().trim().max(60),
  occupation: z.string().trim().max(100),
  schoolOrWorkLocation: z.string().trim().max(120),
  specialOccasionLabel: z.string().trim().max(80),
  specialOccasionDate: z.string().trim().max(10),
  gender: z.string().trim().max(GENDER_MAX_LENGTH, { error: "Keep gender under 40 characters." }),
  notes: z.string().trim().max(MEMBER_NOTES_MAX_LENGTH, { error: "Keep notes under 500 characters." }),
});

const DATE_LIKE = /^\d{4}-\d{2}-\d{2}$/;

/** Blank means "clear it" here, not "leave unchanged" — the form always shows the current value. */
function textOrNull(value: string): string | null {
  return value.length > 0 ? value : null;
}

/**
 * The other half of adding a person: everything `createChildMember`,
 * `createHelperMember` and invitation acceptance can set at creation, plus
 * the details nobody has anywhere to set at all yet (nickname, relationship,
 * occupation, where they spend the day, a date worth remembering besides a
 * birthday) — editable afterwards, the way CLAUDE.md's "every entity can be
 * added, updated and removed" already expects of everything else.
 */
export async function updateMemberProfileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = updateMemberProfileSchema.safeParse({
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
    displayName: formData.get("displayName"),
    dateOfBirth: formData.get("dateOfBirth") ?? "",
    nickname: formData.get("nickname") ?? "",
    relationship: formData.get("relationship") ?? "",
    occupation: formData.get("occupation") ?? "",
    schoolOrWorkLocation: formData.get("schoolOrWorkLocation") ?? "",
    specialOccasionLabel: formData.get("specialOccasionLabel") ?? "",
    specialOccasionDate: formData.get("specialOccasionDate") ?? "",
    gender: formData.get("gender") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  if (parsed.data.dateOfBirth.length > 0 && !DATE_LIKE.test(parsed.data.dateOfBirth)) {
    return { error: "Use a date like 2016-09-18 for their date of birth." };
  }
  if (parsed.data.specialOccasionDate.length > 0 && !DATE_LIKE.test(parsed.data.specialOccasionDate)) {
    return { error: "Use a date like 2016-09-18 for the special occasion." };
  }

  const supabase = await createClient();
  const { updateMemberProfile } = await import("@wonderhome/core/identity/households");

  try {
    const actor = await requireMembership(supabase, parsed.data.householdId);
    await updateMemberProfile(supabase, actor, {
      memberId: parsed.data.memberId,
      displayName: parsed.data.displayName,
      dateOfBirth: textOrNull(parsed.data.dateOfBirth),
      nickname: textOrNull(parsed.data.nickname),
      relationship: textOrNull(parsed.data.relationship),
      occupation: textOrNull(parsed.data.occupation),
      schoolOrWorkLocation: textOrNull(parsed.data.schoolOrWorkLocation),
      specialOccasionLabel: textOrNull(parsed.data.specialOccasionLabel),
      specialOccasionDate: textOrNull(parsed.data.specialOccasionDate),
      gender: textOrNull(parsed.data.gender),
      notes: textOrNull(parsed.data.notes),
    });
  } catch (error) {
    const { toErrorBody } = await import("@wonderhome/core/api/errors");
    return { error: toErrorBody(error, "household").body.error.message };
  }

  revalidatePath("/household/members");
  revalidatePath("/family");
  revalidatePath("/househelper");
  return {};
}

const avatarIdsSchema = z.object({
  householdId: z.uuid(),
  memberId: z.uuid(),
});

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const AVATAR_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** One object per member, overwritten on every re-upload — never a growing history of old photos. */
function avatarStoragePath(householdId: string, memberId: string): string {
  return `${householdId}/${memberId}`;
}

/**
 * The photo half of a member's details (rule 1: "for each person, give
 * option to edit their details, including their profile pictures") — an
 * Admin may do this for anyone, and a member may do it for themselves.
 *
 * Uploads to the private `avatars` bucket (never public — these can be
 * photos of children) at a path keyed by household and member id, which is
 * also the RLS boundary the storage policies check directly (both the
 * Admin-scoped and the self-scoped ones — 20260922040000). Only the
 * storage path is written to `household_members.avatar_path`; the signed,
 * display-ready URL is minted at read time by `listMembers`, never stored.
 */
export async function updateMemberAvatarAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = avatarIdsSchema.safeParse({
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
  });
  if (!parsed.success) return { error: "Please try again." };

  const photo = formData.get("photo");
  if (!(photo instanceof File) || photo.size === 0) return { error: "Choose a photo first." };
  if (!AVATAR_CONTENT_TYPES.has(photo.type)) return { error: "Photos must be a JPEG, PNG or WebP image." };
  if (photo.size > AVATAR_MAX_BYTES) return { error: "That photo is too large — please use one under 5MB." };

  const supabase = await createClient();
  const { updateMemberProfile } = await import("@wonderhome/core/identity/households");

  try {
    const actor = await requireMembership(supabase, parsed.data.householdId);
    const path = avatarStoragePath(parsed.data.householdId, parsed.data.memberId);

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, photo, { upsert: true, contentType: photo.type });
    if (uploadError) throw new Error(`avatar upload failed: ${uploadError.message}`);

    await updateMemberProfile(supabase, actor, { memberId: parsed.data.memberId, avatarPath: path });
  } catch (error) {
    const { toErrorBody } = await import("@wonderhome/core/api/errors");
    return { error: toErrorBody(error, "household").body.error.message };
  }

  revalidatePath("/household/members");
  revalidatePath("/family");
  revalidatePath("/househelper");
  return { notice: "Photo updated." };
}

/** The other half of adding a photo (CLAUDE.md rule 12): undoing it. */
export async function removeMemberAvatarAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = avatarIdsSchema.safeParse({
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId"),
  });
  if (!parsed.success) return { error: "Please try again." };

  const supabase = await createClient();
  const { updateMemberProfile } = await import("@wonderhome/core/identity/households");

  try {
    const actor = await requireMembership(supabase, parsed.data.householdId);
    const path = avatarStoragePath(parsed.data.householdId, parsed.data.memberId);
    await supabase.storage.from("avatars").remove([path]);
    await updateMemberProfile(supabase, actor, { memberId: parsed.data.memberId, avatarPath: null });
  } catch (error) {
    const { toErrorBody } = await import("@wonderhome/core/api/errors");
    return { error: toErrorBody(error, "household").body.error.message };
  }

  revalidatePath("/household/members");
  revalidatePath("/family");
  revalidatePath("/househelper");
  return { notice: "Photo removed." };
}
