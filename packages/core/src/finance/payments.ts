import { daysBetween, isoDate, parseDate, silent, type HomeAssessment } from "../home/assessment";

/**
 * Bills and payments (stories 11-001 through 11-008).
 *
 * This is the module that spends money, so every decision here is written to be
 * inspectable rather than clever. The rules it enforces:
 *
 * An approval is for one exact payment. Approving "the electricity bill for
 * ₹2,840" is not approving a different amount, and the intent carries a
 * fingerprint so a changed figure invalidates the approval rather than sliding
 * through under it.
 *
 * Step-up is a separate fact from being signed in. A live session says who is
 * asking; step-up says that this person, at this moment, agreed to this. Only
 * the second is good enough to move money.
 *
 * An anomaly is a review, never a block. A bill that is genuinely three times
 * the usual is exactly the bill a household most needs paid on time.
 */

export const OBLIGATION_KINDS = [
  "utility",
  "rent",
  "school_fee",
  "subscription",
  "insurance",
  "loan",
  "tax",
  "service",
  "other",
] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];

export const OBLIGATION_STATUSES = [
  "expected",
  "received",
  "scheduled",
  "paid",
  "overdue",
  "disputed",
  "waived",
  "cancelled",
] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];

export type Obligation = {
  id: string;
  name: string;
  kind: ObligationKind;
  payee: string | null;
  /** Null until the bill actually arrives, which is the normal case. */
  amountMinor: number | null;
  currency: string | null;
  dueOn: string | null;
  responsibleMemberId: string | null;
  status: ObligationStatus;
  requiresReview: boolean;
};

/**
 * How much warning each kind of bill deserves.
 *
 * Rent and school fees carry consequences that a streaming subscription does
 * not, so they are raised earlier. The lead time is about what being late
 * costs, not about how large the amount is.
 */
export const BILL_LEAD_DAYS: Record<ObligationKind, number> = {
  rent: 7,
  school_fee: 7,
  loan: 5,
  tax: 7,
  insurance: 5,
  utility: 3,
  service: 3,
  subscription: 2,
  other: 3,
};

/**
 * Whether a bill needs somebody (stories 11-003, 11-005).
 *
 * Silence is the default and the common case. The criterion is explicit that
 * reminders are suppressed once a bill is "already paid, delegated or otherwise
 * no longer actionable", so every settled state returns nothing at all.
 */
export function assessObligation(
  obligation: Obligation,
  options: { now?: Date; hasApprovedIntent?: boolean } = {},
): HomeAssessment {
  const now = options.now ?? new Date();
  const subjectKey = `bill.${obligation.id}`;

  if (["paid", "waived", "cancelled", "disputed"].includes(obligation.status)) {
    return silent(subjectKey, obligation.name, "This bill is settled.");
  }

  if (obligation.status === "scheduled" || options.hasApprovedIntent) {
    // Somebody has already dealt with it. Saying it again is how a household
    // learns to stop reading these.
    return silent(subjectKey, obligation.name, "A payment is already arranged for this.");
  }

  const due = parseDate(obligation.dueOn);
  if (!due) {
    return silent(subjectKey, obligation.name, "This bill has no date yet.");
  }

  const daysUntil = daysBetween(now, due);
  const lead = BILL_LEAD_DAYS[obligation.kind];

  if (daysUntil < 0) {
    return {
      subjectKey,
      title: obligation.name,
      status: "missed",
      riskLevel: "high",
      notable: true,
      reason: `${obligation.name} was due ${Math.abs(daysUntil)} days ago.`,
      action: { action: "pay_bill", target: obligation.id },
      dueOn: isoDate(due),
    };
  }

  if (daysUntil <= lead) {
    return {
      subjectKey,
      title: obligation.name,
      status: "at_risk",
      riskLevel: daysUntil <= 1 ? "high" : "medium",
      notable: true,
      reason:
        obligation.amountMinor === null
          ? `${obligation.name} is due ${daysUntil === 0 ? "today" : `in ${daysUntil} days`} and the amount has not arrived.`
          : `${obligation.name} — ${format(obligation.amountMinor, obligation.currency ?? "INR")} due ${daysUntil === 0 ? "today" : `in ${daysUntil} days`}.`,
      action: { action: "pay_bill", target: obligation.id },
      dueOn: isoDate(due),
    };
  }

  return silent(subjectKey, obligation.name, `${obligation.name} is not due for ${daysUntil} days.`);
}

