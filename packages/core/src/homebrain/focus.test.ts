import { describe, expect, it } from "vitest";

import { DEFAULT_DATA_USE } from "../ai/privacy";
import { contextItemsFor, GOLDEN_HOUSEHOLDS, viewerFor } from "../evaluation/households";
import type { HouseholdKey } from "../evaluation/types";
import { focusFromAnswer } from "./focus";
import { answerWithHomeBrain } from "./turn";

const ask = async (key: HouseholdKey, memberId: string, question: string) => {
  const household = GOLDEN_HOUSEHOLDS[key];
  const items = contextItemsFor(household, memberId);
  const answer = await answerWithHomeBrain({
    question, sentQuestion: question, previousQuestion: null, sentHistory: [], items,
    viewer: { memberId, roleLabel: "Adult", guardianOf: viewerFor(household, memberId).guardianOf },
    timezone: household.timezone, now: household.now, policy: DEFAULT_DATA_USE, people: [], compose: null, factBudget: 12,
  });
  return focusFromAnswer(answer, items, household.now.toISOString());
};

describe("focusFromAnswer", () => {
  it("an answer about one record leaves that record for the next turn's \"it\"", async () => {
    expect(await ask("A", "a-kunal", "When is the Science project due?")).toEqual([
      expect.objectContaining({ entityType: "school_item", entityId: "a-s-science", label: "Science project", source: "mention" }),
    ]);
    expect(await ask("B", "b-arjun", "When is the rent due?")).toEqual([expect.objectContaining({ entityType: "bill", entityId: "b-b-rent", label: "Rent" })]);
  });

  it("an answer that lists many things is about none of them, and a person is never an \"it\"", async () => {
    expect(await ask("B", "b-arjun", "Which bills are due next month?")).toHaveLength(3);
    expect(await ask("B", "b-arjun", "Which bills do I have?")).toEqual([]);
    expect((await ask("A", "a-kunal", "What does Asmi have tomorrow?")).every((entity) => entity.entityType !== "member")).toBe(true);
  });

  it("an answer with nothing on record leaves nothing", async () => {
    expect(await ask("A", "a-sunita", "Which bills are due?")).toEqual([]);
  });
});
