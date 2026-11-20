import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { auditChange } from "../api/audit";
import { ApiError } from "../api/errors";
import { isHouseholdAdmin } from "./households";
import { formatPhone, normalPhone } from "./member-phone";
import type { HouseholdMembership } from "./schemas";

/**
 * A member's contact details: the email and phone the family reaches them on
 * (owner, 2026-11-20, "add email, phone as attributes in profile").
 *
 * Kept apart from the sign-in identity on purpose. The sign-in email
 * (`member-email.ts`) and the sign-in phone (`member-phone.ts`) decide who an
 * account becomes; these decide nothing. Nothing reads them to sign anyone
 * in, link or verify a WhatsApp number, trust a HomeSend sender, or tell who
 * sent a message, and they are never given to a model (knowledge registry:
 * excluded). They are for people: shown on the person's card with tap-to-call
 * and tap-to-mail, to those allowed to see them (RLS on
 * `household_member_contacts`).
 */

export type MemberContact = { email: string | null; phone: string | null; phoneAsTyped: string | null };

export const CONTACT_PROBLEM = {
  email: "Enter an email like name@example.com, or leave it blank.",
  phone: "Enter a phone number, with its country code if it isn't Indian (+44…), or leave it blank.",
} as const;

/** What the sheet sends, checked at the boundary: an email's shape, a number that can be one. Blank stays blank. */
export const memberContactInputSchema = z
  .object({
    email: z
      .string()
      .trim()
      .max(254, CONTACT_PROBLEM.email)
      .refine((value) => value === "" || z.email().safeParse(value).success, CONTACT_PROBLEM.email),
    phone: z
      .string()
      .trim()
      .max(40, CONTACT_PROBLEM.phone)
      .refine((value) => value === "" || normalPhone(value) !== null, CONTACT_PROBLEM.phone),
  })
  .transform(({ email, phone }): MemberContact => ({
    email: email ? email.toLowerCase() : null,
    phone: phone ? normalPhone(phone) : null,
    phoneAsTyped: phone || null,
  }));

/** The two fields as typed, or the first plain sentence saying what is wrong. */
export function parseMemberContact(input: { email: unknown; phone: unknown }): { ok: true; contact: MemberContact } | { ok: false; error: string } {
  const parsed = memberContactInputSchema.safeParse({ email: String(input.email ?? ""), phone: String(input.phone ?? "") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? CONTACT_PROBLEM.email };
  return { ok: true, contact: parsed.data };
}

/** The member themselves, or any Admin: the same rule as the rest of the details sheet. */
export function mayEditMemberContact(actor: HouseholdMembership, memberId: string): boolean {
  return isHouseholdAdmin(actor) || actor.memberId === memberId;
}

/** How a stored number reads back in the sheet: what they typed, else the tidy form. */
export function phoneForEditing(contact: MemberContact | null | undefined): string {
  if (!contact?.phone) return "";
  return contact.phoneAsTyped?.trim() || formatPhone(contact.phone);
}

/** A `tel:` and a `mailto:` for the card. Only ever built from the stored, checked values. */
export function contactLinks(contact: MemberContact | null | undefined): { mail: string | null; call: string | null } {
  return {
    mail: contact?.email ? `mailto:${encodeURIComponent(contact.email).replace(/%40/g, "@")}` : null,
    call: contact?.phone ? `tel:${contact.phone}` : null,
  };
}

const MISSING_TABLE = new Set(["42P01", "PGRST205"]);

type ContactRow = { member_id: string; email: string | null; phone: string | null; phone_as_typed: string | null };

/**
 * The contacts this person may read (RLS decides), by member. `null` when the
 * table is not there yet (the migration runs after the deploy): callers then
 * hide the two fields rather than fail the page.
 */
export async function readMemberContacts(supabase: SupabaseClient, householdId: string): Promise<Map<string, MemberContact> | null> {
  const { data, error } = await supabase.from("household_member_contacts").select("member_id, email, phone, phone_as_typed").eq("household_id", householdId).limit(500);
  if (error) {
    if (MISSING_TABLE.has(error.code ?? "")) return null;
    throw new Error(`readMemberContacts failed: ${error.code ?? "unknown"}`);
  }
  return new Map(((data ?? []) as ContactRow[]).map((row) => [row.member_id, { email: row.email, phone: row.phone, phoneAsTyped: row.phone_as_typed }]));
}

export type SetContactResult = "saved" | "removed" | "unchanged" | "unavailable";

/**
 * Records, changes or clears one member's contact details. The member
 * themselves or an Admin; the database refuses anyone else too. Both blank
 * removes the row. The audit trail says only that they changed, never the
 * values (a plain "details updated" row).
 */
export async function setMemberContact(
  supabase: SupabaseClient,
  actor: HouseholdMembership,
  input: { memberId: string; contact: MemberContact },
): Promise<SetContactResult> {
  if (!mayEditMemberContact(actor, input.memberId)) throw ApiError.forbidden("You can edit your own contact details, or an Admin can edit anyone's.");
  const householdId = actor.household.id;
  const { email, phone } = input.contact;
  const phoneAsTyped = phone ? input.contact.phoneAsTyped : null;

  const current = await readMemberContacts(supabase, householdId);
  if (current === null) return "unavailable";
  const was = current.get(input.memberId) ?? null;
  if ((was?.email ?? null) === email && (was?.phone ?? null) === phone && (was?.phoneAsTyped ?? null) === phoneAsTyped) return "unchanged";

  if (!email && !phone) {
    if (!was) return "unchanged";
    const { error } = await supabase.from("household_member_contacts").delete().eq("member_id", input.memberId).eq("household_id", householdId);
    if (error) throw new Error(`clearing a member contact failed: ${error.code ?? "unknown"}`);
    await auditChange({ householdId, actorMemberId: actor.memberId, eventType: "member.profile_updated", targetTable: "household_member_contacts", targetId: input.memberId });
    return "removed";
  }

  const { error } = await supabase
    .from("household_member_contacts")
    .upsert({ member_id: input.memberId, household_id: householdId, email, phone, phone_as_typed: phoneAsTyped, updated_by_member_id: actor.memberId }, { onConflict: "member_id" });
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You can edit your own contact details, or an Admin can edit anyone's.");
    if (MISSING_TABLE.has(error.code ?? "")) return "unavailable";
    throw new Error(`setting a member contact failed: ${error.code ?? "unknown"}`);
  }
  await auditChange({ householdId, actorMemberId: actor.memberId, eventType: "member.profile_updated", targetTable: "household_member_contacts", targetId: input.memberId });
  return "saved";
}