export type PaymentIntent = {
  id: string;
  obligationId: string;
  amountMinor: number;
  currency: string;
  status: "draft" | "awaiting_approval" | "approved" | "executing" | "succeeded" | "failed" | "cancelled";
  approvedByMemberId: string | null;
  approvedAt: Date | null;
  stepUpVerifiedAt: Date | null;
  idempotencyKey: string;
};

/**
 * The exact thing somebody approved.
 *
 * Compared before execution, so an amount that changed after approval is a
 * refusal rather than a silent re-price. A household that approved ₹2,840 has
 * not approved ₹8,420.
 */
export function approvalFingerprint(input: {
  obligationId: string;
  amountMinor: number;
  currency: string;
}): string {
  return `${input.obligationId}:${input.amountMinor}:${input.currency}`;
}

/** How long a step-up verification is good for. Long enough to finish, no longer. */
export const STEP_UP_VALID_MINUTES = 10;

export type ExecutionCheck =
  | { mayExecute: true; idempotencyKey: string }
  | { mayExecute: false; code: ExecutionRefusal; reason: string };

export type ExecutionRefusal =
  | "not_approved"
  | "step_up_missing"
  | "step_up_stale"
  | "amount_changed"
  | "already_settled";

/**
 * Whether an approved intent may actually be executed (11-004, 11-005).
 *
 * Every refusal here is a case that would otherwise move money nobody agreed
 * to move. The order matters: approval, then the freshness of the step-up, then
 * whether the amount is still the one approved.
 */
export function mayExecute(
  intent: PaymentIntent,
  current: { amountMinor: number; currency: string; obligationId: string },
  now: Date = new Date(),
): ExecutionCheck {
  if (intent.status === "succeeded" || intent.status === "cancelled") {
    return { mayExecute: false, code: "already_settled", reason: "This payment is already settled." };
  }

  if (intent.status !== "approved" || !intent.approvedAt) {
    return { mayExecute: false, code: "not_approved", reason: "Nobody has approved this payment." };
  }

  if (!intent.stepUpVerifiedAt) {
    return {
      mayExecute: false,
      code: "step_up_missing",
      // Being signed in says who is asking. It does not say that this person,
      // at this moment, agreed to this.
      reason: "This payment needs confirming again before it can go through.",
    };
  }

  const ageMinutes = (now.getTime() - intent.stepUpVerifiedAt.getTime()) / 60_000;
  if (ageMinutes > STEP_UP_VALID_MINUTES || ageMinutes < 0) {
    return {
      mayExecute: false,
      code: "step_up_stale",
      reason: "That confirmation has expired. Please confirm again.",
    };
  }

  const approved = approvalFingerprint({
    obligationId: intent.obligationId,
    amountMinor: intent.amountMinor,
    currency: intent.currency,
  });
  if (approved !== approvalFingerprint(current)) {
    return {
      mayExecute: false,
      code: "amount_changed",
      reason: "The amount changed after this was approved, so it needs approving again.",
    };
  }

  return { mayExecute: true, idempotencyKey: intent.idempotencyKey };
}

export type Attempt = {
  attemptNumber: number;
  status: "sent" | "succeeded" | "failed" | "unknown";
  failureCode: string | null;
};

export type RetryDecision =
  | { retry: true; attemptNumber: number; because: string }
  | { retry: false; because: string };

/** Failures that mean something transient, rather than something wrong. */
const RETRYABLE = new Set(["network_error", "timeout", "provider_unavailable", "rate_limited"]);

/**
 * Whether to try an intent again (story 11-005).
 *
 * A retry reuses the intent, and therefore the idempotency key — which is what
 * stops a second provider transaction. An unknown outcome is deliberately not
 * retried: not knowing whether money moved is the one case where trying again
 * can genuinely pay twice, and it needs a person and a reconciliation.
 */
export const MAX_PAYMENT_ATTEMPTS = 3;

