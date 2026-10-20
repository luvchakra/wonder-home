import { describe, expect, it } from "vitest";

import { childProgress, goalStandings, goalStarts, streakOf, type ChildGoal } from "./goals";

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

describe("a goal set from school work (the owner, 2026-10-20)", () => {
  it("is met, with its stars, the day that work is marked done, with no check-in of its own", () => {
    const goal = { id: "g-maths", childMemberId: "c1", title: "Finish the maths worksheet", kind: "learning", emoji: "📚", period: "once" as const, target: 1, stars: 3, reward: "Ice cream", endsOn: null, source: { kind: "school_item" as const, id: "item-1" } };
    const before = childProgress({ goals: [goal], activeGoalIds: new Set(["g-maths"]), checkIns: [], schoolDoneOn: [], schoolDone: [], today: "2026-10-20" });
    expect(before.goals[0]).toMatchObject({ met: false, done: 0 });
    const after = childProgress({ goals: [goal], activeGoalIds: new Set(["g-maths"]), checkIns: [], schoolDoneOn: ["2026-10-20"], schoolDone: [{ id: "item-1", onDay: "2026-10-20" }], today: "2026-10-20" });
    expect(after.goals[0]).toMatchObject({ met: true, done: 1 });
    expect(after.stars).toBe(4);
    expect(after.fromGoals).toBe(3);
  });
});

describe("goalStarts", () => {
  it("offers each class as a weekly goal, as often as it meets, and open school work as a one-off", () => {
    const starts = goalStarts({
      activities: [
        { id: "piano", name: "Piano", kind: "music", days: [2, 4] },
        { id: "chess", name: "Chess club", kind: "unknown", days: [] },
      ],
      work: [
        { id: "maths", title: "Maths worksheet", kind: "homework", status: "pending", dueOn: "2026-10-22" },
        { id: "trip", title: "Field trip", kind: "event", status: "pending", dueOn: "2026-10-23" },
        { id: "old", title: "Spelling", kind: "homework", status: "done", dueOn: "2026-10-01" },
      ],
    });
    expect(starts).toEqual([
      { source: { kind: "activity", id: "piano" }, name: "Piano", goalKind: "practice", emoji: "🎹", period: "week", target: 2, endsOn: null },
      { source: { kind: "activity", id: "chess" }, name: "Chess club", goalKind: "practice", emoji: "⭐", period: "week", target: 1, endsOn: null },
      { source: { kind: "school_item", id: "maths" }, name: "Maths worksheet", goalKind: "learning", emoji: "📚", period: "once", target: 1, endsOn: "2026-10-22" },
    ]);
  });
});

describe("a child's own Done waits for a grown-up", () => {
  it("earns nothing and shows as waiting until it is verified", () => {
    const waiting = childProgress({
      goals: [goal({ reward: "Ice cream" })],
      activeGoalIds: new Set(["read"]),
      checkIns: [{ goalId: "read", onDay: today, verified: false }],
      schoolDoneOn: [],
      today,
    });
    expect(waiting.stars).toBe(0);
    expect(waiting.streak).toBe(0);
    expect(waiting.goals[0]).toMatchObject({ done: 0, doneToday: false, waitingToday: true, met: false });

    const verified = childProgress({
      goals: [goal({ reward: "Ice cream" })],
      activeGoalIds: new Set(["read"]),
      checkIns: [{ goalId: "read", onDay: today, verified: true }],
      schoolDoneOn: [],
      today,
    });
    expect(verified.stars).toBe(2);
    expect(verified.goals[0]).toMatchObject({ done: 1, doneToday: true, waitingToday: false, met: true });
  });

  it("counts a row with no verification field, as before verification existed", () => {
    expect(goalStandings([goal()], [{ goalId: "read", onDay: today }], today)[0]).toMatchObject({ doneToday: true, waitingToday: false });
  });
});
