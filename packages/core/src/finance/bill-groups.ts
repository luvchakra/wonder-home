import { totalsByCurrency, type CurrencyTotal } from "./totals";

/**
 * The Bills list grouped by what the reader is deciding (rule 17; the owner,
 * 2026-11-21): what is late, what is due this week, what can wait, and what
 * has no date yet. Overdue is said in days, never only as a red colour (rule 3).
 */
export type BillGroupKey = "overdue" | "thisWeek" | "later" | "noDate";

export const BILL_GROUP_ORDER: readonly BillGroupKey[] = ["overdue", "thisWeek", "later", "noDate"];

type Dated = { dueOn: string | null };

/** Whole days from `from` to `to`, both YYYY-MM-DD; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Which group a bill falls in on the household's `today` (YYYY-MM-DD). This week is today and the next six days. */
export function billGroupOf(bill: Dated, today: string): BillGroupKey {
  if (!bill.dueOn) return "noDate";
  const days = daysBetween(today, bill.dueOn.slice(0, 10));
  if (days < 0) return "overdue";
  return days <= 6 ? "thisWeek" : "later";
}

/** How many days late a bill is on `today`; 0 when it isn't. */
export function daysOverdue(bill: Dated, today: string): number {
  return bill.dueOn ? Math.max(0, -daysBetween(today, bill.dueOn.slice(0, 10))) : 0;
}

/** The bills in their groups, each in due order, empty groups left out. */
export function groupBills<T extends Dated>(bills: readonly T[], today: string): { key: BillGroupKey; bills: T[] }[] {
  const sorted = [...bills].sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  return BILL_GROUP_ORDER.map((key) => ({ key, bills: sorted.filter((bill) => billGroupOf(bill, today) === key) })).filter((group) => group.bills.length > 0);
}

/**
 * The one total line above the list (rule 9: arithmetic someone can explain).
 * What is due, per currency and never converted, of which how much is
 * overdue, and how many bills have no amount in yet (counted, never guessed).
 * `parts` are the amounts that were added, so the line can show its sum.
 */
export type BillsTotal = {
  due: CurrencyTotal[];
  overdue: CurrencyTotal[];
  amountsMissing: number;
  parts: { id: string; name: string; minor: number; currency: string; overdue: boolean }[];
};

export function billsTotal(bills: readonly (Dated & { id: string; name: string; amountMinor: number | null; currency: string | null })[], today: string): BillsTotal {
  const known = bills.filter((bill) => bill.amountMinor !== null && bill.currency);
  const rows = known.map((bill) => ({ minor: bill.amountMinor, currency: bill.currency, overdue: billGroupOf(bill, today) === "overdue" }));
  return {
    due: totalsByCurrency(rows),
    overdue: totalsByCurrency(rows.filter((row) => row.overdue)),
    amountsMissing: bills.length - known.length,
    parts: known.map((bill) => ({ id: bill.id, name: bill.name, minor: Number(bill.amountMinor), currency: bill.currency!, overdue: billGroupOf(bill, today) === "overdue" })),
  };
}
