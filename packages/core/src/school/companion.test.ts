import { describe, expect, it } from "vitest";

import { CAT_COATS, catCoat, companionLines, companionName, factBand, nextClassToday, type CompanionFacts } from "./companion";

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
  it("deals reminders most useful first, each followed by something fun, so the reminders come back between the facts", () => {
    const lines = companionLines({
      ...QUIET,
      unread: 2,
      newestTitle: "Spelling test on Friday",
      homework: { title: "Maths worksheet", dueToday: true },
      nextClass: { name: "Piano", at: "5:00 pm" },
      missionsLeft: 3,
      duties: ["Feed the fish"],
      streak: 4,
      almostGoal: "Read 20 minutes",
      starsToNextLevel: 2,
      nextFun: { title: "Zoo trip", inDays: 1 },
    });
    const reminders = lines.filter((_, n) => n % 2 === 0).slice(0, 6).map((line) => line.kind);
    expect(reminders).toEqual(["news", "homework", "class", "mission", "duty", "streak"]);
    expect(lines.filter((_, n) => n % 2 === 1).slice(0, 6).every((line) => ["fact", "quote", "idea"].includes(line.kind))).toBe(true);
    expect(lines[0]).toMatchObject({ key: "kids.cat.news", values: { count: 2, title: "Spelling test on Friday" }, href: "/notifications" });
    expect(lines.find((line) => line.kind === "homework")).toMatchObject({ key: "kids.cat.homework.today", values: { title: "Maths worksheet" } });
    expect(lines.find((line) => line.kind === "class")).toMatchObject({ values: { name: "Piano", time: "5:00 pm" } });
    expect(lines.find((line) => line.kind === "fun")).toMatchObject({ key: "kids.cat.fun.tomorrow" });
  });

  it("says hello, then facts, a saying and an idea, when nothing is new — the same ones all day, new ones tomorrow", () => {
    const today = companionLines(QUIET);
    expect(today.map((line) => line.kind)).toEqual(["hello", "fact", "quote", "fact", "idea", "fact", "fact"]);
    expect(companionLines(QUIET).map((line) => line.key)).toEqual(today.map((line) => line.key));
    expect(companionLines({ ...QUIET, today: "2026-10-21" })[1]!.key).not.toBe(today[1]!.key);
  });

  it("picks the facts for the child's age, and never the same fact twice in a day", () => {
    expect(factBand("young_child")).toBe("young");
    expect(factBand("teen")).toBe("teen");
    expect(factBand(null)).toBe("older");
    const young = companionLines({ ...QUIET, ageBand: "young_child" }).filter((line) => line.kind === "fact").map((line) => line.key);
    expect(young.every((key) => key.startsWith("kids.cat.fact.young."))).toBe(true);
    expect(new Set(young).size).toBe(young.length);
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

describe("the cat's colour", () => {
  it("is one of the coats, ginger until picked or when unknown", () => {
    expect(CAT_COATS).toContain("calico");
    expect(catCoat("black")).toBe("black");
    expect(catCoat("purple")).toBe("ginger");
    expect(catCoat(null)).toBe("ginger");
  });
});

describe("the next class today", () => {
  const base = { childMemberId: "c1", today: "2026-10-20", weekday: 2, nowHHMM: "14:00" };
  it("is the soonest activity or school period still to come, for this child only", () => {
    const next = nextClassToday({
      ...base,
      activities: [
        { childMemberId: "c1", name: "Piano", days: [2], startsAt: "17:00:00", startsOn: null, endsOn: null },
        { childMemberId: "c2", name: "Karate", days: [2], startsAt: "15:00", startsOn: null, endsOn: null },
        { childMemberId: "c1", name: "Swimming", days: [3], startsAt: "15:00", startsOn: null, endsOn: null },
      ],
      periods: [
        { childMemberId: "c1", weekday: 2, startsAt: "09:00", subject: "Maths" },
        { childMemberId: "c1", weekday: 2, startsAt: "14:30", subject: "Art" },
      ],
    });
    expect(next).toEqual({ name: "Art", at: "14:30" });
  });
  it("is nothing once the day's classes are over or outside an activity's dates", () => {
    expect(nextClassToday({ ...base, activities: [{ childMemberId: "c1", name: "Piano", days: [2], startsAt: "17:00", startsOn: "2026-11-01", endsOn: null }], periods: [] })).toBeNull();
    expect(nextClassToday({ ...base, nowHHMM: "18:00", activities: [{ childMemberId: "c1", name: "Piano", days: [2], startsAt: "17:00", startsOn: null, endsOn: null }], periods: [] })).toBeNull();
  });
});

describe("the cat's fun lines come from sayings the child has not heard", () => {
  const base = { unread: 0, newestTitle: null, missionsLeft: 1, streak: 0, activeToday: false, almostGoal: null, starsToNextLevel: 20, nextLevel: 2, nextFun: null, today: "2026-10-20" };

  it("deals each unheard saying once, between the reminders, with its id", () => {
    const lines = companionLines({
      ...base,
      sayings: [
        { id: "o-fact-001", kind: "fact", text: "A day on Venus is longer than its year." },
        { id: "o-joke-001", kind: "joke", text: "Why was the maths book sad?" },
      ],
    });
    expect(lines.map((line) => line.kind)).toEqual(["mission", "fact", "joke"]);
    expect(lines.filter((line) => line.sayingId).map((line) => line.sayingId)).toEqual(["o-fact-001", "o-joke-001"]);
    expect(lines.some((line) => line.key.startsWith("kids.cat.fact."))).toBe(false);
  });

  it("keeps to reminders once every saying has been heard, and says hello when there are none", () => {
    expect(companionLines({ ...base, sayings: [] }).map((line) => line.kind)).toEqual(["mission"]);
    expect(companionLines({ ...base, missionsLeft: 0, sayings: [] }).map((line) => line.kind)).toEqual(["hello"]);
  });
});
