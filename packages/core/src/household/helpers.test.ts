import { describe, expect, it } from "vitest";

import {
  assessAbsence,
  buildDailySummary,
  handleHelperException,
  helperMaySee,
  helperNeedsToRespond,
  isExpectedOn,
  type HelperException,
  type HelperExceptionHandling,
  type HelperResponsibility,
} from "./helpers";

const weekdayMornings = [1, 2, 3, 4, 5].map((dayOfWeek) => ({
  dayOfWeek,
  startTime: "08:30",
  endTime: "12:30",
}));

const responsibility = (over: Partial<HelperResponsibility> = {}): HelperResponsibility => ({
  outcomeKey: "home.cleaned",
  backupMemberId: null,
  priority: 3,
  ...over,
});

describe("when someone is expected", () => {
  it("follows the weekly pattern", () => {
    // 2026-09-17 is a Thursday; 2026-09-19 a Saturday.
    expect(isExpectedOn(new Date("2026-09-17T09:00:00Z"), weekdayMornings, [])).toBe(true);
    expect(isExpectedOn(new Date("2026-09-19T09:00:00Z"), weekdayMornings, [])).toBe(false);
  });

  it("lets one day differ without rewriting the pattern", () => {
    const exceptions = [{ onDate: "2026-09-18", available: false, reason: "Family event" }];

    expect(isExpectedOn(new Date("2026-09-18T09:00:00Z"), weekdayMornings, exceptions)).toBe(false);
    // The following Friday is unaffected: the pattern is still the pattern.
    expect(isExpectedOn(new Date("2026-09-25T09:00:00Z"), weekdayMornings, exceptions)).toBe(true);
  });

  it("handles an extra day just as well as a missing one", () => {
    const exceptions = [{ onDate: "2026-09-19", available: true }];
    expect(isExpectedOn(new Date("2026-09-19T09:00:00Z"), weekdayMornings, exceptions)).toBe(true);
  });
});

describe("what an absence means", () => {
  it("is not news when everything is covered", () => {
    const impact = assessAbsence({
      date: "2026-09-18",
      responsibilities: [
        responsibility({ outcomeKey: "home.cleaned", backupMemberId: "m-2" }),
        responsibility({ outcomeKey: "laundry.ready", backupMemberId: "m-2" }),
      ],
      scheduledOutcomeKeys: ["home.cleaned", "laundry.ready"],
    });

    // The household does not need to be told that a system it trusts coped.
    expect(impact.notable).toBe(false);
    expect(impact.summary).toMatch(/all covered/i);
  });

  it("surfaces what nobody is covering", () => {
    const impact = assessAbsence({
      date: "2026-09-18",
      responsibilities: [
        responsibility({ outcomeKey: "home.cleaned", backupMemberId: "m-2" }),
        responsibility({ outcomeKey: "kitchen.prepared" }),
      ],
      scheduledOutcomeKeys: ["home.cleaned", "kitchen.prepared"],
    });

    expect(impact.notable).toBe(true);
    expect(impact.uncovered.map((r) => r.outcomeKey)).toEqual(["kitchen.prepared"]);
    expect(impact.summary).toMatch(/nobody to cover/i);
  });

  it("only counts what was actually due that day", () => {
    const impact = assessAbsence({
      date: "2026-09-19",
      responsibilities: [responsibility({ outcomeKey: "home.cleaned" })],
      scheduledOutcomeKeys: [],
    });

    expect(impact.affected).toEqual([]);
    expect(impact.notable).toBe(false);
    expect(impact.summary).toMatch(/nothing was due/i);
  });

  it("counts in the household's terms, not in records", () => {
    const impact = assessAbsence({
      date: "2026-09-18",
      responsibilities: [responsibility({ outcomeKey: "home.cleaned" })],
      scheduledOutcomeKeys: ["home.cleaned"],
    });
    expect(impact.summary).toMatch(/1 of 1 thing affected has nobody/i);
  });
});

describe("when the helper's work hits a problem", () => {
  it("reorders a missing supply rather than interrupting anyone", () => {
    const handling = handleHelperException(
      { kind: "missing_supplies", outcomeKey: "kitchen.prepared", detail: "no coriander" },
      { canReorder: true, hasBackup: false },
    );
    expect(handling.kind).toBe("handle_silently");
  });

  it("speaks up when it cannot reorder", () => {
    const handling = handleHelperException(
      { kind: "missing_supplies", outcomeKey: "kitchen.prepared", detail: "no coriander" },
      { canReorder: false, hasBackup: false },
    );
    expect(handling.kind).toBe("tell_household");
    expect(handling.kind === "tell_household" && handling.action.action).toBe("add_to_list");
  });

  it("says nothing when someone is already covering an absence", () => {
    const handling = handleHelperException(
      { kind: "not_arrived", outcomeKey: "home.cleaned", detail: "" },
      { canReorder: true, hasBackup: true },
    );
    expect(handling.kind).toBe("handle_silently");
  });

  it("asks for cover when there is none", () => {
    const handling = handleHelperException(
      { kind: "not_arrived", outcomeKey: "home.cleaned", detail: "" },
      { canReorder: true, hasBackup: false },
    );
    expect(handling.kind === "tell_household" && handling.action.action).toBe("find_cover");
  });

  it("treats extra work as good news, not a problem", () => {
    const handling = handleHelperException(
      { kind: "extra_work", outcomeKey: "home.cleaned", detail: "also did the windows" },
      { canReorder: true, hasBackup: true },
    );
    expect(handling.kind).toBe("handle_silently");
  });

  it("always raises something genuinely blocked", () => {
    const handling = handleHelperException(
      { kind: "blocked", outcomeKey: "laundry.ready", detail: "the machine is broken" },
      { canReorder: true, hasBackup: true },
    );
    expect(handling.kind).toBe("tell_household");
    expect(handling.kind === "tell_household" && handling.impact).toMatch(/machine is broken/);
  });
});

