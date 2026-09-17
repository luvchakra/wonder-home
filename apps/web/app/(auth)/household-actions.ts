"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@wonderhome/core/db/server";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";
import {
  acceptInvitation,
  createInvitation,
  revokeInvitation,
} from "@wonderhome/core/identity/invitations";
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
      return { error: "Only the Head of Family can invite an administrator." };
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
