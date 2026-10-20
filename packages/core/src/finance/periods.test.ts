import { describe, expect, it } from "vitest";

import { billPeriods, nextOpenDueDate } from "./periods";

const RENT = { dueOn: "2026-11-01", recurrence: "monthly", status: "expected", amountMinor: 2_500_000, currency: "INR" };

describe("billPeriods", () => {
  it("makes the current period and one month ahead for a monthly bill", () => {
    const periods = billPeriods(RENT, [], []);
    expect(periods.map((period) => [period.periodLabel, period.dueOn, period.state])).toEqual([
      ["2026-11", "2026-11-01", "due"],
      ["2026-12", "2026-12-01", "upcoming"],
    ]);
    expect(periods[0]).toMatchObject({ current: true, amountMinor: 2_500_000, amountFrom: "bill" });
  });

  it("says what is known of each: paid ahead, given ahead, or the usual amount offered, never as the bill's own", () => {
    const electricity = { dueOn: "2026-11-05", recurrence: "monthly", status: "received", amountMinor: null, currency: "INR" };
    const periods = billPeriods(
      electricity,
      [
        { periodLabel: "2026-10", amountMinor: 234_000, currency: "INR", paidOn: "2026-10-04" },
        { periodLabel: "2026-12", amountMinor: 210_000, currency: "INR", paidOn: "2026-10-20" },
      ],
      [{ periodLabel: "2027-01", amountMinor: 250_000, currency: "INR" }],
    );
    expect(periods[0]).toMatchObject({ periodLabel: "2026-11", state: "due", amountMinor: null, amountFrom: null, usualMinor: 210_000 });
    expect(periods[1]).toMatchObject({ periodLabel: "2026-12", state: "paid", amountMinor: 210_000, paidOn: "2026-10-20" });
    expect(billPeriods(electricity, [], [{ periodLabel: "2026-12", amountMinor: 250_000, currency: "INR" }])[1]).toMatchObject({ periodLabel: "2026-12", state: "upcoming", amountMinor: 250_000, amountFrom: "given" });
  });

  it("shows the three months before, paid from the history or waiting to be filled in", () => {
    const periods = billPeriods(
      RENT,
      [{ periodLabel: "2026-09", amountMinor: 2_500_000, currency: "INR", paidOn: "2026-09-02" }],
      [{ periodLabel: "2026-10", amountMinor: 2_500_000, currency: "INR" }],
      undefined,
      3,
    );
    expect(periods.map((period) => [period.periodLabel, period.state])).toEqual([
      ["2026-08", "earlier"],
      ["2026-09", "paid"],
      ["2026-10", "earlier"],
      ["2026-11", "due"],
      ["2026-12", "upcoming"],
    ]);
    expect(periods[0]).toMatchObject({ amountMinor: null, amountFrom: null, dueOn: "2026-08-01" });
    expect(periods[2]).toMatchObject({ amountMinor: 2_500_000, amountFrom: "given" });
    expect(billPeriods({ ...RENT, recurrence: "one_off" }, [], [], undefined, 3).map((period) => period.periodLabel)).toEqual(["2026-11"]);
  });

  it("makes one period ahead for a quarterly or yearly bill, none for a one-off, and nothing for a settled bill", () => {
    expect(billPeriods({ ...RENT, recurrence: "quarterly" }, [], []).map((period) => period.dueOn)).toEqual(["2026-11-01", "2027-02-01"]);
    expect(billPeriods({ ...RENT, recurrence: "yearly" }, [], []).map((period) => period.dueOn)).toEqual(["2026-11-01", "2027-11-01"]);
    expect(billPeriods({ ...RENT, recurrence: "one_off" }, [], []).map((period) => period.dueOn)).toEqual(["2026-11-01"]);
    expect(billPeriods({ ...RENT, status: "paid" }, [], [])).toEqual([]);
    expect(billPeriods({ ...RENT, dueOn: null }, [], [])).toEqual([]);
  });
});

describe("nextOpenDueDate", () => {
  it("skips a period already paid ahead", () => {
    expect(nextOpenDueDate("2026-11-01", "monthly", new Set())).toBe("2026-12-01");
    expect(nextOpenDueDate("2026-11-01", "monthly", new Set(["2026-12", "2027-01"]))).toBe("2027-02-01");
    expect(nextOpenDueDate("2026-11-01", "one_off", new Set())).toBeNull();
  });
});
