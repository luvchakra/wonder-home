import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import { dispatchWebhookEvent } from "../webhooks/dispatch";
import type { HouseholdRole, MemberType } from "./schemas";

/**
 * Household invitations (story 01-002).
 *
 * An invitation is a capability: whoever holds the token can join the
 * household. It is therefore treated as a credential — generated with a CSPRNG,
 * returned to the inviter exactly once, and stored only as a SHA-256 digest, so
 * a database backup does not hand anyone a working invitation.
 */

/** 32 bytes of entropy, base64url — long enough that guessing is not a threat. */
export function generateInvitationToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function hashInvitationToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** Invitations are short-lived; an unused link should stop working on its own. */
export const INVITATION_TTL_DAYS = 7;

export type CreateInvitationInput = {
  householdId: string;
  email: string;
  displayName: string;
  memberType: MemberType & ("adult" | "helper");
  role: Extract<HouseholdRole, "administrator" | "adult" | "helper">;
  /**
   * The member this invitation is for, when they were already added without a
   * login (story 02-009). Accepting links the new account to that member. The
   * database only honours it for an unlinked, active member of this same
   * household; anything else joins as a new member, as before.
   */
  memberId?: string | null;
};

export type CreatedInvitation = {
  id: string;
  expiresAt: string;
  /** Plaintext, returned once. Never stored and never logged. */
  token: string;
};

/**
 * Creates an invitation, superseding any live one for the same address.
 *
 * Re-inviting revokes the previous invitation first, so the earlier link stops
 * working the moment a new one is issued — two valid tokens for one seat is a
 * revocation hole, not a convenience.
 */
export async function createInvitation(
  supabase: SupabaseClient,
  invitedByMemberId: string,
  input: CreateInvitationInput,
): Promise<CreatedInvitation> {
  const token = generateInvitationToken();
  const tokenHash = await hashInvitationToken(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000).toISOString();

  await revokeLiveInvitationsFor(supabase, input.householdId, input.email);

  const { data, error } = await supabase
    .from("household_invitations")
    .insert({
      household_id: input.householdId,
      invited_by_member_id: invitedByMemberId,
      email: input.email.trim().toLowerCase(),
      display_name: input.displayName,
      member_type: input.memberType,
      role: input.role,
      member_id: input.memberId ?? null,
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select("id, expires_at")
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can invite members.");
    throw new Error(`createInvitation failed: ${error.code ?? "unknown"}`);
  }

  // An outstanding invitation is a way into the household, so it is recorded
  // like one (story 15-006). The role and member type are the whole of it:
  // the email is the invitee's, not the household's to keep in a trail its
  // administrators read, and the token is a credential.
  await auditChange({
    householdId: input.householdId,
    actorMemberId: invitedByMemberId,
    eventType: "invitation.created",
    targetTable: "household_invitations",
    targetId: data.id as string,
    metadata: { role: input.role, memberType: input.memberType },
  });

  return { id: data.id as string, expiresAt: data.expires_at as string, token };
}

async function revokeLiveInvitationsFor(
  supabase: SupabaseClient,
  householdId: string,
  email: string,
): Promise<void> {
  const { error } = await supabase
    .from("household_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("household_id", householdId)
    .eq("email", email.trim().toLowerCase())
    .is("revoked_at", null)
    .is("accepted_at", null);

  if (error) throw new Error(`revoking previous invitations failed: ${error.code ?? "unknown"}`);
}

export async function revokeInvitation(
  supabase: SupabaseClient,
  invitationId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("household_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId)
    .is("accepted_at", null)
    .select("household_id")
    .maybeSingle();

  if (error) throw new Error(`revokeInvitation failed: ${error.code ?? "unknown"}`);

  // Nothing was revoked when the row was already accepted or is not this
  // caller's to see, and there is nothing to record either way.
  const householdId = (data as { household_id?: string } | null)?.household_id;
  if (!householdId) return;

  // Closing a way into the household is as worth recording as opening one —
  // and the revoker is whoever is signed in, resolved here rather than passed
  // in, so no caller can file the entry under somebody else.
  const { listMemberships } = await import("./households");
  const actor = (await listMemberships(supabase)).find((entry) => entry.household.id === householdId);

  await auditChange({
    householdId,
    actorMemberId: actor?.memberId ?? null,
    eventType: "invitation.revoked",
    targetTable: "household_invitations",
    targetId: invitationId,
  });
}

/**
 * Accepts an invitation on behalf of the signed-in person.
 *
 * Every unusable token — unknown, revoked, expired, already used — produces the
 * same refusal, so the endpoint cannot be used to discover which invitations
 * exist.
 */
export async function acceptInvitation(
  supabase: SupabaseClient,
  token: string,
  displayName?: string,
): Promise<{ householdId: string; memberId: string }> {
  const tokenHash = await hashInvitationToken(token);

  const { data, error } = await supabase
    .rpc("accept_invitation", { p_token_hash: tokenHash, p_display_name: displayName ?? null })
    .select()
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.unauthenticated();
    throw new ApiError("unprocessable", "This invitation is no longer valid.");
  }

  const row = data as { household_id: string; member_id: string };

  // The SQL function records `invitation.accepted`; this is the other half of
  // the same moment, and the one an administrator actually looks for: one more
  // person can now see the household (story 15-006).
  await auditChange({
    householdId: row.household_id,
    actorMemberId: row.member_id,
    eventType: "member.added",
    targetTable: "household_members",
    targetId: row.member_id,
    metadata: { via: "invitation" },
  });

  await dispatchWebhookEvent({
    householdId: row.household_id,
    eventType: "member.added",
    data: { memberId: row.member_id, via: "invitation" },
  });

  return { householdId: row.household_id, memberId: row.member_id };
}

export type PendingInvitation = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  expiresAt: string;
  status: "pending" | "expired";
};

/** Pending invitations for a household. Token digests are never selected. */
export async function listInvitations(
  supabase: SupabaseClient,
  householdId: string,
): Promise<PendingInvitation[]> {
  const { data, error } = await supabase
    .from("household_invitations")
    .select("id, email, display_name, role, expires_at")
    .eq("household_id", householdId)
    .is("revoked_at", null)
    .is("accepted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listInvitations failed: ${error.code ?? "unknown"}`);

  const now = Date.now();
  return (data ?? []).map((row) => ({
    id: row.id as string,
    email: row.email as string,
    displayName: row.display_name as string,
    role: row.role as string,
    expiresAt: row.expires_at as string,
    status: new Date(row.expires_at as string).getTime() <= now ? "expired" : "pending",
  }));
}
