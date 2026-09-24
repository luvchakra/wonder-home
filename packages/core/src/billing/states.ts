import type { PaymentStatus } from "./provider";

/**
 * Which way a payment may move (story 20-009).
 *
 * Providers deliver out of order and more than once, so the ledger never
 * trusts "the latest event wins". A payment moves forward only: a late
 * "processing" never undoes a success, and only a refund moves a success on.
 * An invalid move is refused, and the payment keeps the state it had.
 */
const NEXT: Record<PaymentStatus, readonly PaymentStatus[]> = {
  created: ["requires_action", "processing", "succeeded", "failed", "cancelled"],
  requires_action: ["processing", "succeeded", "failed", "cancelled"],
  processing: ["succeeded", "failed"],
  // A declined attempt that the customer then completes is the same payment succeeding.
  failed: ["succeeded"],
  succeeded: ["partially_refunded", "refunded"],
  partially_refunded: ["refunded"],
  refunded: [],
  cancelled: [],
};

export function canMovePayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return from === to || NEXT[from].includes(to);
}

/** The status to keep: the incoming one where the move is allowed, else the current one. */
export function nextPaymentStatus(current: PaymentStatus | null, incoming: PaymentStatus): PaymentStatus {
  if (!current) return incoming;
  return canMovePayment(current, incoming) ? incoming : current;
}

/** After a refund succeeds: fully refunded once refunds cover the amount paid. */
export function statusAfterRefunds(paid: number | null, refunded: number): PaymentStatus {
  if (paid !== null && refunded + 0.005 >= paid) return "refunded";
  return "partially_refunded";
}
