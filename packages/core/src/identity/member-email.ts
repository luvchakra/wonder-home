import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import { isHouseholdAdmin } from "./households";
import type { HouseholdMembership } from "./schemas";

/**
 * Every family member signs in as themselves, matched by the email the
 * household recorded for them (member sign-in by email).
 *
 * An Admin records the address in the member's details. A sign-in whose
 * verified email matches — by password, Google or any provider Supabase
 * verifies — becomes that member, with the role the household gave them
 * (`wh.claim_members_by_email`). What they may then see and do is their role's
 * business, exactly as for everyone else; nothing here grants anything.
 */

/** Lower case and trimmed: how the table stores it, so a match never depends on capitals. */
export function normalEmail(value: string): string {
  return value.trim().toLowerCase();
}

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isEmail(value: string): boolean {
  const email = normalEmail(value);
  return email.length <= 254 && EMAIL.test(email);
}

/** The sign-in emails this person may read: every member's for an Admin, their own otherwise (RLS decides). */
export async function readMemberEmails(supabase: SupabaseClient, householdId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("household_member_emails").select("member_id, email").eq("household_id", householdId);
  if (error) throw new Error(`readMemberEmails failed: ${error.code ?? "unknown"}`);
  return new Map(((data ?? []) as { member_id: string; email: string }[]).map((row) => [row.member_id, row.email]));
}

export type SetEmailResult = "saved" | "removed" | "unchanged" | "taken";

/**
 * Records, changes or clears a member's sign-in email. Admins only — the
 * database refuses anyone else as well. An address another member of the same
 * household already has is refused, since one email can be only one person.
 */
export async function setMemberEmail(
  supabase: SupabaseClient,
  actor: HouseholdMembership,
  input: { memberId: string; email: string | null },
): Promise<SetEmailResult> {
  if (!isHouseholdAdmin(actor)) throw ApiError.forbidden("Only an Admin can set a member's sign-in email.");
  const householdId = actor.household.id;
  const email = input.email && input.email.trim() ? normalEmail(input.email) : null;
  if (email && !isEmail(email)) throw ApiError.badRequest("Enter a valid email address.");

  const current = (await readMemberEmails(supabase, householdId)).get(input.memberId) ?? null;
  if (current === email) return "unchanged";

  if (!email) {
    const { error } = await supabase.from("household_member_emails").delete().eq("member_id", input.memberId).eq("household_id", householdId);
    if (error) throw new Error(`clearing a member email failed: ${error.code ?? "unknown"}`);
    await auditChange({ householdId, actorMemberId: actor.memberId, eventType: "member.email_cleared", targetTable: "household_member_emails", targetId: input.memberId });
    return "removed";
  }

  const { error } = await supabase
    .from("household_member_emails")
    .upsert({ member_id: input.memberId, household_id: householdId, email, set_by_member_id: actor.memberId }, { onConflict: "member_id" });
  if (error) {
    if (error.code === "23505") return "taken";
    if (error.code === "42501") throw ApiError.forbidden("Only an Admin can set a member's sign-in email.");
    throw new Error(`setting a member email failed: ${error.code ?? "unknown"}`);
  }
  // The address is the member's, not the trail's: only that it was set is recorded.
  await auditChange({ householdId, actorMemberId: actor.memberId, eventType: "member.email_set", targetTable: "household_member_emails", targetId: input.memberId });
  return "saved";
}

/**
 * Links the signed-in account to every member recorded with its verified
 * email, and returns how many it linked. Never throws: signing in must not
 * fail because this could not run, and the next sign-in tries again.
 */
export async function claimMembersByEmail(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("claim_members_by_email");
  if (error) return 0;
  return Array.isArray(data) ? data.length : 0;
}
