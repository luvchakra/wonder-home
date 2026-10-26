import { describe, expect, it } from "vitest";

import { GOLDEN_CASES } from "../evaluation/cases";
import { observeHomeTalk } from "../evaluation/runners";
import type { HomeTalkCase } from "../evaluation/types";
import type { IntentAction } from "./intent";
import type { Proposal } from "./proposal";
import { warmReply } from "./warmth";

/**
 * HomeTalk's reply rule (the owner, 2026-10-26: "HomeTalk must structure the
 * message properly, use emojis and make it cheerful. put this as a rule for
 * HomeTalk"). Every golden HomeTalk reply, as `warmReply` sends it:
 *  - an answer, a confirmation, a question or a preview carries an emoji;
 *  - no line folds three or more things into one sentence with semicolons
 *    (they are a list, one per line).
 */
const WARM: readonly Proposal["kind"][] = ["answer", "executed", "clarify", "prepared", "needs_approval"];
const EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}\u{FE0F}/u;

describe("HomeTalk's reply rule: structured, with emojis, cheerful", () => {
  const cases = GOLDEN_CASES.filter((c): c is HomeTalkCase => c.surface === "hometalk");

  it("holds for every golden HomeTalk reply", async () => {
    const broken: string[] = [];
    for (const c of cases) {
      const seen = await observeHomeTalk(c);
      const proposal = seen.action as Proposal["kind"] | null;
      const ok = seen.executor !== "failed" && !seen.providerFailure;
      const sent = warmReply(seen.answer, { action: seen.interpretation as IntentAction | null, proposal, ok });
      if (!sent.trim()) continue;
      if (ok && proposal && WARM.includes(proposal) && !EMOJI.test(sent)) broken.push(`${c.id}: no emoji — ${sent.slice(0, 600)}`);
      const crowded = sent.split("\n").find((line) => line.split(/;\s/).length >= 3);
      if (crowded) broken.push(`${c.id}: three or more things in one line — ${crowded.slice(0, 600)}`);
    }
    expect(broken).toEqual([]);
  });
});
