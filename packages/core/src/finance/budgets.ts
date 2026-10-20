import { BILL_TYPES } from "./bill-catalog";
import { OBLIGATION_KINDS } from "./payments";

/**
 * What a budget has used so far (story 11-007, 22-007).
 *
 * A budget is for one kind of bill ("utility", "school_fee"…) over a month,
 * a quarter or a year, in one currency. What it has used is the sum of the
 * payments recorded for that kind inside the current period — only those in
 * the budget's own currency. A payment in another currency is never
 * converted and never added in; it is counted separately so the screen can
 * say so, rather than show a total that quietly mixes rupees and dollars.
 *
 * Since the owner's ask (2026-10-20: "instead of utility mention all line
 * items separately, electricity, water, gas, petrol etc") a budget is for
 * one line item — a typical bill (`BILL_TYPES`: electricity, water, piped
 * gas, petrol…) — and counts the payments of bills of that type. A budget
 * set earlier for a whole kind ("utility") keeps counting its kind.
 */

/** What a new budget can be for: each typical bill, and "other" for the rest. */
export const BUDGET_CATEGORIES = [...BILL_TYPES.map((type) => type.key), "other"] as const;

export const BUDGET_PERIODS = ["month", "quarter", "year"] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export function isBudgetCategory(value: string): boolean {
  return (BUDGET_CATEGORIES as readonly string[]).includes(value) || (OBLIGATION_KINDS as readonly string[]).includes(value);
}

/** The first day (YYYY-MM-DD) of the period `today` falls in. */
export function budgetPeriodStart(period: BudgetPeriod, today: string): string {
  const [year, month] = today.split("-").map(Number) as [number, number];
  if (period === "year") return `${year}-01-01`;
  if (period === "quarter") return `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export type BudgetPayment = {
  kind: string;
  /** The typical bill it was paid for (`bill-catalog.ts`), when its bill says. */
  billType?: string | null;
  currency: string;
  amountMinor: number;
  /** When it was actually paid, if recorded. */
  paidOn: string | null;
  /** The period the payment covers, "YYYY-MM". Used when there is no paid date. */
  periodLabel: string;
};

export type BudgetSpend = {
  spentMinor: number;
  /** Payments of this kind in the period that are in another currency — not added, only counted. */
  otherCurrencies: { currency: string; count: number }[];
};

export function budgetSpend(
  budget: { category: string; period: BudgetPeriod; currency: string },
  payments: readonly BudgetPayment[],
  today: string,
): BudgetSpend {
  const start = budgetPeriodStart(budget.period, today);
  let spentMinor = 0;
  const others = new Map<string, number>();
  for (const payment of payments) {
    if (payment.kind !== budget.category && payment.billType !== budget.category) continue;
    const day = payment.paidOn ?? (/^\d{4}-\d{2}$/.test(payment.periodLabel) ? `${payment.periodLabel}-01` : null);
    if (!day || day < start || day > today) continue;
    if (payment.currency === budget.currency) spentMinor += payment.amountMinor;
    else others.set(payment.currency, (others.get(payment.currency) ?? 0) + 1);
  }
  return {
    spentMinor,
    otherCurrencies: [...others.entries()].map(([currency, count]) => ({ currency, count })).sort((a, b) => a.currency.localeCompare(b.currency)),
  };
}
