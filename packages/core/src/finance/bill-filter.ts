/**
 * Filter Bills and Transactions by kind, payee or person (11-025). Each
 * choice is picked from what the household's own records hold (rule 20); an
 * empty choice matches everything. A payment's own payee, kind and person
 * count when it has them, else its bill's — as Transactions shows it.
 */

export type BillFilter = { kind: string | null; payee: string | null; who: string | null };

export function parseBillFilter(params: { kind?: string; payee?: string; who?: string }): BillFilter {
  const clean = (value: string | undefined) => (value && value.trim().length > 0 && value.length <= 160 ? value.trim() : null);
  return { kind: clean(params.kind), payee: clean(params.payee), who: clean(params.who) };
}

export function isFiltering(filter: BillFilter): boolean {
  return Boolean(filter.kind || filter.payee || filter.who);
}

type BillLike = { kind: string; payee: string | null; responsibleMemberId: string | null };

export function matchesBill(bill: BillLike, filter: BillFilter): boolean {
  if (filter.kind && bill.kind !== filter.kind) return false;
  if (filter.payee && (bill.payee ?? "").toLowerCase() !== filter.payee.toLowerCase()) return false;
  if (filter.who && bill.responsibleMemberId !== filter.who) return false;
  return true;
}

export function matchesPayment(row: { kind: string | null; payee: string | null; owner_member_id: string | null }, bill: BillLike | undefined, filter: BillFilter): boolean {
  return matchesBill(
    { kind: row.kind ?? bill?.kind ?? "", payee: row.payee ?? bill?.payee ?? null, responsibleMemberId: row.owner_member_id ?? bill?.responsibleMemberId ?? null },
    filter,
  );
}

/** The payees on record, each once, in order — what the filter offers. */
export function payeeChoices(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const value of values) if (value && !seen.has(value.toLowerCase())) seen.set(value.toLowerCase(), value);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