export function shouldRetry(attempts: readonly Attempt[]): RetryDecision {
  if (attempts.some((attempt) => attempt.status === "succeeded")) {
    return { retry: false, because: "It already went through." };
  }

  const last = [...attempts].sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
  if (!last) return { retry: true, attemptNumber: 1, because: "Nothing has been tried yet." };

  if (last.status === "unknown") {
    return {
      retry: false,
      because: "The last attempt's outcome is unknown, so this needs checking before anything else is sent.",
    };
  }

  if (last.status === "sent") {
    return { retry: false, because: "The last attempt is still in flight." };
  }

  if (!RETRYABLE.has(last.failureCode ?? "")) {
    return { retry: false, because: "This failure will not be fixed by trying again." };
  }

  if (attempts.length >= MAX_PAYMENT_ATTEMPTS) {
    return { retry: false, because: "This has been tried enough times; somebody needs to look." };
  }

  return { retry: true, attemptNumber: attempts.length + 1, because: "A transient failure is worth one more try." };
}

export type Anomaly = {
  amountMinor: number;
  currency: string;
  baselineMinor: number;
  baselineLabel: string;
  ratio: number;
  /** In the household's words, with the comparison visible. */
  explanation: string;
};

/** How far from usual a bill has to be before it is worth a second look. */
export const ANOMALY_RATIO = 1.5;

/** The smallest absolute difference worth raising, so small bills stay quiet. */
export const ANOMALY_FLOOR_MINOR = 50_000;

/**
 * Whether a bill is unusual, and what it is being compared against (11-006).
 *
 * The comparison basis travels with the finding because an anomaly a household
 * cannot check is an accusation. And this never blocks a payment: a bill that
 * is genuinely three times the usual is exactly the bill most worth paying on
 * time, so the outcome is a review decision.
 */
export function detectAnomaly(input: {
  amountMinor: number;
  currency: string;
  history: readonly { periodLabel: string; amountMinor: number }[];
}): Anomaly | null {
  if (input.history.length < 3) return null; // Too little history to call anything unusual.

  const amounts = input.history.map((entry) => entry.amountMinor);
  const median = [...amounts].sort((a, b) => a - b)[Math.floor(amounts.length / 2)]!;
  if (median <= 0) return null;

  const difference = input.amountMinor - median;
  if (difference < ANOMALY_FLOOR_MINOR) return null;

  const ratio = Math.round((input.amountMinor / median) * 100) / 100;
  if (ratio < ANOMALY_RATIO) return null;

  return {
    amountMinor: input.amountMinor,
    currency: input.currency,
    baselineMinor: median,
    baselineLabel: `usual over ${input.history.length} periods`,
    ratio,
    explanation: `${format(input.amountMinor, input.currency)} against a usual ${format(median, input.currency)} — ${ratio}× — over ${input.history.length} periods.`,
  };
}

export type BudgetView = {
  category: string;
  limitMinor: number;
  spentMinor: number;
  currency: string;
  remainingMinor: number;
  /** Planning only: over budget never stops a bill being paid. */
  overBy: number | null;
};

/**
 * What a budget currently looks like (story 11-007).
 *
 * Deliberately a view rather than a control. A budget describes what the
 * household meant to spend; the rent is due regardless, and a system that
 * refused it because a number was exceeded would be worse than useless.
 */
export function budgetView(input: {
  category: string;
  limitMinor: number;
  currency: string;
  spentMinor: number;
}): BudgetView {
  const remaining = input.limitMinor - input.spentMinor;

  return {
    category: input.category,
    limitMinor: input.limitMinor,
    spentMinor: input.spentMinor,
    currency: input.currency,
    remainingMinor: Math.max(0, remaining),
    overBy: remaining < 0 ? -remaining : null,
  };
}

/** Minor units as a household reads them. */
export function format(minor: number, currency: string): string {
  const major = (minor / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return currency === "INR" ? `₹${major}` : `${currency} ${major}`;
}

/**
 * What a financial action records in the audit trail (story 11-005).
 *
 * The criterion is that audit records contain action metadata "but never
 * payment secrets, full credentials or unnecessary private transaction
 * content". So this returns a fixed, small shape — and because it is
 * constructed rather than spread from an input, there is no path by which a
 * caller's extra field ends up in the log.
 */
export function auditMetadata(input: {
  intentId: string;
  obligationId: string;
  amountMinor: number;
  currency: string;
  actorMemberId: string;
  outcome: "approved" | "executed" | "failed" | "cancelled";
  provider?: string;
}): Record<string, string | number> {
  return {
    intentId: input.intentId,
    obligationId: input.obligationId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    actorMemberId: input.actorMemberId,
    outcome: input.outcome,
    ...(input.provider ? { provider: input.provider } : {}),
  };
}
