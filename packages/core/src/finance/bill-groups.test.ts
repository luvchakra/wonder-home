import { describe, expect, it } from "vitest";

import { billGroupOf, billsTotal, daysOverdue, groupBills } from "./bill-groups";

const today = "2026-11-21";
const bill = (id: string, dueOn: string | null, amountMinor: number | null, currency: string | null = amountMinor === null ? null : "INR") => ({ id, name: id, dueOn, amountMinor, currency });

describe("grouping bills by what the reader is deciding", () => {
  it("puts a bill in overdue, this week, later or no date", () => {
    expect(billGroupOf(bill("a", "2026-10-01", 1), today)).toBe("overdue");
    expect(billGroupOf(bill("b", "2026-11-21", 1), today)).toBe("thisWeek");
    expect(billGroupOf(bill("c", "2026-11-27", 1), today)).toBe("thisWeek");
    expect(billGroupOf(bill("d", "2026-11-28", 1), today)).toBe("later");
    expect(billGroupOf(bill("e", null, 1), today)).toBe("noDate");
  });

  it("says how many days late, across a month end", () => {
    expect(daysOverdue(bill("a", "2026-10-01", 1), today)).toBe(51);
    expect(daysOverdue(bill("b", "2026-11-20", 1), today)).toBe(1);
    expect(daysOverdue(bill("c", "2026-11-24", 1), today)).toBe(0);
    expect(daysOverdue(bill("d", null, 1), today)).toBe(0);
  });

  it("orders groups and bills by due date and leaves empty groups out", () => {
    const groups = groupBills([bill("later", "2026-12-05", 1), bill("late2", "2026-11-05", 1), bill("late1", "2026-10-01", 1), bill("none", null, 1)], today);
    expect(groups.map((group) => group.key)).toEqual(["overdue", "later", "noDate"]);
    expect(groups[0]!.bills.map((b) => b.id)).toEqual(["late1", "late2"]);
  });
});

describe("the total line", () => {
  // The owner's screenshot, 2026-11-21.
  const list = [
    bill("Electricity", "2026-10-01", 250000),
    bill("Piped gas", "2026-10-14", 70000),
    bill("Costume", "2026-11-02", 30000),
    bill("Electricity bill", "2026-11-05", 234000),
    bill("Airtel", "2026-11-10", 117882),
    bill("Electricity Nov", "2026-11-24", null),
    bill("Broadband", null, 115000),
  ];

  it("adds what is due in minor units, says how much of it is overdue, and counts amounts not in", () => {
    const total = billsTotal(list, today);
    expect(total.due).toEqual([{ currency: "INR", minor: 816882, count: 6 }]);
    expect(total.overdue).toEqual([{ currency: "INR", minor: 701882, count: 5 }]);
    expect(total.amountsMissing).toBe(1);
    expect(total.parts.reduce((sum, part) => sum + part.minor, 0)).toBe(816882);
  });

  it("never adds two currencies together", () => {
    const total = billsTotal([bill("a", "2026-12-01", 1000, "INR"), bill("b", "2026-12-01", 500, "USD")], today);
    expect(total.due.map((row) => row.currency).sort()).toEqual(["INR", "USD"]);
    expect(total.overdue).toEqual([]);
  });
});