describe("what a helper account can see", () => {
  const helper = { roles: ["helper"] as const, memberType: "helper" as const };

  it("shows them their own schedule and work", () => {
    expect(helperMaySee(helper, "own_schedule")).toBe(true);
    expect(helperMaySee(helper, "own_responsibilities")).toBe(true);
  });

  it("shows them nothing of the family's private life", () => {
    // A helper account is a convenience for the helper, never a window into
    // the household.
    expect(helperMaySee(helper, "household_finances")).toBe(false);
    expect(helperMaySee(helper, "family_plans")).toBe(false);
    expect(helperMaySee(helper, "child_school")).toBe(false);
  });
});

describe("what the helper is asked to do in the app", () => {
  it("is nothing, for normal work", () => {
    expect(helperNeedsToRespond(null)).toBe(false);
    expect(
      helperNeedsToRespond({ kind: "extra_work", outcomeKey: "home.cleaned", detail: "" }),
    ).toBe(false);
  });

  it("is limited to telling us something is genuinely blocked", () => {
    expect(
      helperNeedsToRespond({ kind: "blocked", outcomeKey: "laundry.ready", detail: "no water" }),
    ).toBe(true);
  });
});

describe("the daily summary", () => {
  const handled = (exception: HelperException, because: string): { exception: HelperException; handling: HelperExceptionHandling } => ({
    exception,
    handling: { kind: "handle_silently", because },
  });

  const told = (exception: HelperException, impact: string): { exception: HelperException; handling: HelperExceptionHandling } => ({
    exception,
    handling: { kind: "tell_household", impact, action: { action: "unblock", target: exception.outcomeKey } },
  });

  it("says nothing was unusual when every exception was handled silently and the absence was fully covered", () => {
    const summary = buildDailySummary({
      date: "2026-09-21",
      exceptionHandlings: [
        handled({ kind: "extra_work", outcomeKey: "home.cleaned", detail: "" }, "Extra work is not a problem."),
        handled({ kind: "missing_supplies", outcomeKey: "laundry.ready", detail: "" }, "Reordered automatically."),
      ],
      absenceImpact: null,
    });

    expect(summary.quiet).toBe(true);
    expect(summary.entries).toEqual([]);
    expect(summary.headline).toMatch(/nothing unusual/i);
  });

  it("includes only the exceptions that actually needed the household told", () => {
    const summary = buildDailySummary({
      date: "2026-09-21",
      exceptionHandlings: [
        handled({ kind: "extra_work", outcomeKey: "home.cleaned", detail: "" }, "Fine."),
        told({ kind: "blocked", outcomeKey: "laundry.ready", detail: "no water" }, "laundry.ready cannot proceed: no water"),
      ],
      absenceImpact: null,
    });

    expect(summary.quiet).toBe(false);
    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0]).toEqual({
      outcomeKey: "laundry.ready",
      headline: "laundry.ready cannot proceed: no water",
    });
    expect(summary.headline).toMatch(/1 thing/i);
  });

  it("includes an uncovered absence as unusual, but not a fully-covered one", () => {
    const coveredAbsence = assessAbsence({
      date: "2026-09-21",
      responsibilities: [{ outcomeKey: "home.cleaned", backupMemberId: "m-2", priority: 1 }],
      scheduledOutcomeKeys: ["home.cleaned"],
    });
    const uncoveredAbsence = assessAbsence({
      date: "2026-09-21",
      responsibilities: [{ outcomeKey: "home.cleaned", backupMemberId: null, priority: 1 }],
      scheduledOutcomeKeys: ["home.cleaned"],
    });

    expect(buildDailySummary({ date: "2026-09-21", exceptionHandlings: [], absenceImpact: coveredAbsence }).quiet).toBe(
      true,
    );

    const summary = buildDailySummary({ date: "2026-09-21", exceptionHandlings: [], absenceImpact: uncoveredAbsence });
    expect(summary.quiet).toBe(false);
    expect(summary.entries).toHaveLength(1);
    expect(summary.entries[0]?.outcomeKey).toBe("absence.2026-09-21");
  });

  it("counts multiple unusual things in its one headline", () => {
    const summary = buildDailySummary({
      date: "2026-09-21",
      exceptionHandlings: [
        told({ kind: "blocked", outcomeKey: "laundry.ready", detail: "no water" }, "laundry.ready cannot proceed: no water"),
        told({ kind: "not_arrived", outcomeKey: "home.cleaned", detail: "" }, "Nobody is covering home.cleaned today."),
      ],
      absenceImpact: null,
    });

    expect(summary.entries).toHaveLength(2);
    expect(summary.headline).toMatch(/2 things/i);
  });
});
