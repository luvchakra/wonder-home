import type { SupabaseClient } from "@supabase/supabase-js";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import { isHouseholdAdmin } from "./households";
import { claimMembersByEmail } from "./member-email";
import type { HouseholdMembership } from "./schemas";

/**
 * A phone number for every member (story 01-011), and the member a verified
 * phone sign-in becomes.
 *
 * A househelper may have no email at all; she signs in with a one-time code
 * sent to her phone. An Admin records the number in the member's details, and
 * a sign-in whose verified phone matches becomes that member, with the role
 * the household gave them (`wh.claim_members_by_phone`) — the same rule as
 * for email, and nothing here grants anything.
 *
 * Numbers are kept in E.164 ("+919876543210") so a match never depends on
 * spaces, dashes or a leading 0.
 */

/** The country code a number written without one is taken to be in. WonderHome is India-first. */
export const DEFAULT_CALLING_CODE = "91";

const E164 = /^\+[1-9][0-9]{7,14}$/;

/**
 * A typed number in E.164, or null when it cannot be one. "98765 43210",
 * "098765-43210", "+91 98765 43210" and "0091 9876543210" all become
 * "+919876543210". A number with no country code is taken as Indian only when
 * it has an Indian mobile's ten digits; anything else needs its "+" code.
 */
export function normalPhone(raw: string, callingCode: string = DEFAULT_CALLING_CODE): string | null {
  const text = raw.trim();
  if (!text) return null;
  if (/[^0-9+\s().-]/.test(text)) return null;
  const digits = text.replace(/[^0-9]/g, "");
  let e164: string;
  if (/^[\s(]*\+/.test(text)) e164 = `+${digits}`;
  else if (digits.startsWith("00")) e164 = `+${digits.slice(2)}`;
  else if (callingCode === "91" && /^0?[6-9][0-9]{9}$/.test(digits)) e164 = `+91${digits.replace(/^0/, "")}`;
  else return null;
  return E164.test(e164) ? e164 : null;
}

export function isPhone(raw: string): boolean {
  return normalPhone(raw) !== null;
}

/** "+919876543210" as "+91 98765 43210"; any other country as written. */
export function formatPhone(e164: string): string {
  const india = /^\+91([0-9]{5})([0-9]{5})$/.exec(e164);
  return india ? `+91 ${india[1]} ${india[2]}` : e164;
}

/** The numbers this person may read: Admins and adults see every member's, others only their own (RLS decides). */
export async function readMemberPhones(supabase: SupabaseClient, householdId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("household_member_phones").select("member_id, phone").eq("household_id", householdId);
  if (error) throw new Error(`readMemberPhones failed: ${error.code ?? "unknown"}`);
  return new Map(((data ?? []) as { member_id: string; phone: string }[]).map((row) => [row.member_id, row.phone]));
}

export type SetPhoneResult = "saved" | "removed" | "unchanged" | "taken";

/**
 * Records, changes or clears a member's phone number. Admins only — the
 * database refuses anyone else as well. A number another member of the same
 * household already has is refused: one number is one person.
 */
export async function setMemberPhone(
  supabase: SupabaseClient,
  actor: HouseholdMembership,
  input: { memberId: string; phone: string | null },
): Promise<SetPhoneResult> {
  if (!isHouseholdAdmin(actor)) throw ApiError.forbidden("Only an Admin can set a member's phone number.");
  const householdId = actor.household.id;
  const typed = input.phone?.trim() ?? "";
  const phone = typed ? normalPhone(typed) : null;
  if (typed && !phone) throw ApiError.badRequest("Enter a phone number, with its country code if it isn't Indian (+44…).");

  const current = (await readMemberPhones(supabase, householdId)).get(input.memberId) ?? null;
  if (current === phone) return "unchanged";

  if (!phone) {
    const { error } = await supabase.from("household_member_phones").delete().eq("member_id", input.memberId).eq("household_id", householdId);
    if (error) throw new Error(`clearing a member phone failed: ${error.code ?? "unknown"}`);
    await auditChange({ householdId, actorMemberId: actor.memberId, eventType: "member.phone_cleared", targetTable: "household_member_phones", targetId: input.memberId });
    return "removed";
  }

  const { error } = await supabase
    .from("household_member_phones")
    .upsert({ member_id: input.memberId, household_id: householdId, phone, set_by_member_id: actor.memberId }, { onConflict: "member_id" });
  if (error) {
    if (error.code === "23505") return "taken";
    if (error.code === "42501") throw ApiError.forbidden("Only an Admin can set a member's phone number.");
    throw new Error(`setting a member phone failed: ${error.code ?? "unknown"}`);
  }
  // The number is the member's, not the trail's: only that it was set is recorded.
  await auditChange({ householdId, actorMemberId: actor.memberId, eventType: "member.phone_set", targetTable: "household_member_phones", targetId: input.memberId });
  return "saved";
}

/** Links the signed-in account to every member recorded with its verified phone. Never throws. */
export async function claimMembersByPhone(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("claim_members_by_phone");
  if (error) return 0;
  return Array.isArray(data) ? data.length : 0;
}

/**
 * After any sign-in: the account becomes every member the household recorded
 * with its verified email or its verified phone. Returns how many it linked.
 */
export async function claimMembers(supabase: SupabaseClient): Promise<number> {
  const [byEmail, byPhone] = await Promise.all([claimMembersByEmail(supabase), claimMembersByPhone(supabase)]);
  return byEmail + byPhone;
}
