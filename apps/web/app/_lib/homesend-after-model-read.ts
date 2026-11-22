import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AddedOnItsOwn } from "@wonderhome/core/homebrain/intake/auto-add";
import { findAddedTwin, getHomeSendItem, setAsideAsAlreadyRecorded } from "@wonderhome/core/homesend/repository";
import type { AfterModelRead } from "@wonderhome/core/homesend/retry-queue";
import { whatsappConfigFromEnv } from "@wonderhome/core/notifications/whatsapp";
import { tellSenderAfterModelRead } from "@wonderhome/core/whatsapp/intake";

import { trustedEmailAutoAdd } from "./homesend-trusted-email";
import { whatsappAutoAdd } from "./whatsapp-hometalk";

/** The area an added item lives in, as its reply names it. */
const AREA_OF_TABLE: Record<string, string> = { school_items: "Kids & School", school_exams: "Kids & School", activity_items: "Kids & School", obligations: "Bills", consumables: "Groceries", events: "Calendar" };

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
  const alreadyAdded = async (householdId: string, itemId: string): Promise<AddedOnItsOwn | null> => {
    const read = await getHomeSendItem(admin, householdId, itemId).catch(() => null);
    if (!read || read.status !== "classified") return null;
    const title = read.extracted?.title?.trim() || null;
    const twin = await findAddedTwin(admin, householdId, { id: read.id, contentHash: read.contentHash ?? null, classifiedKind: read.classifiedKind ?? null, title });
    if (!twin || !(await setAsideAsAlreadyRecorded(admin, householdId, read.id, twin.id))) return null;
    return { title: twin.title ?? title ?? "it", where: AREA_OF_TABLE[twin.routedTable ?? ""] ?? "WonderHome", kind: read.classifiedKind, already: true };
  };
  return async (_admin, item, outcome) => {
    let decided: Awaited<ReturnType<typeof add>> = null;
    if (outcome.state !== "failed") {
      // Sent again meanwhile and that copy already added: said once, never added twice (the owner's timetable, 21 Nov).
      const already = await alreadyAdded(item.householdId, item.id);
      if (already) decided = already;
      else if (item.createdByMemberId) decided = await add({ householdId: item.householdId, memberId: item.createdByMemberId, itemId: item.id });
      else if (item.source === "email" || item.source === "email_attachment") await addTrusted({ householdId: item.householdId, itemId: item.id });
    }
    if (item.source === "whatsapp" || item.source === "whatsapp_media") {
      const whatsapp = whatsappConfigFromEnv();
      if (whatsapp) await tellSenderAfterModelRead(admin, { config: whatsapp.adapter, householdId: item.householdId, itemId: item.id, outcome, decided });
    }
  };
}
