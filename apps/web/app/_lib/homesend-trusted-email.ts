import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getHomeSendItem } from "@wonderhome/core/homesend/repository";
import { TRUSTED_SENDER_SOURCE, trustedSenderVoucher, type TrustedEmailAdd } from "@wonderhome/core/homesend/trusted-arrival";
import { requireMembership } from "@wonderhome/core/identity/households";
import { log } from "@wonderhome/core/observability/logger";
import { withMemberSession } from "@wonderhome/core/voicelink/member-session";

import { addIfAllowed } from "@/app/(auth)/home-send-auto";

/**
 * A trusted sender's email, added on arrival (`homesend/trusted-arrival.ts`).
 * The same review and governed write the app runs, as the Admin who trusted
 * the sender, under their own session and RLS, like WhatsApp's
 * `whatsappAutoAdd`. Only an "add on its own" decision is acted on; anything
 * else waits in HomeSend. The item stays the email's (no member sent it), so
 * it is decided as a trusted sender's, never as the Admin's own words.
 */
export function trustedEmailAutoAdd(admin: SupabaseClient): TrustedEmailAdd {
  return async ({ householdId, itemId }) => {
    try {
      const item = await getHomeSendItem(admin, householdId, itemId);
      if (!item || item.source !== "email" || item.createdByMemberId !== null || item.status !== "classified") return;
      const voucher = await trustedSenderVoucher(admin, householdId, item.senderAddress);
      if (!voucher) return;
      await withMemberSession(admin, voucher.profileId, async (supabase) =>
        addIfAllowed(supabase, await requireMembership(supabase, householdId), itemId, { source: TRUSTED_SENDER_SOURCE }),
      );
    } catch (thrown) {
      log.warn("homesend email: add on arrival failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
    }
  };
}
