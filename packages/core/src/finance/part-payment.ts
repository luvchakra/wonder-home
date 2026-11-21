/**
 * Part payment and how a bill was paid (11-019, the owner 2026-11-21).
 *
 * `obligation_history` keeps one row per bill and month. A part payment keeps
 * that row and says how much of the month's bill it covers: `amount_minor` is
 * what has been paid so far, `due_minor` the month's whole bill while some of
 * it is still left (null once it is paid in full), and `parts` each payment
 * that made it up. The rest stays due on the bill; WonderHome never pays.
 */

export const PAID_WITH = ["upi", "card", "cash", "bank_transfer"] as const;
export type PaidWith = (typeof PAID_WITH)[number];

export function isPaidWith(value: unknown): value is PaidWith {
  return typeof value === "string" && (PAID_WITH as readonly string[]).includes(value);
}

export type PaymentPart = { amountMinor: number; paidOn: string; paidWith: PaidWith | null; memberId: string | null };

/** The month's row as stored; the part-payment columns are absent before the 11-019 migration. */
export type HistoryLike = { amount_minor: number | string; due_minor?: number | string | null; parts?: unknown };

/** A month paid only in part: something paid, the rest still due. */
export function isPartRow(row: HistoryLike | null | undefined): boolean {
  if (!row || row.due_minor === null || row.due_minor === undefined) return false;
  return Number(row.due_minor) > Number(row.amount_minor);
}

/** What is still left on a bill for its month, given what was paid towards it so far. */
export function remainingMinor(billAmountMinor: number | null, row: HistoryLike | null | undefined): number | null {
  if (!isPartRow(row)) return billAmountMinor;
  return Number(row!.due_minor) - Number(row!.amount_minor);
}

function storedParts(row: HistoryLike | null | undefined): PaymentPart[] {
  return Array.isArray(row?.parts) ? (row!.parts as PaymentPart[]) : [];
}

export type AppliedPayment = {
  /** Paid so far for the month, this payment included. */
  amountMinor: number;
  /** The month's whole bill while some is left; null when paid in full. */
  dueMinor: number | null;
  parts: PaymentPart[];
  /** Paid in full: the bill moves on (or is settled). */
  settled: boolean;
};

/**
 * Adds a payment to what the month already has. `part` is the person's own
 * choice ("Part of it"); an amount alone never decides it, since a bill can
 * simply have come to less than expected.
 */
export function applyPayment(
  existing: HistoryLike | null | undefined,
  payment: { amountMinor: number; billAmountMinor: number | null; part: boolean; paidOn: string; paidWith: PaidWith | null; memberId: string | null },
): AppliedPayment {
  const prior = isPartRow(existing) ? Number(existing!.amount_minor) : 0;
  const priorParts = isPartRow(existing) ? storedParts(existing) : [];
  const due = isPartRow(existing) ? Number(existing!.due_minor) : payment.billAmountMinor;
  const total = prior + payment.amountMinor;
  const thisPart: PaymentPart = { amountMinor: payment.amountMinor, paidOn: payment.paidOn, paidWith: payment.paidWith, memberId: payment.memberId };
  if (payment.part && due === null) throw new Error("part_needs_amount");
  if (payment.part && due !== null && total < due) {
    return { amountMinor: total, dueMinor: due, parts: [...priorParts, thisPart], settled: false };
  }
  return { amountMinor: total, dueMinor: null, parts: priorParts.length > 0 ? [...priorParts, thisPart] : [], settled: true };
}
