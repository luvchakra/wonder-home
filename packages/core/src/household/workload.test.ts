import { describe, expect, it } from "vitest";

import { findImbalances, formatPerWeek, memberLoads, suggestRebalance, timesPerWeek, type WorkloadMember, type WorkloadOutcome } from "./workload";

const priya: WorkloadMember = { id: "priya", displayName: "Priya", memberType: "adult" };
const kunal: WorkloadMember = { id: "kunal", displayName: "Kunal", memberType: "adult" };
const anya: WorkloadMember = { id: "anya", displayName: "Anya", memberType: "child" };
const asha: WorkloadMember = { id: "asha", displayName: "Asha", memberType: "helper" };

const outcome = (key: string, primary: string | null, backup: string | null, cadence: string | null): WorkloadOutcome => ({
  outcomeKey: key,
  name: key.replace(/[._]/g, " "),
  primaryMemberId: primary,
  backupMemberId: backup,
  cadenceUnit: cadence,
});

describe("who carries what (story 03-008)", () => {
  it("counts load as times a week from each outcome's own rhythm, and says when a rhythm was assumed", () => {
    expect(timesPerWeek("day")).toEqual({ perWeek: 7, assumed: false });
    expect(timesPerWeek("month")).toEqual({ perWeek: 0.25, assumed: false });
    expect(timesPerWeek(null)).toEqual({ perWeek: 1, assumed: true });

    const [load] = memberLoads([priya], [outcome("meals.dinner", "priya", null, "day"), outcome("bills.pay", "priya", null, null)]);
    expect(load).toMatchObject({ outcomes: 2, perWeek: 8, assumedWeekly: 1 });
  });

  it("says a load the way a person would", () => {
    expect(formatPerWeek(7)).toBe("7 times");
    expect(formatPerWeek(1)).toBe("1 time");
    expect(formatPerWeek(7.25)).toBe("about 7 times");
    expect(formatPerWeek(0.25)).toBe("less than once");
    expect(formatPerWeek(0)).toBe("nothing");
  });

  it("is silent about a small difference — households are not meant to be exactly even", () => {
    const outcomes = [outcome("meals.dinner", "priya", "kunal", "day"), outcome("home.plants", "kunal", "priya", "day"), outcome("laundry", "kunal", null, "week")];
    expect(findImbalances(memberLoads([priya, kunal], outcomes))).toEqual([]);
  });

  it("offers the backup's swap that brings two adults closest, and only a swap that narrows the gap", () => {
    const outcomes = [
      outcome("meals.dinner", "priya", "kunal", "day"),
      outcome("school.run", "priya", "kunal", "day"),
      outcome("bills.pay", "priya", "kunal", "month"),
      outcome("home.plants", "kunal", null, "week"),
    ];
    const suggestions = suggestRebalance([priya, kunal], outcomes);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({ fromMemberId: "priya", toMemberId: "kunal", before: { from: 14.25, to: 1 }, after: { from: 7.25, to: 8 } });
    expect(suggestions[0]?.reason).toBe(
      "Priya carries about 14 times a week and Kunal 1 time. Kunal already backs this up; swapping makes it about 7 times and 8 times.",
    );
  });

  it("never gives a child more to do, and never hands a family member's outcome to a helper", () => {
    const outcomes = [
      outcome("meals.dinner", "priya", "anya", "day"),
      outcome("school.run", "priya", "asha", "day"),
      outcome("home.plants", "kunal", null, "week"),
    ];
    expect(suggestRebalance([priya, kunal, anya, asha], outcomes)).toEqual([]);
    // The imbalance is still named, so the household can give it a backup.
    expect(findImbalances(memberLoads([priya, kunal, anya, asha], outcomes)).map((entry) => entry.heaviest.displayName)).toEqual(["Priya"]);
  });

  it("offers nothing when nobody backs anything up — it never hands someone an outcome they were never part of", () => {
    const outcomes = [outcome("meals.dinner", "priya", null, "day"), outcome("school.run", "priya", null, "day")];
    expect(suggestRebalance([priya, kunal], outcomes)).toEqual([]);
  });
});
