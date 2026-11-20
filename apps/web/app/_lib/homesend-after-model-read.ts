import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AfterModelRead } from "@wonderhome/core/homesend/retry-queue";
import { whatsappConfigFromEnv } from "@wonderhome/core/notifications/whatsapp";
import { tellSenderAfterModelRead } from "@wonderhome/core/whatsapp/intake";

import { trustedEmailAutoAdd } from "./homesend-trusted-email";
import { whatsappAutoAdd } from "./whatsapp-hometalk";

/**
 * Once an item kept for want of a model is read (2026-11-21,
 * `homesend/model-unavailable.ts`): the same record-first add a reading on
 * arrival gets, under its sender's own session (an email with no member, by
 * the trusted-sender add), then its sender is told what was done, once, on the
 * channel it came from. WhatsApp hears it on the sender's active link; an app
 * upload or an email is reported by the evening summary, as on arrival.
 */
export function homesendAfterModelRead(admin: SupabaseClient): AfterModelRead {
  const add = whatsappAutoAdd(admin);
  const addTrusted = trustedEmailAutoAdd(admin);
  return async (_admin, item, outcome) => {
    let decided: Awaited<ReturnType<typeof add>> = null;
    if (outcome.state !== "failed") {
      if (item.createdByMemberId) decided = await add({ householdId: item.householdId, memberId: item.createdByMemberId, itemId: item.id });
      else if (item.source === "email" || item.source === "email_attachment") await addTrusted({ householdId: item.householdId, itemId: item.id });
    }
    if (item.source === "whatsapp" || item.source === "whatsapp_media") {
      const whatsapp = whatsappConfigFromEnv();
      if (whatsapp) await tellSenderAfterModelRead(admin, { config: whatsapp.adapter, householdId: item.householdId, itemId: item.id, outcome, decided });
    }
  };
}
