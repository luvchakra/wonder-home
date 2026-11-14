import { describe, expect, it } from "vitest";

import { groceryFromRule, groceryPickLesson } from "./grocery-lesson";
import type { HouseholdRule } from "./rules";

const pending = (item: string) => ({
  action: "add_to_list" as const,
  target: { kind: "unspecified" as const },
  parameters: {
    item,
    awaiting: "item",
    candidates: [
      { entityType: "consumable", entityId: "c1", label: "Atta (wheat flour)", source: "clarification", at: "" },
      { entityType: "consumable", entityId: "c2", label: "Atta (multigrain)", source: "clarification", at: "" },
    ],
  },
  question: "Should I use atta (wheat flour) or atta (multigrain)?",
  utterance: "add 2 kg atta",
  asked: 1,
});

describe("grocery words become a household rule", () => {
  it("a pick from the choices teaches the words, without the amount", () => {
    expect(groceryPickLesson(pending("2 kg atta") as never, { parameters: { item: "2 kg Atta (wheat flour)" } })).toEqual({ phrase: "atta", item: "Atta (wheat flour)" });
  });
  it("nothing picked from the choices teaches nothing", () => {
    expect(groceryPickLesson(pending("atta") as never, { parameters: { item: "Rice" } })).toBeNull();
    expect(groceryPickLesson({ ...pending("atta"), parameters: { ...pending("atta").parameters, awaiting: "day" } } as never, { parameters: { item: "Atta (wheat flour)" } })).toBeNull();
    expect(groceryPickLesson(null, { parameters: { item: "Atta (wheat flour)" } })).toBeNull();
  });
  it("a rule picks the one choice it names; a mixed or unknown one picks nothing", () => {
    const rule: HouseholdRule = { id: "r", kind: "phrase_item", key: "phrase:atta", valueMemberId: null, valueText: "Atta (wheat flour)", learnedByMemberId: null, learnedFromItemId: null, learnedAt: "", mixed: false, source: "pick", times: 1 };
    const choices = [{ name: "Atta (wheat flour)" }, { name: "Atta (multigrain)" }];
    expect(groceryFromRule("atta", choices, [rule])?.name).toBe("Atta (wheat flour)");
    expect(groceryFromRule("atta", choices, [{ ...rule, mixed: true }])).toBeNull();
    expect(groceryFromRule("atta", [{ name: "Atta (multigrain)" }], [rule])).toBeNull();
  });
});
