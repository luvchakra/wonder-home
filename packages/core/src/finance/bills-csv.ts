/**
 * A year's bills and payments as CSV (11-025, the owner 2026-11-21). Amounts
 * are decimal in their own currency, one currency column, never converted
 * (rule 22); a spreadsheet's total of the payment rows is what Transactions
 * shows for the year. Cells a spreadsheet would run as a formula are made
 * plain text first (CSV injection), since bill names come from what was sent.
 */

export type CsvBill = { id: string; name: string; kind: string; payee: string | null; dueOn: string | null; status: string; amountMinor: number | null; currency: string | null; owner: string | null; recurrence: string | null };
export type CsvPayment = { obligationId: string; periodLabel: string; amountMinor: number; currency: string; paidOn: string | null; paidWith: string | null; partOfMinor: number | null; payee: string | null; kind: string | null; owner: string | null };

export const CSV_HEADER = ["record", "name", "kind", "payee", "person", "month", "due_on", "paid_on", "amount", "currency", "paid_with", "part_of", "status", "repeats"] as const;

export function decimal(minor: number, exponent: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(minor));
  if (exponent === 0) return `${sign}${abs}`;
  const unit = 10 ** exponent;
  return `${sign}${Math.floor(abs / unit)}.${String(abs % unit).padStart(exponent, "0")}`;
}

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value === "string") text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Bills due in the year and payments made for its months, oldest first. */
export function billsCsv(input: { year: number; bills: readonly CsvBill[]; payments: readonly CsvPayment[]; exponentOf: (currency: string) => number }): string {
  const year = String(input.year);
  const nameOf = new Map(input.bills.map((bill) => [bill.id, bill]));
  const rows: (string | number | null)[][] = [];
  for (const bill of [...input.bills].filter((b) => b.dueOn?.startsWith(year)).sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""))) {
    rows.push([
      "bill",
      bill.name,
      bill.kind,
      bill.payee,
      bill.owner,
      bill.dueOn!.slice(0, 7),
      bill.dueOn,
      null,
      bill.amountMinor !== null && bill.currency ? decimal(bill.amountMinor, input.exponentOf(bill.currency)) : null,
      bill.amountMinor !== null ? bill.currency : null,
      null,
      null,
      bill.status,
      bill.recurrence && bill.recurrence !== "one_off" ? bill.recurrence : null,
    ]);
  }
  for (const pay of [...input.payments].filter((p) => p.periodLabel.startsWith(year)).sort((a, b) => a.periodLabel.localeCompare(b.periodLabel))) {
    const bill = nameOf.get(pay.obligationId);
    const exponent = input.exponentOf(pay.currency);
    rows.push([
      "payment",
      bill?.name ?? null,
      pay.kind ?? bill?.kind ?? null,
      pay.payee ?? bill?.payee ?? null,
      pay.owner ?? bill?.owner ?? null,
      pay.periodLabel,
      null,
      pay.paidOn,
      decimal(pay.amountMinor, exponent),
      pay.currency,
      pay.paidWith,
      pay.partOfMinor !== null ? decimal(pay.partOfMinor, exponent) : null,
      pay.partOfMinor !== null ? "part paid" : "paid",
      null,
    ]);
  }
  return [CSV_HEADER.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n") + "\r\n";
}
