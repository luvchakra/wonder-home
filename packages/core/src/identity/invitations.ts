import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
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
      token_hash: tokenHash,
      expires_at: expiresAt,
    })
    .select("id, expires_at")
    .single();

  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("Only a household administrator can invite members.");
    throw new Error(`createInvitation failed: ${error.code ?? "unknown"}`);
  }

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
  const { error } = await supabase
    .from("household_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitationId)
    .is("accepted_at", null);

  if (error) throw new Error(`revokeInvitation failed: ${error.code ?? "unknown"}`);
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
