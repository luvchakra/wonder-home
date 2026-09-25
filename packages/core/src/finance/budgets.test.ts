import { describe, expect, it } from "vitest";

import { budgetPeriodStart, budgetSpend, type BudgetPayment } from "./budgets";

const pay = (over: Partial<BudgetPayment>): BudgetPayment => ({ kind: "utility", currency: "INR", amountMinor: 100_00, paidOn: null, periodLabel: "2026-09", ...over });

describe("budgetPeriodStart", () => {
  it("starts a month, a quarter and a year on their first day", () => {
    expect(budgetPeriodStart("month", "2026-09-25")).toBe("2026-09-01");
    expect(budgetPeriodStart("quarter", "2026-09-25")).toBe("2026-07-01");
    expect(budgetPeriodStart("quarter", "2026-01-02")).toBe("2026-01-01");
    expect(budgetPeriodStart("year", "2026-09-25")).toBe("2026-01-01");
  });
});

describe("budgetSpend (22-007): never adds one currency to another", () => {
  const budget = { category: "utility", period: "month" as const, currency: "INR" };

  it("adds this kind's payments in the budget's currency inside the period", () => {
    const spend = budgetSpend(budget, [pay({ amountMinor: 1_500_00, paidOn: "2026-09-05" }), pay({ amountMinor: 250_50, periodLabel: "2026-09" })], "2026-09-25");
    expect(spend).toEqual({ spentMinor: 1_750_50, otherCurrencies: [] });
  });

  it("counts, but never adds, a payment in another currency", () => {
    const spend = budgetSpend(budget, [pay({ amountMinor: 900_00 }), pay({ currency: "USD", amountMinor: 20_00 }), pay({ currency: "USD", amountMinor: 5_00 })], "2026-09-25");
    expect(spend).toEqual({ spentMinor: 900_00, otherCurrencies: [{ currency: "USD", count: 2 }] });
  });

  it("leaves out other kinds, earlier periods and anything dated after today", () => {
    const spend = budgetSpend(
      budget,
      [pay({ kind: "rent" }), pay({ periodLabel: "2026-08" }), pay({ paidOn: "2026-08-31" }), pay({ paidOn: "2026-09-26" })],
      "2026-09-25",
    );
    expect(spend.spentMinor).toBe(0);
  });

  it("a quarterly budget reaches back to the quarter's first month", () => {
    const spend = budgetSpend({ ...budget, period: "quarter" }, [pay({ periodLabel: "2026-07" }), pay({ periodLabel: "2026-06" })], "2026-09-25");
    expect(spend.spentMinor).toBe(100_00);
  });
});
