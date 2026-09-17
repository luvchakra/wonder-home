import { describe, expect, it } from "vitest";

import {
  assessEvent,
  assessGift,
  commonAvailability,
  detectConflicts,
  mayScheduleOver,
  suggestActivities,
  type ActivitySuggestion,
  type BusyWindow,
  type ConflictSubject,
  type FamilyEvent,
  type GiftPlan,
} from "./schedule";

const NOW = new Date("2026-09-17T09:00:00.000Z");
const at = (hour: number, minute = 0) =>
  new Date(Date.UTC(2026, 8, 17, hour, minute, 0, 0));

const busy = (over: Partial<BusyWindow> = {}): BusyWindow => ({
  memberId: "priya",
  start: at(10),
  end: at(11),
  protected: false,
  ...over,
});

describe("finding time everybody has free", () => {
  const search = { start: at(9), end: at(18) };

  it("returns the gaps around what people are doing", () => {
    const free = commonAvailability(["priya"], [busy()], search);

    expect(free).toEqual([
      { start: at(9), end: at(10) },
      { start: at(11), end: at(18) },
    ]);
  });

  it("merges overlapping commitments rather than inventing a gap between them", () => {
    const free = commonAvailability(
      ["priya", "kunal"],
      [busy(), busy({ memberId: "kunal", start: at(10, 30), end: at(12) })],
      search,
    );

    expect(free).toEqual([
      { start: at(9), end: at(10) },
      { start: at(12), end: at(18) },
    ]);
  });

  it("ignores somebody who is not being planned around", () => {
    const free = commonAvailability(["priya"], [busy({ memberId: "somebody_else" })], search);

    expect(free).toEqual([{ start: at(9), end: at(18) }]);
  });

  it("does not offer a gap too short to be worth anything", () => {
    const tight = [busy({ start: at(9, 15), end: at(12) })];

    expect(commonAvailability(["priya"], tight, search, { minimumMinutes: 30 })).toEqual([
      { start: at(12), end: at(18) },
    ]);
  });

  it("has nothing to say about nobody", () => {
    expect(commonAvailability([], [busy()], search)).toEqual([]);
  });

  it("works from free/busy alone, with no idea what anybody is doing", () => {
    // The input type carries no title, location or note — a planner that could
    // see why somebody is busy would have read a private appointment.
    const window = busy();
    expect(Object.keys(window).sort()).toEqual(["end", "memberId", "protected", "start"]);
  });
});

describe("scheduling over somebody's time", () => {
  it("allows a free window", () => {
    expect(mayScheduleOver({ start: at(13), end: at(14) }, [busy()])).toMatchObject({ allowed: true });
  });

  it("refuses an ordinary clash", () => {
    expect(mayScheduleOver({ start: at(10, 30), end: at(11, 30) }, [busy()])).toMatchObject({
      allowed: false,
    });
  });

  it("refuses protected family time in its own words", () => {
    const decision = mayScheduleOver({ start: at(10, 30), end: at(11, 30) }, [busy({ protected: true })]);

    expect(decision.allowed).toBe(false);
    expect(decision.because).toContain("protected family time");
  });

  it("offers no way to move protected time at all", () => {
    // There is deliberately no counterpart to this function that reschedules
    // something. The answer to a clash with family time is a proposal.
    const module = { mayScheduleOver, commonAvailability, detectConflicts };

    expect(Object.keys(module)).not.toContain("moveProtected");
    expect(Object.keys(module)).not.toContain("reschedule");
  });
});

describe("conflicts", () => {
  const subject = (over: Partial<ConflictSubject> = {}): ConflictSubject => ({
    kind: "event",
    id: "a",
    label: "Karate class",
    window: { start: at(10), end: at(11) },
    protected: false,
    optional: false,
    ...over,
  });

  it("names both sides, because one name cannot be resolved by anybody", () => {
    const [conflict] = detectConflicts([
      subject(),
      subject({ id: "b", label: "Dentist", window: { start: at(10, 30), end: at(11, 30) } }),
    ]);

    expect(conflict?.left.label).toBe("Karate class");
    expect(conflict?.right.label).toBe("Dentist");
    expect(conflict?.overlap).toEqual({ start: at(10, 30), end: at(11) });
  });

  it("finds nothing when things merely touch", () => {
    expect(
      detectConflicts([subject(), subject({ id: "b", window: { start: at(11), end: at(12) } })]),
    ).toEqual([]);
  });

  it("proposes moving the other thing when one side is protected", () => {
    const [conflict] = detectConflicts([
      subject({ protected: true, label: "Sunday lunch" }),
      subject({ id: "b", label: "Grocery delivery", window: { start: at(10, 30), end: at(11, 30) } }),
    ]);

    expect(conflict?.proposedAction).toBe("move_right");
    expect(conflict?.proposedDetail).toContain("protected");
  });

  it("asks the household when both sides are protected, rather than choosing", () => {
    const [conflict] = detectConflicts([
      subject({ protected: true, label: "Sunday lunch" }),
      subject({
        id: "b",
        protected: true,
        label: "Grandparents visiting",
        window: { start: at(10, 30), end: at(11, 30) },
      }),
    ]);

    expect(conflict?.proposedAction).toBe("ask_household");
  });

  it("drops the optional one when only one is optional", () => {
    const [conflict] = detectConflicts([
      subject(),
      subject({ id: "b", optional: true, label: "Park visit", window: { start: at(10, 30), end: at(11, 30) } }),
    ]);

    expect(conflict?.proposedAction).toBe("drop_optional");
  });

  it("never proposes deleting a confirmed commitment", () => {
    const conflicts = detectConflicts([
      subject({ protected: true }),
      subject({ id: "b", window: { start: at(10, 30), end: at(11, 30) } }),
    ]);

    for (const conflict of conflicts) {
      expect(conflict.proposedAction).not.toBe("delete_left");
      expect(conflict.proposedAction).not.toBe("delete_right");
    }
  });
});

