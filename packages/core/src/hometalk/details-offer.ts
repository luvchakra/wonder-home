import type { SupabaseClient } from "@supabase/supabase-js";

import { openSession, recordMessage } from "../conversation/repository";
import type { Translate } from "../i18n/translate";
import { titlesFor, waitingForDetails, type IntakePerson } from "./intake-questions";

/**
 * HomeTalk offers, on its own, to fill in what waits in HomeSend (story
 * 14-050; the owner said yes on 2026-10-26): "2 things in HomeSend need a
 * detail — Maths worksheet and Diwali dinner. Shall we fill them in now?"
 *
 * Said when an adult opens HomeTalk and something they can see is missing a
 * detail HomeTalk can ask. It is a question, so it never acts: "yes" asks the
 * first item's first question (`fill_homesend_details`), "no" leaves them.
 * It is offered at most once every twelve hours, never over a question
 * HomeTalk is still waiting on, and never repeated while the last word is the
 * offer itself.
 */

export const OFFER_EVERY_MS = 12 * 3_600_000;

type Said = { role: string; created_at: string; metadata: { intent?: unknown; mode?: unknown; clarify?: unknown } | null };

/** Whether an offer may be made now, from the conversation's latest messages (newest first). Pure. */
export function mayOffer(latest: readonly Said[], now: Date): boolean {
  const last = latest[0];
  // HomeTalk is waiting on an answer: never talk over its own question.
  if (last?.role === "assistant" && last.metadata?.mode === "clarify") return false;
  const since = now.getTime() - OFFER_EVERY_MS;
  return !latest.some((message) => message.metadata?.intent === "fill_homesend_details" && message.role === "assistant" && Date.parse(message.created_at) >= since);
}

/**
 * Makes the offer in the member's app conversation when there is something to
 * fill in. Reads the items through the member's own client (RLS decides);
 * writes HomeTalk's words with the service role, as the welcome does.
 * Returns what was said and where (the session and the message), or null.
 * Never throws.
 */
export async function offerToFillDetails(
  client: SupabaseClient,
  admin: SupabaseClient,
  input: { householdId: string; memberId: string; people: readonly IntakePerson[]; t: Translate; now: Date },
): Promise<{ text: string; sessionId: string; messageId: string; at: string } | null> {
  try {
    const waiting = await waitingForDetails(client, { householdId: input.householdId, people: input.people, now: input.now });
    if (waiting.length === 0) return null;
    const sessionId = await openSession(admin, { householdId: input.householdId, memberId: input.memberId, channel: "text" });
    const { data } = await admin
      .from("conversation_messages")
      .select("role, created_at, metadata")
      .eq("household_id", input.householdId)
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!mayOffer((data ?? []) as Said[], input.now)) return null;
    const titles = titlesFor(waiting, input.t("homesend.offer.and"));
    const text = titles
      ? input.t("homesend.offer.ask", { count: waiting.length, titles })
      : input.t("homesend.offer.askUntitled", { count: waiting.length });
    const messageId = await recordMessage(admin, {
      householdId: input.householdId,
      sessionId,
      role: "assistant",
      content: text,
      metadata: {
        proposal: "clarify",
        intent: "fill_homesend_details",
        mode: "clarify",
        clarify: { action: "fill_homesend_details", target: { kind: "unspecified" }, parameters: { itemIds: waiting.map((item) => item.itemId) }, question: text, utterance: "", asked: 1 },
      },
    });
    return { text, sessionId, messageId, at: input.now.toISOString() };
  } catch {
    return null;
  }
}
