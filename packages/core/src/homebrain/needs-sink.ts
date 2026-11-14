import type { SupabaseClient } from "@supabase/supabase-js";

import { askNeedsYou, needsYouReady } from "../hometalk/needs-you-repository";
import type { NeedsYouPrompt } from "../hometalk/needs-you";
import type { NeedsSink } from "./verify-night-run";
import type { Conflict, ConflictReason } from "./verify-night";

/**
 * Where the nightly check's conflicts go: the household's one "Needs you"
 * list (`hometalk/needs-you-repository.ts`, part A). One open question per
 * HomeSend item (`subject_table` home_send_items, so a person's "Remove it"
 * runs HomeSend's own Undo), worded by `prompt.code`
 * `homebrain.conflict.<reason>`, with the evidence kept in `prompt.why` for
 * "Why?". Every default is "keep": a question nobody answers never removes
 * anything (`hometalk/needs-you-answer.ts`).
 */

export const CONFLICT_SOURCE = "homebrain_conflict";

/** How much it matters, for the list's order: an unusual amount leads. */
const CONSEQUENCE: Record<ConflictReason, 0 | 1 | 2 | 3> = { unusual_amount: 2, duplicate: 1, date_clash: 1, sender_mismatch: 1 };

export const NEEDS_YOU_SINK: NeedsSink = {
  async alreadyRaised(admin: SupabaseClient, householdId: string, entries: readonly { changeId: string; itemId: string }[]): Promise<Set<string>> {
    if (entries.length === 0) return new Set();
    const { data, error } = await admin
      .from("needs_you_items")
      .select("subject_id")
      .eq("household_id", householdId)
      .eq("source", CONFLICT_SOURCE)
      .in("subject_id", [...new Set(entries.map((entry) => entry.itemId))])
      .limit(500);
    // Can't tell what was asked: treat everything as asked, so nobody is asked twice.
    if (error) return new Set(entries.map((entry) => entry.changeId));
    const asked = new Set(((data ?? []) as { subject_id: string }[]).map((row) => row.subject_id));
    return new Set(entries.filter((entry) => asked.has(entry.itemId)).map((entry) => entry.changeId));
  },
  async raise(admin: SupabaseClient, householdId: string, conflict: Conflict, now: Date): Promise<boolean> {
    const id = await askNeedsYou(admin, {
      householdId,
      source: CONFLICT_SOURCE,
      subjectTable: "home_send_items",
      subjectId: conflict.itemId,
      recipientMemberId: conflict.recipientMemberId,
      prompt: { code: `homebrain.conflict.${conflict.reason}`, title: conflict.label, kind: conflict.kind, why: conflict.evidence.join(" ") } as NeedsYouPrompt,
      answers: conflict.answers.map((answer) => ({ value: answer.id })),
      defaultAnswer: conflict.defaultAnswerId,
      consequence: CONSEQUENCE[conflict.reason],
      dueOn: conflict.dueOn,
      askedAt: now,
    });
    return id !== null;
  },
};

/** The sink the sleep job uses: "Needs you" once its table is there; before that, conflicts are only counted. */
export async function defaultNeedsSink(admin: SupabaseClient): Promise<NeedsSink | null> {
  return (await needsYouReady(admin).catch(() => false)) ? NEEDS_YOU_SINK : null;
}
