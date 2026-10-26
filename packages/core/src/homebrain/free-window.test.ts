import { describe, expect, it } from "vitest";

import { DEFAULT_DATA_USE } from "../ai/privacy";
import { buildContextItems } from "../context/builders";
import type { HouseholdContextItem } from "../context/types";
import { resolveRuleIntent } from "../conversation/rules";
import { contextItemsFor, GOLDEN_HOUSEHOLDS, memberOf, peopleOf, viewerFor } from "../evaluation/households";
import { longWeekendLines } from "./answer";
import { householdInsights, LONG_WEEKENDS_LEAD, tripQuestion } from "./insights";
import { answerWithHomeBrain } from "./turn";

/**
 * "What's the best time for a 2-day getaway?" (live finding, 2026-10-19): it
 * was read as "how is the home doing?" and answered with the attention
 * summary, because nothing worked out when the family was free. The free
 * weekends are arithmetic over the calendar, so a rule works them out.
 */

const TZ = "Asia/Kolkata";

function item(id: string, attributes: Record<string, unknown>, overrides: Partial<HouseholdContextItem> = {}): HouseholdContextItem {
  const [entityType, entityId] = id.split(":") as [string, string];
  return {
    id, householdId: "h", domain: "calendar", entityType, entityId, subjectMemberIds: [], summary: "", need: "", attributes,
    source: { type: "test", sourceId: entityId, capturedAt: null }, evidence: [], confidence: 1, confirmed: true, privacyClass: "general",
    validFrom: null, validUntil: null, freshnessAt: "2026-10-19T00:00:00Z", freshness: "current", tier: 2, aliases: [], relatedEntityIds: [],
    ...overrides,
  } as HouseholdContextItem;
}

const asmi = item("member:asmi", { displayName: "Asmi Mehta", memberType: "child" }, { domain: "people" });
const party = item("event:diwali", { title: "Diwali party", date: "2026-10-31", startsAt: "2026-10-31T13:30:00Z", endsAt: "2026-10-31T17:30:00Z", status: "confirmed" });
const maths = item("exam_paper:p1", { title: "Maths Unit test", kind: "exam", subject: "Maths", examType: "Unit test", date: "2026-10-26", childMemberId: "asmi" }, { domain: "school", privacyClass: "child", subjectMemberIds: ["asmi"] });

