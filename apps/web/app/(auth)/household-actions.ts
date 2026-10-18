"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@wonderhome/core/db/server";
import { listMembers, requireHouseholdAdmin, requireMembership } from "@wonderhome/core/identity/households";
import {
  acceptInvitation,
  createInvitation,
  revokeInvitation,
} from "@wonderhome/core/identity/invitations";
import { GENDER_MAX_LENGTH, MEMBER_NOTES_MAX_LENGTH } from "@wonderhome/core/identity/member-details";
import { log } from "@wonderhome/core/observability/logger";

import { helperRolesFrom } from "../_lib/helper-roles";
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

    // An adult already named during setup, without a login yet: the
    // invitation is for them, and accepting it makes the account theirs
    // rather than adding the same person twice (story 02-009).
    const claimable =
      parsed.data.role === "helper"
        ? undefined
        : (await listMembers(supabase, parsed.data.householdId, null)).find(
            (member) =>
              member.memberType === "adult" &&
              member.status === "active" &&
              member.hasAccount === false &&
              member.displayName.trim().toLocaleLowerCase() === parsed.data.displayName.trim().toLocaleLowerCase(),
          );

    const invitation = await createInvitation(supabase, membership.memberId, {
      memberId: claimable?.id ?? null,
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

export type MemberInviteResult = { path: string } | { error: "failed" | "linked" };

/** A new single-use sign-in link for a member on record, and what an email needs to carry it. */
type CreatedInvite = {
  path: string;
  email: string | null;
  member: Awaited<ReturnType<typeof listMembers>>[number];
  membership: Awaited<ReturnType<typeof requireHouseholdAdmin>>;
};

async function createMemberInvite(householdId: string, memberId: string): Promise<CreatedInvite | { error: "failed" | "linked" }> {
  const ids = z.object({ householdId: z.uuid(), memberId: z.uuid() }).safeParse({ householdId, memberId });
  if (!ids.success) return { error: "failed" };

  const supabase = await createClient();
  const membership = await requireHouseholdAdmin(supabase, householdId);
  const member = (await listMembers(supabase, householdId, null)).find((entry) => entry.id === memberId);
  if (!member || member.status === "inactive") return { error: "failed" };
  if (member.hasAccount) return { error: "linked" };

  const { readMemberEmails } = await import("@wonderhome/core/identity/member-email");
  const email = (await readMemberEmails(supabase, householdId)).get(memberId) ?? null;
  const role = member.roles.includes("administrator") ? "administrator" : member.memberType;

  const invitation = await createInvitation(supabase, membership.memberId, {
    householdId,
    memberId,
    email,
    displayName: member.displayName,
    memberType: member.memberType,
    role,
  });
  revalidatePath("/household/members");
  return { path: `/invite/${invitation.token}`, email, member, membership };
}

/**
 * The Invite button on a family member (Family): a single-use link for a
 * member already on record, to pass on by email, a share sheet or a copy.
 *
 * Opening it and signing in — any way — links the account to that member,
 * with the role they already have (a child stays a child). Creating a new link
 * stops the earlier one. Admins only, as every invitation is.
 */
export async function inviteMemberToSignInAction(householdId: string, memberId: string): Promise<MemberInviteResult> {
  try {
    const created = await createMemberInvite(householdId, memberId);
    if ("error" in created) return { error: created.error };
    return { path: created.path };
  } catch (error) {
    log.warn("member invitation failed", { reason: error instanceof Error ? error.name : "unknown" });
    return { error: "failed" };
  }
}

export type MemberInviteEmailResult = { path: string; sent: boolean } | { error: "failed" | "linked" | "no_email" | "no_mail" };

/**
 * The same link, sent by WonderHome itself to the email in the member's
 * details (connect@wonderapps.biz, through the deployment's SMTP settings).
 *
 * The address is the one on record, read here on the server — never one the
 * browser names — so an Admin can only mail the person the link is for. The
 * link is made whether or not the email goes, so a failed send still leaves
 * one to share another way; `sent` says which happened, and never claims
 * delivery, only that the mail server accepted it.
 */
export async function emailMemberInviteAction(householdId: string, memberId: string): Promise<MemberInviteEmailResult> {
  const { platformMailer, singleRecipient } = await import("@wonderhome/core/email/mailer");
  const mailer = platformMailer();
  if (!mailer) return { error: "no_mail" };
  try {
    const created = await createMemberInvite(householdId, memberId);
    if ("error" in created) return { error: created.error };
    const to = created.email ? singleRecipient(created.email) : null;
    if (!to) return { error: "no_email" };

    const [{ inviteEmail }, { preferencesOf }, { translatorFor }, { headers }] = await Promise.all([
      import("@wonderhome/core/identity/invite-email"),
      import("@wonderhome/core/i18n/preferences"),
      import("@wonderhome/core/i18n/translate"),
      import("next/headers"),
    ]);
    const incoming = await headers();
    const host = incoming.get("host") ?? "localhost:3000";
    const origin = incoming.get("origin") ?? `${host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https"}://${host}`;
    const t = await translatorFor(preferencesOf(created.membership.locale, created.membership.household.timezone).language);
    const household = created.membership.household.name;
    const mail = inviteEmail({
      to,
      link: `${origin}${created.path}`,
      subject: t("memberInvite.subject", { household }),
      greeting: t("memberInvite.emailGreeting", { name: created.member.displayName }),
      message: t("memberInvite.message", { inviter: created.membership.displayName, household }),
      action: t("memberInvite.emailAction", { household }),
      expiry: t("memberInvite.emailExpiry"),
      footer: t("memberInvite.emailFooter"),
    });
    const outcome = await mailer.send(mail);
    if (!outcome.ok) log.warn("member invitation email failed", { reason: outcome.reason });
    return { path: created.path, sent: outcome.ok };
  } catch (error) {
    log.warn("member invitation email failed", { reason: error instanceof Error ? error.name : "unknown" });
    return { error: "failed" };
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
  revalidatePath("/family");
}

const addChildSchema = z.object({
  householdId: z.uuid(),
  displayName: z.string().trim().min(1, { error: "Give them a name." }).max(80),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use a date like 2016-09-18." })
    .optional()
    .or(z.literal("").transform(() => undefined)),
  gender: z.string().trim().max(GENDER_MAX_LENGTH, { error: "Keep gender under 40 characters." }),
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
    gender: formData.get("gender") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  const supabase = await createClient();
  const { createChildMember } = await import("@wonderhome/core/identity/children");
  const { requireHouseholdAdmin, updateMemberProfile } = await import("@wonderhome/core/identity/households");

  let added: { memberId: string };
  let actor: Awaited<ReturnType<typeof requireHouseholdAdmin>>;
  try {
    actor = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    added = await createChildMember(supabase, {
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

  // Gender goes on through the same profile update the editor uses, so the
  // child-creation function itself stays unchanged. The child already exists
  // by now: if this one optional detail fails to save, say so plainly rather
  // than claiming the whole addition failed.
  const gender = textOrNull(parsed.data.gender);
  if (gender) {
    try {
      await updateMemberProfile(supabase, actor, { memberId: added.memberId, gender });
    } catch (error) {
      log.warn("recording a new child's gender failed", { reason: error instanceof Error ? error.name : "unknown" });
      revalidatePath("/household/members");
      return { notice: "Added. Their gender didn't save — add it from their details." };
    }
  }

  revalidatePath("/household/members");
  return {};
}

const addHelperSchema = z.object({
  householdId: z.uuid(),
  displayName: z.string().trim().min(1, { error: "Give them a name." }).max(80),
  gender: z.string().trim().max(GENDER_MAX_LENGTH, { error: "Keep gender under 40 characters." }),
  notes: z.string().trim().max(MEMBER_NOTES_MAX_LENGTH, { error: "Keep notes under 500 characters." }),
  phone: z.string().trim().max(30),
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
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }
  const { normalPhone, setMemberPhone } = await import("@wonderhome/core/identity/member-phone");
  // A helper may have no email; her phone is how she signs in (story 01-011).
  if (parsed.data.phone && !normalPhone(parsed.data.phone)) {
    return { error: "Enter a phone number, with its country code if it isn't Indian (+44…)." };
  }

  const supabase = await createClient();
  const { createHelperMember, requireHouseholdAdmin } = await import(
    "@wonderhome/core/identity/households"
  );

  try {
    const actor = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    const { memberId } = await createHelperMember(supabase, actor, {
      displayName: parsed.data.displayName,
      gender: textOrNull(parsed.data.gender),
      notes: textOrNull(parsed.data.notes),
    });
    if (parsed.data.phone) {
      const saved = await setMemberPhone(supabase, actor, { memberId, phone: parsed.data.phone });
      if (saved === "taken") {
        revalidatePath("/household/members");
        return { error: "The helper was added, but another member already has that phone number, so it wasn't saved." };
      }
    }
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
  // Absent when the form showed a picked school or office instead: left as it is then.
  schoolOrWorkLocation: z.string().trim().max(120).optional(),
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
const OFFICE_TYPED = "Pick the office from the search, so HomeTalk knows where it is. Clear the field to leave it out.";

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
    // A househelper's occupation is everything ticked (rule 20), kept as "Maid, Cook".
    occupation: formData.get("helperRolesField") === "1" ? (helperRolesFrom(formData, "helperRoles") ?? "") : (formData.get("occupation") ?? ""),
    schoolOrWorkLocation: formData.has("schoolOrWorkLocation") ? String(formData.get("schoolOrWorkLocation")) : undefined,
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

  // An adult's work and office hours, and a child's school day: only when
  // the form carried them, so an older form never clears what it never showed.
  const { readHoursInput, HOURS_PROBLEM } = await import("@wonderhome/core/household/day-hours");
  const { WORK_ARRANGEMENTS, updateMemberProfile } = await import("@wonderhome/core/identity/households");
  let work: { workArrangement: (typeof WORK_ARRANGEMENTS)[number] | null; workHours: { starts: string; ends: string } | null } | null = null;
  if (formData.get("workField") === "1") {
    const said = String(formData.get("workArrangement") ?? "");
    const hours = readHoursInput(formData.get("workStarts"), formData.get("workEnds"), { overnight: true });
    if (!hours.ok) return { error: HOURS_PROBLEM[hours.problem] };
    work = {
      workArrangement: (WORK_ARRANGEMENTS as readonly string[]).includes(said) ? (said as (typeof WORK_ARRANGEMENTS)[number]) : null,
      workHours: hours.hours,
    };
  }
  let schoolHours: { hours: { starts: string; ends: string } | null } | null = null;
  if (formData.get("schoolHoursField") === "1") {
    const hours = readHoursInput(formData.get("schoolStarts"), formData.get("schoolEnds"), { overnight: false });
    if (!hours.ok) return { error: HOURS_PROBLEM[hours.problem] };
    schoolHours = { hours: hours.hours };
  }

  // An office typed but never picked has no point to search near: refused
  // before anything is written, so the rest of the form is not half-saved.
  if (formData.get("officeField") === "1" && !String(formData.get("office_place_id") ?? "").trim() && String(formData.get("office_name") ?? "").trim()) {
    return { error: OFFICE_TYPED };
  }

  const supabase = await createClient();

  try {
    const actor = await requireMembership(supabase, parsed.data.householdId);
    // The sign-in email, when the form carried it (an Admin editing someone
    // else): saved first, so an address another member already has is said
    // before anything else changes.
    if (formData.get("emailField") === "1") {
      const { setMemberEmail } = await import("@wonderhome/core/identity/member-email");
      const said = String(formData.get("email") ?? "").trim();
      const saved = await setMemberEmail(supabase, actor, { memberId: parsed.data.memberId, email: said || null });
      if (saved === "taken") return { error: "Another member of this household already signs in with that email." };
    }
    // The phone number (story 01-011), the same way: an Admin's, and one
    // number is one person.
    if (formData.get("phoneField") === "1") {
      const { setMemberPhone } = await import("@wonderhome/core/identity/member-phone");
      const said = String(formData.get("phone") ?? "").trim();
      const saved = await setMemberPhone(supabase, actor, { memberId: parsed.data.memberId, phone: said || null });
      if (saved === "taken") return { error: "Another member of this household already has that phone number." };
    }
    await updateMemberProfile(supabase, actor, {
      memberId: parsed.data.memberId,
      displayName: parsed.data.displayName,
      dateOfBirth: textOrNull(parsed.data.dateOfBirth),
      nickname: textOrNull(parsed.data.nickname),
      nicknamePreferred: Boolean(textOrNull(parsed.data.nickname)) && formData.get("nicknamePreferred") === "on",
      relationship: textOrNull(parsed.data.relationship),
      occupation: textOrNull(parsed.data.occupation),
      schoolOrWorkLocation: parsed.data.schoolOrWorkLocation === undefined ? undefined : textOrNull(parsed.data.schoolOrWorkLocation),
      specialOccasionLabel: textOrNull(parsed.data.specialOccasionLabel),
      specialOccasionDate: textOrNull(parsed.data.specialOccasionDate),
      gender: textOrNull(parsed.data.gender),
      notes: textOrNull(parsed.data.notes),
      ...(work ?? {}),
    });
    // A child's school, picked from Google Maps (story 24-010): the same save as Kids & School, before its hours so they land on it.
    const { saveSchoolFromForm } = await import("../_lib/places");
    const school = await saveSchoolFromForm(supabase, actor, parsed.data.memberId, formData);
    if (schoolHours && school !== "removed") {
      const { setSchoolHours } = await import("@wonderhome/core/school/enrolments");
      await setSchoolHours(supabase, { householdId: parsed.data.householdId, childMemberId: parsed.data.memberId, hours: schoolHours.hours });
    }
    // An adult's office, picked from the search (story 24-005).
    const { saveWorkPlaceFromForm } = await import("../_lib/places");
    const office = await saveWorkPlaceFromForm(supabase, actor, parsed.data.memberId, formData);
    if (office === "typed") return { error: OFFICE_TYPED };
  } catch (error) {
    const { PlacesUnavailableError } = await import("@wonderhome/core/places/provider");
    if (error instanceof PlacesUnavailableError) return { error: "That place could not be read just now. Try picking it again in a minute." };
    const { toErrorBody } = await import("@wonderhome/core/api/errors");
    return { error: toErrorBody(error, "household").body.error.message };
  }

  revalidatePath("/household/members");
  revalidatePath("/family");
  revalidatePath("/househelper");
  revalidatePath("/places");
  revalidatePath("/school");
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
