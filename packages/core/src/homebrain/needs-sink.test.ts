import { describe, expect, it } from "vitest";

import { applyNeedsYouAnswer } from "../hometalk/needs-you-answer";
import type { NeedsYouItem } from "../hometalk/needs-you";
import { CONFLICT_SOURCE, NEEDS_YOU_SINK } from "./needs-sink";
import type { Conflict } from "./verify-night";

const item = (over: Partial<NeedsYouItem> = {}): NeedsYouItem => ({
  id: "n1",
  householdId: "h1",
  source: CONFLICT_SOURCE,
  subjectTable: "home_send_items",
  subjectId: "item-1",
  recipientMemberId: null,
  prompt: { code: "homebrain.conflict.duplicate", title: "Electricity" },
  answers: [{ value: "remove" }, { value: "keep" }],
  defaultAnswer: "keep",
  defaultAt: "2026-11-15T22:00:00Z",
  expiresAt: "2026-11-16T22:00:00Z",
  consequence: 1,
  dueOn: null,
  createdAt: "2026-11-14T22:00:00Z",
  answeredInPlace: true,
  ...over,
});
const how = (byDefault: boolean) => ({ byDefault, actor: { householdId: "h1", memberId: byDefault ? null : "m1" }, now: new Date("2026-11-15T22:00:00Z") });
const client = {} as never;

describe("HomeBrain conflicts in Needs you", () => {
  it("a person's Remove runs HomeSend's Undo", async () => {
    expect(await applyNeedsYouAnswer(client, item(), "remove", how(false))).toBe("undo");
  });
  it("Keep, and every default, keeps the entry", async () => {
    expect(await applyNeedsYouAnswer(client, item(), "keep", how(false))).toBe("done");
    expect(await applyNeedsYouAnswer(client, item(), "keep", how(true))).toBe("done");
    // Even a default of "remove" never removes anything.
    expect(await applyNeedsYouAnswer(client, item({ defaultAnswer: "remove" }), "remove", how(true))).toBe("done");
  });

  it("asks once per HomeSend item, keep by default, with the evidence kept for Why?", async () => {
    const inserted: Record<string, unknown>[] = [];
    const admin = {
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return { select: () => ({ maybeSingle: async () => ({ data: { id: "n9" }, error: null }) }) };
        },
      }),
    } as never;
    const conflict: Conflict = {
      reason: "unusual_amount",
      changeId: "c1",
      itemId: "item-1",
      label: "Electricity",
      kind: "bill",
      dueOn: "2026-11-20",
      otherChangeId: null,
      recipientMemberId: "m1",
      question: "",
      answers: [
        { id: "keep", label: "It's right", action: "keep" },
        { id: "remove", label: "Remove it", action: "undo_this" },
      ],
      defaultAnswerId: "keep",
      defaultWords: "",
      evidence: ["City Power's last 3 bills were near the usual amount."],
    };
    expect(await NEEDS_YOU_SINK.raise(admin, "h1", conflict, new Date("2026-11-14T22:00:00Z"))).toBe(true);
    expect(inserted[0]).toMatchObject({
      source: CONFLICT_SOURCE,
      subject_table: "home_send_items",
      subject_id: "item-1",
      default_answer: "keep",
      consequence: 2,
      answers: [{ value: "keep" }, { value: "remove" }],
      prompt: { code: "homebrain.conflict.unusual_amount", title: "Electricity", why: "City Power's last 3 bills were near the usual amount." },
    });
    // No amount in what is asked.
    expect(JSON.stringify(inserted[0]!.prompt)).not.toMatch(/₹|\d{3,}/);
  });
});