describe("when to go away", () => {
  it("reads the question: when, for how many days", () => {
    expect(tripQuestion("what best time for 2 day getaway")).toEqual({ days: 2, noun: "getaway", daysSaid: true });
    expect(tripQuestion("Which weekend are we free for a trip?")).toEqual({ days: 2, noun: "trip", daysSaid: false });
    expect(tripQuestion("when can we take a three-day vacation")).toEqual({ days: 3, noun: "vacation", daysSaid: true });
    expect(tripQuestion("suggest a 2 day getaway")).toBeNull();
    expect(tripQuestion("When is the next holiday?")).toBeNull();
    expect(tripQuestion("when is the diwali holiday")).toBeNull();
    expect(tripQuestion("when can we go for a 3 day holiday")).toEqual({ days: 3, noun: "holiday", daysSaid: true });
    expect(tripQuestion("what is happening this weekend")).toBeNull();
  });

  it("reads \"which are the next long weekends\" as a question about the long weekends themselves", () => {
    for (const question of ["which are the next long weekends coming up", "any long weekends coming up?", "upcoming long weekend", "show me the long weekends this year"]) {
      expect(tripQuestion(question)).toEqual({ days: 3, noun: "long weekend", daysSaid: false });
    }
    expect(tripQuestion("what is a long weekend")).toBeNull();
  });

  it("answers it with only the long weekends, or says there are none", () => {
    const holiday = (id: string, title: string, date: string) => item(`holiday:${id}`, { title, date });
    const holidays = [holiday("dussehra", "Dussehra", "2026-10-20"), holiday("christmas", "Christmas Day", "2026-12-25")];
    const only = householdInsights(holidays, { timezone: TZ, today: "2026-10-19", question: "which are the next long weekends coming up" }).filter((entry) => entry.rule === "free_window");
    expect(only).toHaveLength(1);
    expect(only[0]!.statement).toBe("Long weekends from public holidays, with nothing on the family calendar: Fri 25 Dec to Sun 27 Dec (Christmas Day, Fri 25 Dec).");
    const none = householdInsights([], { timezone: TZ, today: "2026-10-19", question: "which are the next long weekends coming up" }).filter((entry) => entry.rule === "free_window");
    expect(none.map((entry) => entry.statement)).toEqual(["No public holiday in the next six months makes a long weekend with nothing else on the family calendar."]);
  });

  it("names the free weekends, and says what is on the others — an exam the day after included", () => {
    const insights = householdInsights([asmi, party, maths], { timezone: TZ, today: "2026-10-19", question: "what best time for 2 day getaway" }).filter((entry) => entry.rule === "free_window");
    expect(insights[0]!.statement).toBe("For a 2-day getaway, nothing is on the family calendar on Sat 7 Nov to Sun 8 Nov, Sat 14 Nov to Sun 15 Nov or Sat 21 Nov to Sun 22 Nov, or 3 later weekends (the next 8 weekends checked).");
    expect(insights.slice(1).map((entry) => entry.statement)).toEqual([
      "Sat 24 Oct to Sun 25 Oct is less free: Asmi's Maths paper of the Unit test the day after (Mon 26 Oct).",
      "Sat 31 Oct to Sun 1 Nov is less free: Diwali party (Sat 31 Oct).",
    ]);
    expect(insights[1]).toMatchObject({ evidence: ["exam_paper:p1"], privacyClass: "child" });
  });

  it("keeps an all-day Friday on Friday, and a weekend away on every day it lasts", () => {
    const birthday = item("event:bday", { title: "Kunal's birthday", date: "2026-10-23", startsAt: "2026-10-22T18:30:00Z", endsAt: "2026-10-23T18:30:00Z", status: "confirmed" });
    const camp = item("event:camp", { title: "Scout camp", date: "2026-11-06", startsAt: "2026-11-06T03:30:00Z", endsAt: "2026-11-08T12:30:00Z", status: "confirmed" });
    const [summary, ...others] = householdInsights([birthday, camp], { timezone: TZ, today: "2026-10-19", question: "which weekend is free for a trip" }).filter((entry) => entry.rule === "free_window");
    expect(summary!.statement).toContain("Sat 24 Oct to Sun 25 Oct");
    expect(others.map((entry) => entry.statement)).toEqual(["Sat 7 Nov to Sun 8 Nov is less free: Scout camp (Fri 6 Nov)."]);
  });

  it("names the long weekends public holidays make, and leaves out one with something on", () => {
    const holiday = (id: string, title: string, date: string) => item(`holiday:${id}`, { title, date });
    const items = [
      holiday("dussehra", "Dussehra", "2026-10-20"), // a Tuesday, but its long weekend began on Saturday
      holiday("diwali", "Diwali", "2026-11-08"), // a Sunday: no extra day
      holiday("gurpurab", "Guru Nanak's Birthday", "2026-11-24"), // a Tuesday: take Monday off
      holiday("xmas", "Christmas Day", "2026-12-25"), // a Friday
      holiday("rday", "Republic Day", "2027-01-26"), // a Tuesday, but the family is busy that Saturday
      item("event:wedding", { title: "Cousin's wedding", date: "2027-01-23", startsAt: "2027-01-23T12:30:00Z", endsAt: "2027-01-23T17:30:00Z", status: "confirmed" }),
      holiday("holi", "Holi", "2027-05-01"), // past the six months
    ];
    const trip = householdInsights(items, { timezone: TZ, today: "2026-10-19", question: "what best time for 2 day getaway" }).filter((entry) => entry.rule === "free_window");
    expect(trip[0]).toMatchObject({
      statement: "Long weekends from public holidays, with nothing on the family calendar: Sat 21 Nov to Tue 24 Nov if Mon 23 Nov is taken off (Guru Nanak's Birthday, Tue 24 Nov); Fri 25 Dec to Sun 27 Dec (Christmas Day, Fri 25 Dec).",
      evidence: ["holiday:gurpurab", "holiday:xmas"],
      privacyClass: "general",
    });
    expect(trip[1]!.statement).toMatch(/^For a 2-day getaway, nothing is on the family calendar on Sat 24 Oct/);
  });

  it("says each long weekend on its own line, the dates first (the owner, 2026-10-26)", () => {
    const statement = `${LONG_WEEKENDS_LEAD} Sat 21 Nov to Tue 24 Nov if Mon 23 Nov is taken off (Guru Nanak's Birthday, Tue 24 Nov); Fri 25 Dec to Sun 27 Dec (Christmas Day, Fri 25 Dec).`;
    expect(longWeekendLines(statement)).toEqual([
      "- **Sat 21 Nov to Tue 24 Nov** — Guru Nanak's Birthday (Tue 24 Nov), if Mon 23 Nov is taken off",
      "- **Fri 25 Dec to Sun 27 Dec** — Christmas Day (Fri 25 Dec)",
    ]);
  });

  it("is not drawn for any other question", () => {
    expect(householdInsights([asmi, party, maths], { timezone: TZ, today: "2026-10-19", question: "What is on this weekend?" }).some((entry) => entry.rule === "free_window")).toBe(false);
  });
});

