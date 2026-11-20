import { describe, expect, it } from "vitest";

import { nothingWaitsOnTarget, parseNothingWaits, questionsPerTen } from "./metrics";

describe("the Nothing waits measures", () => {
  it("reads the aggregate function's answer, and nothing else", () => {
    expect(parseNothingWaits(null)).toBeNull();
    expect(parseNothingWaits({ unrelated: 1 })).toBeNull();
    const metrics = parseNothingWaits({
      neededPerson: { count: 37, of: 92 },
      openByHousehold: [{ open: 4, oldestHours: 60 }, { open: "1", oldestHours: 2 }],
      openTotal: 5,
      checkingOver7d: 0,
      checkingKept: 6,
      undoneWithin7d: { count: 2, of: 42 },
    });
    expect(metrics).toEqual({
      neededPerson: { count: 37, of: 92 },
      openByHousehold: [{ open: 4, oldestHours: 60 }, { open: 1, oldestHours: 2 }],
      openTotal: 5,
      checkingOver7d: 0,
      checkingKept: 6,
      undoneWithin7d: { count: 2, of: 42 },
      questionsAsked: null,
      answeredByPerson: null,
      confirmedWithoutTap: null,
      undoneOrCorrectedWithin7d: null,
    });
    expect(nothingWaitsOnTarget(metrics!)).toEqual({ neededPerson: false, open: false, checking: true, undone: true, questions: true, answered: true, corrected: true });
  });

  it("is on target with fewer than 1 in 10 needing a person and nothing past 48 hours", () => {
    const on = nothingWaitsOnTarget({ neededPerson: { count: 9, of: 100 }, openByHousehold: [{ open: 3, oldestHours: 48 }], openTotal: 3, checkingOver7d: 0, checkingKept: 0, undoneWithin7d: { count: 4, of: 100 }, questionsAsked: null, answeredByPerson: null, confirmedWithoutTap: null, undoneOrCorrectedWithin7d: null });
    expect(on).toEqual({ neededPerson: true, open: true, checking: true, undone: true, questions: true, answered: true, corrected: true });
  });

  it("reads the 2026-11-20 measures: questions per 10 sends, answered by a person, confirmed without a tap, undone or corrected", () => {
    const metrics = parseNothingWaits({
      neededPerson: { count: 3, of: 30 },
      openByHousehold: [],
      openTotal: 0,
      checkingOver7d: 0,
      checkingKept: 0,
      undoneWithin7d: { count: 1, of: 11 },
      questionsAsked: { count: 9, of: 30 },
      answeredByPerson: { count: 0, of: 9 },
      confirmedWithoutTap: [{ basis: "second_source", count: 4 }, { basis: "Not A Basis!", count: "2" }],
      undoneOrCorrectedWithin7d: { count: 1, of: 11 },
    })!;
    expect(questionsPerTen(metrics.questionsAsked)).toBe(3);
    expect(metrics.confirmedWithoutTap).toEqual([{ basis: "second_source", count: 4 }, { basis: "other", count: 2 }]);
    const on = nothingWaitsOnTarget(metrics);
    expect(on).toMatchObject({ questions: false, answered: false, corrected: false });
    expect(questionsPerTen({ count: 1, of: 30 })).toBe(0.3);
    expect(questionsPerTen({ count: 0, of: 0 })).toBeNull();
  });
});
