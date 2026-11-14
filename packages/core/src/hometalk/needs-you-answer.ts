import type { SupabaseClient } from "@supabase/supabase-js";

import { applyHomeSendAnswer } from "../homesend/needs-you";
import type { NeedsYouItem } from "./needs-you";
import { handlerFor, type NeedsYouActor } from "./needs-you-repository";

/**
 * What an answer to a "Needs you" question does, by where the question came
 * from — the one switch a person's tap (`apps/web/app/(auth)/needs-you-actions.ts`)
 * and the 24-hour default (`hometalk/needs-you-run.ts`) both go through.
 *
 *   - HomeSend's own questions: `homesend/needs-you.ts`.
 *   - Any other source (part B's "sender_trust", part C's "conflict"): the
 *     handler that part registered with `registerNeedsYouHandler`; with none,
 *     "unhandled" (the step closes it as expired at 48 hours, never leaves it open).
 *
 * "done": the answer was applied. "settled": the thing was already settled
 * elsewhere, so the question is withdrawn. "undo": the caller runs the same
 * Undo the HomeSend screen offers (a person's "Not right"; never a default).
 */
export async function applyNeedsYouAnswer(
  client: SupabaseClient,
  item: NeedsYouItem,
  answer: string,
  how: { byDefault: boolean; actor: NeedsYouActor; now: Date },
): Promise<"done" | "settled" | "undo" | "unhandled"> {
  if (item.source === "homesend_check" || item.source === "homesend_waiting" || item.source === "homesend_resend") {
    const result = await applyHomeSendAnswer(client, item, answer, { byDefault: how.byDefault, memberId: how.actor.memberId, now: how.now });
    // A default never undoes anything.
    return how.byDefault && result === "undo" ? "settled" : result;
  }
  const handler = handlerFor(item.source);
  if (!handler) return "unhandled";
  return (await handler(client, item, answer, how)) ? "done" : "settled";
}
