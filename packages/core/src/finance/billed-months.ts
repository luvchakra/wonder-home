/**
 * What each bill came to, month by month, for the Bills spend chart (the
 * owner, 2026-10-21: "as soon as bill entries are added, chart should appear
 * immediately").
 *
 * A month counts once per bill, from the best thing on record for it:
 *   1. what was paid (`obligation_history`);
 *   2. else the amount a person gave for that month (`obligation_periods`,
 *      the "Month by month" rows of 11-010);
 *   3. else the open bill's own amount, for the month it is due.
 * Only months up to `thisMonth` count — a month given ahead is not spending yet.
 * Nothing is estimated: a month with none of these stays empty.
 */

export type BilledMonth = {
  obligationId: string;
  periodLabel: string;
  amountMinor: number;
  currency: string;
  /** Where the amount came from. */
  from: "paid" | "given" | "bill";
  payee: string | null;
};

export function billedMonths(input: {
  paid: readonly { obligationId: string; periodLabel: string; amountMinor: number; currency: string; payee?: string | null }[];
  given: ReadonlyMap<string, readonly { periodLabel: string; amountMinor: number; currency: string }[]>;
  bills: readonly { id: string; status: string; dueOn: string | null; amountMinor: number | null; currency: string | null; payee?: string | null }[];
  thisMonth: string;
}): BilledMonth[] {
  const byKey = new Map<string, BilledMonth>();
  const keep = (month: BilledMonth) => {
    if (month.periodLabel > input.thisMonth || !(month.amountMinor > 0)) return;
    const key = `${month.obligationId}|${month.periodLabel}`;
    if (!byKey.has(key)) byKey.set(key, month);
  };
  for (const row of input.paid) keep({ obligationId: row.obligationId, periodLabel: row.periodLabel, amountMinor: row.amountMinor, currency: row.currency, from: "paid", payee: row.payee ?? null });
  const payeeOf = new Map(input.bills.map((bill) => [bill.id, bill.payee ?? null]));
  for (const [obligationId, rows] of input.given)
    for (const row of rows) keep({ obligationId, periodLabel: row.periodLabel, amountMinor: row.amountMinor, currency: row.currency, from: "given", payee: payeeOf.get(obligationId) ?? null });
  for (const bill of input.bills) {
    if (bill.status === "paid" || bill.status === "cancelled" || !bill.dueOn || bill.amountMinor === null || !bill.currency) continue;
    keep({ obligationId: bill.id, periodLabel: bill.dueOn.slice(0, 7), amountMinor: bill.amountMinor, currency: bill.currency, from: "bill", payee: bill.payee ?? null });
  }
  return [...byKey.values()].sort((a, b) => a.periodLabel.localeCompare(b.periodLabel) || a.obligationId.localeCompare(b.obligationId));
}
