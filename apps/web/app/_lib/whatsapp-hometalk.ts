import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "@wonderhome/core/observability/logger";
import { WHATSAPP_SCOPES } from "@wonderhome/core/voicelink/scopes";
import { withMemberSession } from "@wonderhome/core/voicelink/member-session";
import { whatsappReplyText } from "@wonderhome/core/whatsapp/hometalk";
import type { WhatsAppIntakeDeps } from "@wonderhome/core/whatsapp/intake";

import { requireMembership } from "@wonderhome/core/identity/households";

import { addIfAllowed } from "@/app/(auth)/home-send-auto";
import { handleHomeTalkRequest } from "@/app/_lib/hometalk-gateway";

/**
 * HomeTalk for a linked adult on WhatsApp (the owner's yes, 2026-10-24).
 *
 * The household and member come from the verified WhatsApp link, never from
 * the message. The turn runs as that member, under their own session and RLS,
 * through the same gateway as Alexa, on channel `whatsapp` with
 * `WHATSAPP_SCOPES`: everyday questions, the list, reminders, remembering
 * something; a child's school, health, money and changing the home stay in
 * the app. The WhatsApp message id is the delivery id, so a redelivery
 * replays the first answer instead of acting twice.
 */
export function whatsappAsk(admin: SupabaseClient): NonNullable<WhatsAppIntakeDeps["ask"]> {
  return async ({ householdId, memberId, text, requestId, spoken }) => {
    const { data } = await admin.from("household_members").select("profile_id").eq("household_id", householdId).eq("id", memberId).maybeSingle();
    const profileId = (data as { profile_id: string | null } | null)?.profile_id ?? null;
    if (!profileId) return null;
    try {
      const response = await withMemberSession(admin, profileId, (supabase) =>
        handleHomeTalkRequest(
          { channel: "whatsapp", householdId, memberId, requestId, input: spoken ? { text, modality: "voice", transcriptConfidence: spoken.confidence } : { text, modality: "text" } },
          { supabase },
          { scopes: WHATSAPP_SCOPES, whatsapp: true },
        ),
      );
      return whatsappReplyText(response);
    } catch (thrown) {
      log.warn("whatsapp: hometalk turn failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
      return null;
    }
  };
}

/**
 * Carrying a WhatsApp item on where the household allows it (the owner,
 * 2026-10-26): once it is known who an item is for, or straight away when
 * nothing is missing, the same review the app runs decides, under the
 * member's own session. Only an "add on its own" decision is acted on —
 * the outcome set to "Pre Approved", the reading above the household's bar,
 * a grocery or school item — through the same governed write and Undo as
 * the app. Anything else waits in HomeSend; WhatsApp never confirms.
 */
export function whatsappAutoAdd(admin: SupabaseClient): NonNullable<WhatsAppIntakeDeps["addOnItsOwn"]> {
  return async ({ householdId, memberId, itemId }) => {
    const { data } = await admin.from("household_members").select("profile_id").eq("household_id", householdId).eq("id", memberId).maybeSingle();
    const profileId = (data as { profile_id: string | null } | null)?.profile_id ?? null;
    if (!profileId) return null;
    try {
      return await withMemberSession(admin, profileId, async (supabase) => addIfAllowed(supabase, await requireMembership(supabase, householdId), itemId, { createdByMemberId: memberId }));
    } catch (thrown) {
      log.warn("whatsapp: add on its own failed", { reason: thrown instanceof Error ? thrown.name : "unknown", allow: ["reason"] });
      return null;
    }
  };
}

