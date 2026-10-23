import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { log } from "@wonderhome/core/observability/logger";
import { WHATSAPP_SCOPES } from "@wonderhome/core/voicelink/scopes";
import { withMemberSession } from "@wonderhome/core/voicelink/member-session";
import { whatsappReplyText } from "@wonderhome/core/whatsapp/hometalk";
import type { WhatsAppIntakeDeps } from "@wonderhome/core/whatsapp/intake";

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
  return async ({ householdId, memberId, text, requestId }) => {
    const { data } = await admin.from("household_members").select("profile_id").eq("household_id", householdId).eq("id", memberId).maybeSingle();
    const profileId = (data as { profile_id: string | null } | null)?.profile_id ?? null;
    if (!profileId) return null;
    try {
      const response = await withMemberSession(admin, profileId, (supabase) =>
        handleHomeTalkRequest(
          { channel: "whatsapp", householdId, memberId, requestId, input: { text, modality: "text" } },
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
