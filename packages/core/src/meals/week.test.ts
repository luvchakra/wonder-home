import { describe, expect, it } from "vitest";

import { copyLastWeek, weekCount, weekDays, weekFrom, weekStartOf } from "./week";

describe("the meal week", () => {
  it("runs Monday to Sunday, from any day in it", () => {
    expect(weekStartOf("2026-10-20")).toBe("2026-10-19");
    expect(weekStartOf("2026-10-25")).toBe("2026-10-19");
    expect(weekStartOf("2026-10-19")).toBe("2026-10-19");
    expect(weekFrom("2026-10-28", "2026-10-20")).toBe("2026-10-26");
    expect(weekFrom("not a day", "2026-10-20")).toBe("2026-10-19");
    expect(weekFrom(undefined, "2026-10-20")).toBe("2026-10-19");
    expect(weekDays("2026-10-19")).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
  });

  it("counts the everyday slots still to come, and a past day only for what was planned", () => {
    const days = weekDays("2026-10-19");
    const meals = [
      { onDate: "2026-10-19", slot: "dinner" as const },
      { onDate: "2026-10-20", slot: "lunch" as const },
      { onDate: "2026-10-21", slot: "snack" as const },
    ];
    // Monday is past: one planned slot counts. Tuesday to Sunday: 18 slots, 1 planned.
    expect(weekCount(days, meals, "2026-10-20")).toEqual({ planned: 2, total: 19 });
  });

  it("repeats last week into empty slots only, never into the past", () => {
    const at = (iso: string) => new Date(`${iso}T14:30:00Z`);
    const from = [
      { id: "a", name: "Poha", slot: "breakfast" as const, onDate: "2026-10-12", readyBy: at("2026-10-12"), cookMemberId: null, recipeId: null },
      { id: "b", name: "Dal rice", slot: "dinner" as const, onDate: "2026-10-14", readyBy: at("2026-10-14"), cookMemberId: "cook", recipeId: "r1" },
      { id: "c", name: "Rajma", slot: "dinner" as const, onDate: "2026-10-15", readyBy: at("2026-10-15"), cookMemberId: null, recipeId: null },
    ];
    const copies = copyLastWeek({ from, taken: [{ onDate: "2026-10-22", slot: "dinner" }], today: "2026-10-20" });
    expect(copies.map((copy) => [copy.name, copy.onDate, copy.slot])).toEqual([["Dal rice", "2026-10-21", "dinner"]]);
    expect(copies[0]!.readyBy.toISOString()).toBe("2026-10-21T14:30:00.000Z");
    expect(copies[0]!.sourceId).toBe("b");
  });
});
