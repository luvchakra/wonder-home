import { describe, expect, it } from "vitest";

import { companionLines, companionName, type CompanionFacts } from "./companion";

const QUIET: CompanionFacts = {
  unread: 0,
  newestTitle: null,
  missionsLeft: 0,
  streak: 0,
  activeToday: false,
  almostGoal: null,
  starsToNextLevel: 12,
  nextLevel: 2,
  nextFun: null,
  today: "2026-10-20",
};

describe("what the cat says (08-018)", () => {
  it("puts real news first: something new under the bell, then missions, the streak, a goal nearly done, the next fun plan", () => {
    const lines = companionLines({ ...QUIET, unread: 2, newestTitle: "Spelling test on Friday", missionsLeft: 3, streak: 4, almostGoal: "Read 20 minutes", starsToNextLevel: 2, nextFun: { title: "Zoo trip", inDays: 1 } });
    expect(lines.map((line) => line.kind)).toEqual(["news", "mission", "streak", "goal", "level", "fun", "quote", "idea"]);
    expect(lines[0]).toMatchObject({ key: "kids.cat.news", values: { count: 2, title: "Spelling test on Friday" }, href: "/notifications" });
    expect(lines[2]).toMatchObject({ key: "kids.cat.streak.keep", values: { count: 4 } });
    expect(lines[5]).toMatchObject({ key: "kids.cat.fun.tomorrow" });
  });

  it("says hello, then a saying and an idea, when nothing is new — the same ones all day, new ones tomorrow", () => {
    const today = companionLines(QUIET);
    expect(today.map((line) => line.kind)).toEqual(["hello", "quote", "idea"]);
    expect(companionLines(QUIET).map((line) => line.key)).toEqual(today.map((line) => line.key));
    expect(companionLines({ ...QUIET, today: "2026-10-21" })[1]!.key).not.toBe(today[1]!.key);
  });

  it("never invents a number: a streak already kept today is praised only from three days", () => {
    expect(companionLines({ ...QUIET, streak: 2, activeToday: true }).some((line) => line.kind === "streak")).toBe(false);
    expect(companionLines({ ...QUIET, streak: 5, activeToday: true }).find((line) => line.kind === "streak")?.key).toBe("kids.cat.streak.proud");
  });
});

describe("the name a child gives", () => {
  it("is tidied, kept short, and empty means none", () => {
    expect(companionName("  Mishti   the  cat ")).toBe("Mishti the cat");
    expect(companionName("A really very long name for a small cat")!.length).toBeLessThanOrEqual(24);
    expect(companionName("   ")).toBeNull();
  });
});
