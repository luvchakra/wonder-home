import { describe, expect, it } from "vitest";

import { childProgress, goalStandings, streakOf, type ChildGoal } from "./goals";

const goal = (over: Partial<ChildGoal> = {}): ChildGoal => ({
  id: "read",
  childMemberId: "kid",
  title: "Read for 20 minutes",
  kind: "reading",
  emoji: "📚",
  period: "day",
  target: 1,
  stars: 2,
  reward: null,
  endsOn: null,
  ...over,
});

// 2026-10-20 is a Tuesday; the week (Monday first) is 19–25 October.
const today = "2026-10-20";

describe("a child's stars are counted from what they did", () => {
  it("adds each check-in's stars and one for each piece of school work done", () => {
    const progress = childProgress({
      goals: [goal(), goal({ id: "piano", stars: 1, period: "week", target: 3 })],
      activeGoalIds: new Set(["read", "piano"]),
      checkIns: [
        { goalId: "read", onDay: "2026-10-18" },
        { goalId: "read", onDay: "2026-10-19" },
        { goalId: "piano", onDay: "2026-10-19" },
      ],
      schoolDoneOn: ["2026-10-20"],
      today,
    });
    expect(progress).toMatchObject({ stars: 6, fromGoals: 5, fromSchool: 1, level: 1, levelKey: "starter", intoLevel: 6, streak: 3 });
    expect(progress.badges.find((badge) => badge.key === "streak_3")?.earned).toBe(true);
    expect(progress.badges.find((badge) => badge.key === "goal_met")?.earned).toBe(true);
  });

  it("keeps the stars a retired goal earned, but no longer offers it", () => {
    const progress = childProgress({
      goals: [goal({ id: "old", stars: 5 })],
      activeGoalIds: new Set(),
      checkIns: Array.from({ length: 5 }, (_, index) => ({ goalId: "old", onDay: `2026-10-0${index + 1}` })),
      schoolDoneOn: [],
      today,
    });
    expect(progress).toMatchObject({ stars: 25, level: 2, levelKey: "explorer", intoLevel: 5, streak: 0 });
    expect(progress.goals).toEqual([]);
  });
});

describe("where a goal stands", () => {
  it("counts a weekly goal's days in this week only", () => {
    const [standing] = goalStandings(
      [goal({ period: "week", target: 3 })],
      [
        { goalId: "read", onDay: "2026-10-17" },
        { goalId: "read", onDay: "2026-10-19" },
        { goalId: "read", onDay: "2026-10-20" },
      ],
      today,
    );
    expect(standing).toMatchObject({ done: 2, needed: 3, doneToday: true, met: false });
  });

  it("is met for the day once checked in, and a goal past its end is not offered", () => {
    const standings = goalStandings([goal(), goal({ id: "done", endsOn: "2026-10-19" })], [{ goalId: "read", onDay: today }], today);
    expect(standings).toHaveLength(1);
    expect(standings[0]).toMatchObject({ done: 1, needed: 1, met: true });
  });
});

describe("the streak", () => {
  it("runs to yesterday while today is still open, and breaks on a missed day", () => {
    expect(streakOf(["2026-10-19", "2026-10-18"], today)).toBe(2);
    expect(streakOf(["2026-10-20", "2026-10-18"], today)).toBe(1);
    expect(streakOf([], today)).toBe(0);
  });
});
