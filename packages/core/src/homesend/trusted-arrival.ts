import type { SupabaseClient } from "@supabase/supabase-js";

import { activeAdultAdmin } from "../identity/active-admin";
import { senderMatchesAllowlist, type AllowlistKind } from "./email-allowlist";

/**
 * Email from a trusted sender is added on arrival (14-068 follow-up, the
 * owner 2026-11-14: "minimum intervention"). Until now a trusted sender's
 * email was decided like a member's own item only when a member opened or
 * cleared HomeSend.
 *
 * Nobody in the household is acting when an email arrives, and every write
 * HomeSend makes goes through the governed write a person's confirm uses,
 * as a member under row-level security. So the email is added as the Admin
 * who trusted its sender: the one who put the address (or domain) on the
 * allowlist, by "Trust this sender?" or on Settings. Their trust is the
 * authority for it, the change is audited under them with the source
 * `email:trusted_sender`, Checking questions go to them, and Undo works as
 * for any entry. The same session mechanism WhatsApp uses
 * (`voicelink/member-session.ts`).
 *
 * Nothing is added when nobody can vouch: the allowlist row has no Admin
 * (added before attribution, or that member left), or that member is no
 * longer an active adult Admin. Then the email waits, as before, for a
 * member to open HomeSend. The decision itself is unchanged
 * (`confirmation.ts` `trustedSender`): its content stays untrusted,
 * instructions inside it hold it, and money and health stay Checking.
 */

/** Adds a just-read email item on its own when its sender is trusted. Never throws. */
export type TrustedEmailAdd = (input: { householdId: string; itemId: string }) => Promise<void>;

/** The audit source an entry added this way carries. */
export const TRUSTED_SENDER_SOURCE = "email:trusted_sender";

export type Voucher = { memberId: string; profileId: string };

/**
 * The Admin who vouches for this sender in this household, or null. An
 * address entry wins over a domain entry; among several, the oldest.
 */
export async function trustedSenderVoucher(admin: SupabaseClient, householdId: string, from: string | null | undefined): Promise<Voucher | null> {
  if (!from) return null;
  const { data, error } = await admin
    .from("homesend_email_allowlist")
    .select("kind, value, created_by_member_id, created_at")
    .eq("household_id", householdId)
    .not("created_by_member_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error || !data) return null;
  const rows = data as { kind: AllowlistKind; value: string; created_by_member_id: string }[];
  const matching = rows.filter((row) => senderMatchesAllowlist(from, [{ kind: row.kind, value: row.value }]));
  const ordered = [...matching.filter((row) => row.kind === "address"), ...matching.filter((row) => row.kind === "domain")];
  for (const row of ordered) {
    const voucher = await activeAdultAdmin(admin, householdId, row.created_by_member_id);
    if (voucher) return voucher;
  }
  return null;
}
