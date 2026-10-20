import { nextDueDate } from "./payments";

/**
 * A recurring bill's periods, made ahead (backlog 11-010; the owner,
 * 2026-10-20: "auto generate advance billing entries which user can fill
 * about and paid dates. minimum intervention required by user").
 *
 * Nothing here is stored or invented. The bill's current period is its own
 * due date; the ones after it follow from how often it comes (`nextDueDate`).
 * Each says what is known about it: paid, with the amount and the day, from
 * the bill's history; an amount someone gave ahead (`obligation_periods`); or
 * nothing yet, with the last amount paid offered as what it usually is —
 * always said to be that, never shown as the bill's own figure (rule 9).
 */

export type PeriodState = "paid" | "due" | "upcoming";

export type BillPeriod = {
  /** "2026-11" — the month the period's due date falls in. */
  periodLabel: string;
  dueOn: string;
  state: PeriodState;
  /** The bill's own current period, the one its due date and reminders are about. */
  current: boolean;
  amountMinor: number | null;
  currency: string | null;
  /** Where the amount came from: paid, given for this period, or nowhere yet. */
  amountFrom: "paid" | "bill" | "given" | null;
  paidOn: string | null;
  /** The last amount paid, for a period nobody has given an amount for. */
  usualMinor: number | null;
};

export type PeriodBill = {
  dueOn: string | null;
  recurrence: string | null;
  status: string;
  amountMinor: number | null;
  currency: string | null;
};

export type PaidPeriod = { periodLabel: string; amountMinor: number; currency: string; paidOn: string | null };
export type GivenPeriod = { periodLabel: string; amountMinor: number; currency: string };

/** How many periods past the current one are made ahead: about three months' worth, at least one. */
export function periodsAhead(recurrence: string | null): number {
  return recurrence === "monthly" ? 3 : recurrence === "quarterly" ? 1 : recurrence === "yearly" ? 1 : 0;
}

const OPEN = new Set(["expected", "received", "scheduled", "overdue"]);

export function billPeriods(bill: PeriodBill, paid: readonly PaidPeriod[], given: readonly GivenPeriod[], ahead = periodsAhead(bill.recurrence)): BillPeriod[] {
  if (!bill.dueOn || !OPEN.has(bill.status)) return [];
  const paidBy = new Map(paid.map((row) => [row.periodLabel, row]));
  const givenBy = new Map(given.map((row) => [row.periodLabel, row]));
  const latest = [...paid].sort((a, b) => b.periodLabel.localeCompare(a.periodLabel))[0] ?? null;
  const periods: BillPeriod[] = [];
  let dueOn: string | null = bill.dueOn;
  for (let index = 0; dueOn && index <= ahead; index += 1) {
    const label = dueOn.slice(0, 7);
    const current = index === 0;
    const done = paidBy.get(label);
    const known = givenBy.get(label);
    if (done) {
      periods.push({ periodLabel: label, dueOn, state: "paid", current, amountMinor: done.amountMinor, currency: done.currency, amountFrom: "paid", paidOn: done.paidOn, usualMinor: null });
    } else if (current && bill.amountMinor !== null) {
      periods.push({ periodLabel: label, dueOn, state: "due", current, amountMinor: bill.amountMinor, currency: bill.currency, amountFrom: "bill", paidOn: null, usualMinor: null });
    } else if (known) {
      periods.push({ periodLabel: label, dueOn, state: current ? "due" : "upcoming", current, amountMinor: known.amountMinor, currency: known.currency, amountFrom: "given", paidOn: null, usualMinor: null });
    } else {
      periods.push({
        periodLabel: label,
        dueOn,
        state: current ? "due" : "upcoming",
        current,
        amountMinor: null,
        currency: latest?.currency ?? bill.currency,
        amountFrom: null,
        paidOn: null,
        usualMinor: latest && (!bill.currency || latest.currency === bill.currency) ? latest.amountMinor : null,
      });
    }
    dueOn = nextDueDate(dueOn, bill.recurrence);
  }
  return periods;
}

/**
 * Where a recurring bill goes once its current period is paid: the next due
 * date whose period isn't already paid (a month paid ahead is skipped), at
 * most two years on. Null for a bill that doesn't recur.
 */
export function nextOpenDueDate(dueOn: string, recurrence: string | null, paidLabels: ReadonlySet<string>): string | null {
  let next = nextDueDate(dueOn, recurrence);
  for (let guard = 0; next && paidLabels.has(next.slice(0, 7)) && guard < 24; guard += 1) next = nextDueDate(next, recurrence);
  return next;
}
