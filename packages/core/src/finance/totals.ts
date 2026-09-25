/**
 * Adding amounts up without mixing currencies (story 22-007).
 *
 * A household can hold records in several currencies, and nothing is ever
 * converted. So a total is one sum per currency, never one number that quietly
 * adds rupees to dollars. Amounts are minor units, as stored; the screen turns
 * each into major units through the one formatter.
 */
export type CurrencyTotal = { currency: string; minor: number; count: number };

export function totalsByCurrency(rows: readonly { minor: number | null; currency: string | null }[]): CurrencyTotal[] {
  const totals = new Map<string, CurrencyTotal>();
  for (const row of rows) {
    if (row.minor === null || !row.currency) continue;
    const total = totals.get(row.currency) ?? { currency: row.currency, minor: 0, count: 0 };
    total.minor += Number(row.minor);
    total.count += 1;
    totals.set(row.currency, total);
  }
  // The currency with the most records first, so the usual one leads.
  return [...totals.values()].sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency));
}
