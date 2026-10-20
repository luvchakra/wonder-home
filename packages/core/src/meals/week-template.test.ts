import { describe, expect, it } from "vitest";

import { daysOf, nextOption, pickFor, proposeWeek, weekdayOf, weekNumber, type TemplateOption } from "./week-template";

const option = (id: string, weekday: TemplateOption["weekday"], slot: TemplateOption["slot"], recipeId: string, position = 0): TemplateOption => ({ id, weekday, slot, recipeId, name: recipeId, position });

// 2026-10-19 is a Monday.
const WEEK = "2026-10-19";
const breakfasts = [option("a", 1, "breakfast", "poha", 0), option("b", 1, "breakfast", "upma", 1), option("c", 1, "breakfast", "idli", 2)];

describe("week template", () => {
  it("reads weekdays and turns the rotation once a week", () => {
    expect(weekdayOf("2026-10-19")).toBe(1);
    expect(weekdayOf("2026-10-25")).toBe(7);
    expect(weekNumber("2026-10-26") - weekNumber(WEEK)).toBe(1);
  });

  it("rotates through a slot's options week by week", () => {
    const picks = [0, 7, 14, 21].map((days) => {
      const start = new Date(Date.parse(`${WEEK}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
      return pickFor({ options: breakfasts, weekday: 1, slot: "breakfast", weekStart: start })!.recipeId;
    });
    expect(new Set(picks.slice(0, 3)).size).toBe(3);
    expect(picks[3]).toBe(picks[0]);
  });

  it("never repeats last week's dish when there is another, and keeps the only one", () => {
    const turn = pickFor({ options: breakfasts, weekday: 1, slot: "breakfast", weekStart: WEEK })!;
    const stepped = pickFor({ options: breakfasts, weekday: 1, slot: "breakfast", weekStart: WEEK, lastWeek: turn.recipeId })!;
    expect(stepped.recipeId).not.toBe(turn.recipeId);
    const only = [option("x", 1, "lunch", "rajma")];
    expect(pickFor({ options: only, weekday: 1, slot: "lunch", weekStart: WEEK, lastWeek: "rajma" })!.recipeId).toBe("rajma");
  });

  it("never picks a dish the household rules out", () => {
    const blocked = new Set(["poha", "upma"]);
    expect(pickFor({ options: breakfasts, weekday: 1, slot: "breakfast", weekStart: WEEK, blocked })!.recipeId).toBe("idli");
    expect(pickFor({ options: breakfasts, weekday: 1, slot: "breakfast", weekStart: WEEK, blocked: new Set(["poha", "upma", "idli"]) })).toBeNull();
  });

  it("plans only empty slots on days not past, and nothing without options", () => {
    const options = [...breakfasts, option("d", 1, "dinner", "dal"), option("e", 3, "lunch", "rajma"), option("f", 7, "dinner", "biryani")];
    const picks = proposeWeek({
      weekStart: WEEK,
      options,
      taken: [{ onDate: "2026-10-21", slot: "lunch" }],
      lastWeek: [],
      today: "2026-10-20",
    });
    // Monday is past; Wednesday's lunch is planned already; Sunday's dinner is free.
    expect(picks.map((pick) => `${pick.onDate}:${pick.slot}:${pick.recipeId}`)).toEqual(["2026-10-25:dinner:biryani"]);
  });

  it("steps past last week's dish in the same day and slot", () => {
    const options = [option("p", 2, "dinner", "dal"), option("q", 2, "dinner", "paneer", 1)];
    const free = proposeWeek({ weekStart: WEEK, options, taken: [], lastWeek: [], today: WEEK });
    const last = free[0]!.recipeId;
    const again = proposeWeek({ weekStart: WEEK, options, taken: [], lastWeek: [{ onDate: "2026-10-13", slot: "dinner", recipeId: last }], today: WEEK });
    expect(again[0]!.recipeId).not.toBe(last);
  });

  it("chooses again from the slot's other options, in order", () => {
    expect(nextOption({ options: breakfasts, weekday: 1, slot: "breakfast", current: "poha" })!.recipeId).toBe("upma");
    expect(nextOption({ options: breakfasts, weekday: 1, slot: "breakfast", current: "idli" })!.recipeId).toBe("poha");
    expect(nextOption({ options: breakfasts, weekday: 1, slot: "breakfast", current: "dosa" })!.recipeId).toBe("poha");
    expect(nextOption({ options: [option("x", 1, "lunch", "rajma")], weekday: 1, slot: "lunch", current: "rajma" })).toBeNull();
  });

  it("adds to one day, every day, weekdays or the weekend", () => {
    expect(daysOf(3)).toEqual([3]);
    expect(daysOf("every")).toHaveLength(7);
    expect(daysOf("weekdays")).toEqual([1, 2, 3, 4, 5]);
    expect(daysOf("weekend")).toEqual([6, 7]);
  });
});