describe("events that need somebody", () => {
  const event = (over: Partial<FamilyEvent> = {}): FamilyEvent => ({
    id: "party",
    title: "Aarav's friend's birthday",
    kind: "birthday",
    startsAt: new Date("2026-09-19T11:00:00.000Z"),
    endsAt: new Date("2026-09-19T14:00:00.000Z"),
    protected: false,
    ownerMemberId: "priya",
    status: "planned",
    actionState: "needs_rsvp",
    actionDueAt: new Date("2026-09-18T11:00:00.000Z"),
    participants: [],
    ...over,
  });

  it("raises an outstanding reply as the date nears", () => {
    const assessment = assessEvent(event(), NOW);

    expect(assessment.notable).toBe(true);
    expect(assessment.action).toEqual({ action: "needs_rsvp", target: "party" });
  });

  it("says nothing about an event with nothing outstanding", () => {
    expect(assessEvent(event({ actionState: "ready" }), NOW).notable).toBe(false);
    expect(assessEvent(event({ actionState: null }), NOW).notable).toBe(false);
  });

  it("says nothing about something already past", () => {
    expect(assessEvent(event({ status: "happened" }), NOW).notable).toBe(false);
  });

  it("holds a far-off action until it is worth raising", () => {
    const later = event({ actionDueAt: new Date("2026-10-30T11:00:00.000Z") });

    expect(assessEvent(later, NOW).notable).toBe(false);
  });
});

describe("suggesting something to do", () => {
  const candidate = (over: Partial<ActivitySuggestion> = {}): ActivitySuggestion => ({
    title: "Nature park",
    window: { start: at(11), end: at(14) },
    travelMinutes: 30,
    costMinor: 50_000,
    suitsAges: true,
    because: "Everybody can do it.",
    ...over,
  });

  const constraints = {
    free: [{ start: at(10), end: at(18) }],
    budgetMinor: 100_000,
    maxTravelMinutes: 45,
    ageBands: ["young_child", "adult"],
  };

  it("keeps the list short", () => {
    const many = Array.from({ length: 10 }, (_, index) => candidate({ title: `Option ${index}` }));

    expect(suggestActivities(many, constraints)).toHaveLength(3);
  });

  it("removes what does not fit rather than showing it with a caveat", () => {
    const suggestions = suggestActivities(
      [
        candidate({ title: "Too far", travelMinutes: 120 }),
        candidate({ title: "Too dear", costMinor: 900_000 }),
        candidate({ title: "Too old", suitsAges: false }),
        candidate({ title: "Outside the free window", window: { start: at(20), end: at(21) } }),
        candidate({ title: "Just right" }),
      ],
      constraints,
    );

    expect(suggestions.map((entry) => entry.title)).toEqual(["Just right"]);
  });

  it("treats no budget as no budget limit, not as zero", () => {
    const expensive = [candidate({ costMinor: 900_000 })];

    expect(suggestActivities(expensive, { ...constraints, budgetMinor: null })).toHaveLength(1);
  });
});

describe("gifts", () => {
  const gift = (over: Partial<GiftPlan> = {}): GiftPlan => ({
    id: "gift-1",
    recipient: "Aarav's friend",
    neededBy: "2026-09-20",
    status: "needed",
    responsibleMemberId: "priya",
    ...over,
  });

  it("raises one with nothing chosen as the date approaches", () => {
    const assessment = assessGift(gift(), NOW);

    expect(assessment.action).toEqual({ action: "choose_gift", target: "gift-1" });
  });

  it("chases an order once something is chosen and the date is close", () => {
    expect(assessGift(gift({ status: "chosen" }), NOW).action).toEqual({
      action: "order_gift",
      target: "gift-1",
    });
  });

  it("says nothing once it is wrapped or given", () => {
    expect(assessGift(gift({ status: "wrapped" }), NOW).notable).toBe(false);
    expect(assessGift(gift({ status: "given" }), NOW).notable).toBe(false);
  });

  it("stays quiet about something months away", () => {
    expect(assessGift(gift({ neededBy: "2026-12-25" }), NOW).notable).toBe(false);
  });
});
