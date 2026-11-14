import { describe, expect, it } from "vitest";

import { consequenceOf, deadlinesFor, defaultDue, isOfferedAnswer, oldestAgeHours, rankNeedsYou, SHOWN_AT_ONCE } from "./needs-you";

describe("Needs you deadlines (decision 4)", () => {
  it("applies the default 24 hours after asking and closes at 48", () => {
    const asked = new Date("2026-11-14T10:00:00Z");
    expect(deadlinesFor(asked)).toEqual({ defaultAt: "2026-11-15T10:00:00.000Z", expiresAt: "2026-11-16T10:00:00.000Z" });
  });

  it("is due once the default's time has come, not before", () => {
    const item = { defaultAt: "2026-11-15T10:00:00.000Z" };
    expect(defaultDue(item, new Date("2026-11-15T09:59:00Z"))).toBe(false);
    expect(defaultDue(item, new Date("2026-11-15T10:00:00Z"))).toBe(true);
  });

  it("takes only an answer the question offered, or its default", () => {
    const item = { answers: [{ value: "looks_right" }, { value: "not_right" }], defaultAnswer: "keep_checking" };
    expect(isOfferedAnswer(item, "looks_right")).toBe(true);
    expect(isOfferedAnswer(item, "keep_checking")).toBe(true);
    expect(isOfferedAnswer(item, "pay_now")).toBe(false);
  });
});

describe("ranking", () => {
  const today = "2026-11-14";

  it("puts money due soon first, then school deadlines, then dated things", () => {
    expect(consequenceOf("bill", "2026-11-16", today)).toBe(3);
    expect(consequenceOf("bill", "2026-12-30", today)).toBe(1);
    expect(consequenceOf("school_item", "2026-11-18", today)).toBe(2);
    expect(consequenceOf("event", "2026-12-30", today)).toBe(1);
    expect(consequenceOf("grocery_item", null, today)).toBe(0);
  });

  it("shows at most three, most consequential first, then the earlier day, then the oldest", () => {
    const items = [
      { id: "a", consequence: 0 as const, dueOn: null, createdAt: "2026-11-01T00:00:00Z" },
      { id: "b", consequence: 2 as const, dueOn: "2026-11-18", createdAt: "2026-11-13T00:00:00Z" },
      { id: "c", consequence: 3 as const, dueOn: "2026-11-16", createdAt: "2026-11-14T00:00:00Z" },
      { id: "d", consequence: 2 as const, dueOn: "2026-11-17", createdAt: "2026-11-14T00:00:00Z" },
      { id: "e", consequence: 1 as const, dueOn: null, createdAt: "2026-11-02T00:00:00Z" },
    ];
    const ranked = rankNeedsYou(items);
    expect(ranked.total).toBe(5);
    expect(ranked.shown.map((item) => item.id)).toEqual(["c", "d", "b"]);
    expect(ranked.shown).toHaveLength(SHOWN_AT_ONCE);
  });

  it("says how old the oldest open question is, in hours", () => {
    const now = new Date("2026-11-14T12:00:00Z");
    expect(oldestAgeHours([], now)).toBeNull();
    expect(oldestAgeHours([{ createdAt: "2026-11-13T12:00:00Z" }, { createdAt: "2026-11-14T11:00:00Z" }], now)).toBe(24);
  });
});