describe("public holidays in the household's context", () => {
  it("are calendar items anyone may see, and a passed one is history", () => {
    const items = buildContextItems(
      { holidays: [{ id: "x", onDate: "2026-12-25", name: "Christmas Day", source: "test" }, { id: "y", onDate: "2026-10-02", name: "Gandhi Jayanti", source: "test" }] },
      { householdId: "h", householdName: "Home", timezone: TZ, now: new Date("2026-10-19T06:00:00Z"), viewerMemberId: "kunal" },
    ).filter((entry) => entry.entityType === "holiday");
    expect(items.map((entry) => [entry.summary, entry.domain, entry.privacyClass, entry.freshness, entry.attributes.date])).toEqual([
      [expect.stringMatching(/^Christmas Day is a public holiday on /), "calendar", "general", "current", "2026-12-25"],
      [expect.stringMatching(/^Gandhi Jayanti was a public holiday on /), "calendar", "general", "historical", "2026-10-02"],
    ]);
  });
});

describe("the live question, end to end", () => {
  it("is answered with the free weekends, not the attention summary", async () => {
    const A = GOLDEN_HOUSEHOLDS.A;
    const household = A;
    const kunal = memberOf(household, "a-kunal");
    const question = "what best time for 2 day getaway";
    expect(resolveRuleIntent(question, { actorMemberId: kunal.id, channel: "text" }).action).toBe("ask_status");
    expect(resolveRuleIntent("Which weekend is free for a trip?", { actorMemberId: kunal.id, channel: "text" }).action).toBe("ask_status");
    expect(resolveRuleIntent("Suggest a 2 day getaway", { actorMemberId: kunal.id, channel: "text" }).action).toBe("find_places");
    const answer = await answerWithHomeBrain({
      question, sentQuestion: question, previousQuestion: null, sentHistory: [],
      items: contextItemsFor(household, kunal.id), viewer: { memberId: kunal.id, roleLabel: "Adult", guardianOf: viewerFor(household, kunal.id).guardianOf },
      timezone: household.timezone, now: household.now, policy: DEFAULT_DATA_USE, people: peopleOf(household), compose: null, factBudget: 12,
    });
    expect(answer.text).toMatch(/For a 2-day getaway, nothing is on the family calendar on Sat/);
    expect(answer.text).not.toMatch(/checked \d+ things/);
  });
});
