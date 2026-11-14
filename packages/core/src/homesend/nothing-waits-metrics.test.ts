import { describe, expect, it } from "vitest";

import { nothingWaitsOnTarget, parseNothingWaits } from "./metrics";

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
    });
    expect(nothingWaitsOnTarget(metrics!)).toEqual({ neededPerson: false, open: false, checking: true, undone: true });
  });

  it("is on target with fewer than 1 in 10 needing a person and nothing past 48 hours", () => {
    const on = nothingWaitsOnTarget({ neededPerson: { count: 9, of: 100 }, openByHousehold: [{ open: 3, oldestHours: 48 }], openTotal: 3, checkingOver7d: 0, checkingKept: 0, undoneWithin7d: { count: 4, of: 100 } });
    expect(on).toEqual({ neededPerson: true, open: true, checking: true, undone: true });
  });
});
