import { describe, expect, it } from "vitest";

import { barFromHistory, effectiveBar, historyByKind, kindOfDomain, MAX_BAR, MIN_BAR } from "./kind-bar";

describe("per-kind bar: fixed, documented limits", () => {
  it("too little history keeps 95%", () => {
    expect(barFromHistory({ added: 9, undone: 0, corrected: 0 })).toBe(95);
    expect(barFromHistory({ added: 0, undone: 0, corrected: 0 })).toBe(95);
  });
  it("follows the household's own error rate", () => {
    expect(barFromHistory({ added: 50, undone: 0, corrected: 0 })).toBe(80);
    expect(barFromHistory({ added: 60, undone: 1, corrected: 0 })).toBe(85);
    expect(barFromHistory({ added: 20, undone: 0, corrected: 0 })).toBe(85);
    expect(barFromHistory({ added: 10, undone: 0, corrected: 0 })).toBe(90);
    expect(barFromHistory({ added: 20, undone: 1, corrected: 0 })).toBe(95);
    expect(barFromHistory({ added: 20, undone: 1, corrected: 2 })).toBe(97);
    expect(barFromHistory({ added: 10, undone: 2, corrected: 1 })).toBe(99);
  });
  it("never leaves 80–99, whatever the history says", () => {
    for (const added of [10, 50, 1000, 100000]) {
      for (const errors of [0, 1, 5, added]) {
        const bar = barFromHistory({ added, undone: errors, corrected: errors });
        expect(bar).toBeGreaterThanOrEqual(MIN_BAR);
        expect(bar).toBeLessThanOrEqual(MAX_BAR);
      }
    }
    expect(barFromHistory({ added: -5, undone: -1, corrected: 0 })).toBe(95);
  });
});

describe("per-kind bar: counting", () => {
  it("maps domains to kinds", () => {
    expect(kindOfDomain("purchase")).toBe("receipt");
    expect(kindOfDomain("activity")).toBe("activity_item");
    expect(kindOfDomain("nonsense")).toBeNull();
  });
  it("an entry undone and corrected counts once", () => {
    const history = historyByKind([
      { domain: "bill", undone: true, corrected: true },
      { domain: "bill", undone: false, corrected: true },
      { domain: "bill", undone: false, corrected: false },
    ]);
    expect(history.get("bill")).toEqual({ added: 3, undone: 1, corrected: 1 });
  });
});

describe("per-kind bar: the Admin's bar stays an override", () => {
  const learned = [{ kind: "grocery_item" as const, percent: 85, added: 40, undone: 0, corrected: 0 }];
  it("an Admin's bar wins", () => {
    expect(effectiveBar({ kind: "grocery_item", adminPercent: 99, learned })).toEqual({ percent: 99, basis: "admin", history: null });
  });
  it("otherwise the kind's learned bar", () => {
    expect(effectiveBar({ kind: "grocery_item", adminPercent: null, learned })).toMatchObject({ percent: 85, basis: "learned" });
  });
  it("a kind with nothing learned is 95%", () => {
    expect(effectiveBar({ kind: "bill", adminPercent: null, learned })).toMatchObject({ percent: 95, basis: "default" });
  });
  it("a stored bar outside the limits is pulled back in", () => {
    expect(effectiveBar({ kind: "bill", adminPercent: null, learned: [{ kind: "bill", percent: 40, added: 100, undone: 0, corrected: 0 }] }).percent).toBe(80);
  });
});
