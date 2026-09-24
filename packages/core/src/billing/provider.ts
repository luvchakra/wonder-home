import type { Subscription } from "./entitlements";

/**
 * The billing provider port (story 20-006).
 *
 * WonderHome never learns what a payment processor calls a subscription, an
 * invoice or a checkout. A provider adapter turns its own vocabulary into the
 * canonical `BillingEvent`s below, and `applyBillingEvent` — pure, and the
 * only thing that moves a household's subscription in response to billing —
 * decides what each one means. Replacing the provider is a new adapter; the
 * reducer, the entitlement service and every domain module stay as they are.
 *
 * Nothing here decides a price. Plans are data (`plans`/`plan_features`), and
 * which provider price backs which plan is the adapter's configuration, so no
 * domain module ever carries pricing logic.
 */

export type BillingEventType =
  /** A checkout completed and the subscription is live on the new plan. */
  | "subscription.activated"
  /** A renewal was paid; the period moves on. */
  | "subscription.renewed"
  /** A renewal failed. The plan stays, metered work pauses (entitlements), nothing is removed. */
  | "payment.failed"
  /** Recovered after a failure. */
  | "payment.recovered"
  /** The subscription ended at the provider. */
  | "subscription.cancelled"
  /** The subscription will end at the period's end (or no longer will): the plan stays until then. */
  | "subscription.cancel_scheduled"
  /** A payment went through. Ledger only: the subscription moves on activation or renewal, not on this. */
  | "payment.succeeded"
  /**
   * One charge attempt was declined — at checkout, say. Ledger only: a
   * subscription falls behind on `payment.failed`, which the provider sends
   * about the subscription itself.
   */
  | "payment.attempt_failed"
  /** A refund the provider confirmed, or refused. Ledger only. */
  | "refund.succeeded"
  | "refund.failed";

export const BILLING_EVENT_TYPES: readonly BillingEventType[] = [
  "subscription.activated",
  "subscription.renewed",
  "payment.failed",
  "payment.recovered",
  "subscription.cancelled",
  "subscription.cancel_scheduled",
  "payment.succeeded",
  "payment.attempt_failed",
  "refund.succeeded",
  "refund.failed",
];

/** Events that only add to the ledger; `applyBillingEvent` leaves the subscription alone for them. */
export const LEDGER_ONLY_EVENTS: readonly BillingEventType[] = ["payment.succeeded", "payment.attempt_failed", "refund.succeeded", "refund.failed"];

export type PaymentProviderName = "razorpay" | "stripe";
export type BillingInterval = "month" | "year";
export type PaymentStatus = "created" | "requires_action" | "processing" | "succeeded" | "failed" | "cancelled" | "refunded" | "partially_refunded";
export type PaymentMethodKind = "card" | "upi" | "netbanking" | "wallet" | "emi" | "bank_transfer" | "other";

/** A payment as the provider reported it, in major units. Never a card number, never a secret. */
export type LedgerPayment = {
  providerPaymentId: string;
  orderRef: string | null;
  amount: number | null;
  currency: string | null;
  status: PaymentStatus;
  /** The provider's own code, never its prose. */
  failureCode: string | null;
  method: PaymentMethodKind | null;
  methodLast4: string | null;
  paidAt: Date | null;
};

export type LedgerInvoice = {
  providerInvoiceId: string;
  number: string | null;
  amount: number | null;
  currency: string | null;
  status: "paid" | "open" | "void" | "uncollectible";
  invoiceUrl: string | null;
  receiptUrl: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  issuedAt: Date;
};

export type LedgerRefund = {
  providerRefundId: string;
  providerPaymentId: string;
  amount: number;
  currency: string;
  status: "processing" | "succeeded" | "failed";
};

/** What the subscription costs and how often, as the provider billed it. */
export type SubscriptionTerms = { interval: BillingInterval | null; currency: string | null; amount: number | null };

/** One thing a provider told us, in WonderHome's words. */
export type BillingEvent = {
  /** The provider's own id for the event: what makes a redelivery a no-op. */
  providerEventId: string;
  type: BillingEventType;
  /** The household the event is about, as WonderHome sent it at checkout. */
  householdId: string;
  /** The provider's id for the subscription, kept as `external_ref`. */
  externalRef: string | null;
  /** Present on activation: which of WonderHome's plans was bought. */
  planKey: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  /** When it happened at the provider — the order events are applied in. */
  occurredAt: Date;
  /** Present when the event completes one of our checkout intents. */
  intentId: string | null;
  /** What the provider reported for the ledger, when the event carries it. */
  payment?: LedgerPayment | null;
  invoice?: LedgerInvoice | null;
  refund?: LedgerRefund | null;
  /** The subscription's price and interval, when the provider told us. */
  terms?: SubscriptionTerms | null;
  /** On `subscription.cancel_scheduled`: whether it now ends at the period's end. */
  cancelAtPeriodEnd?: boolean;
};

export type CheckoutRequest = {
  /** Our intent id, which is also the idempotency key the provider sees. */
  intentId: string;
  householdId: string;
  planKey: string;
  successUrl: string;
  cancelUrl: string;
  /**
   * What the provider calls the price being bought — resolved on the server
   * from our own catalogue (`payment_provider_plans`), never from the browser.
   * Absent for a deployment still pricing through configuration.
   */
  providerPlanRef?: string | null;
  interval?: BillingInterval | null;
  currency?: string | null;
  /** Who is paying, for the provider's receipt: never required, never guessed. */
  customerEmail?: string | null;
};

export type Checkout = { providerSessionId: string; url: string; expiresAt: Date | null };

export type BillingProvider = {
  readonly name: string;
  /** The currencies this provider can take money in here, as configured. */
  readonly currencies?: readonly string[];
  /**
   * Whether this is a real processor. A fixture is never shown to a household
   * as a way to pay, so the product cannot imply billing that does not exist.
   */
  readonly live: boolean;
  /** Which plans this provider can sell. A plan it has no price for is changed without a checkout. */
  sells(planKey: string): boolean;
  /**
   * Opens a checkout. Called with the intent id as the provider's idempotency
   * key, so a retried call — a double tap, a timeout, a redeploy mid-request —
   * returns the same session instead of a second transaction.
   */
  createCheckout(request: CheckoutRequest): Promise<Checkout>;
  /** Verifies a webhook delivery and reads it; `null` for an event we do not act on. Throws on a bad signature. */
  readWebhook(rawBody: string, headers: Headers, now?: Date): Promise<BillingEvent | null>;
  /**
   * Ends a subscription at the provider — at the period's end unless told
   * otherwise. The local subscription changes only when the provider's own
   * event arrives, so a call that "succeeded" is never taken as the outcome.
   */
  cancelSubscription?(input: { externalRef: string; atPeriodEnd: boolean }): Promise<void>;
  /** Asks the provider to refund a payment. Pending until the provider's refund event confirms it. */
  refundPayment?(input: { providerPaymentId: string; amount: number; currency: string; idempotencyKey: string }): Promise<{ providerRefundId: string }>;
};

export type SubscriptionState = {
  planKey: string;
  status: Subscription["status"];
  currentPeriodStart: Date;
  currentPeriodEnd: Date | null;
  externalRef: string | null;
  /** When the last applied billing event happened, so an older one arriving late cannot rewind the state. */
  lastEventAt: Date | null;
  /** Ends at `currentPeriodEnd`: the plan stays until then. */
  cancelAtPeriodEnd?: boolean;
  /** A downgrade that takes effect at `currentPeriodEnd`. */
  scheduledPlanKey?: string | null;
  provider?: string | null;
  terms?: SubscriptionTerms | null;
};

export type BillingDecision =
  | { apply: true; next: SubscriptionState; reason: string }
  | { apply: false; reason: string };

/** The plan a household falls back to when a paid subscription ends. */
export const FALLBACK_PLAN_KEY = "free";

/**
 * What a billing event does to a subscription (story 20-006).
 *
 * Deliberately narrow, and never destructive:
 *   - It only ever produces a new subscription row. It cannot touch a
 *     household's records; a lapsed or cancelled plan changes what the
 *     entitlement service answers, and that is all.
 *   - An event older than the last one applied is ignored, so providers that
 *     deliver out of order (they all do) cannot rewind a renewal into a
 *     failure.
 *   - An event about a different provider subscription than the one on
 *     record is ignored, so a stale checkout completing late cannot replace
 *     the subscription the household actually has.
 */
export function applyBillingEvent(current: SubscriptionState | null, event: BillingEvent): BillingDecision {
  if (current?.lastEventAt && event.occurredAt.getTime() < current.lastEventAt.getTime()) {
    return { apply: false, reason: "An older event than the last one applied; ignored so it cannot rewind the subscription." };
  }

  const base: SubscriptionState = current ?? {
    planKey: FALLBACK_PLAN_KEY,
    status: "active",
    currentPeriodStart: event.periodStart ?? event.occurredAt,
    currentPeriodEnd: null,
    externalRef: null,
    lastEventAt: null,
  };

  const sameSubscription = !base.externalRef || !event.externalRef || base.externalRef === event.externalRef;

  if (LEDGER_ONLY_EVENTS.includes(event.type)) {
    return { apply: false, reason: "Recorded in the ledger; the subscription is unchanged." };
  }

  switch (event.type) {
    case "subscription.activated": {
      if (!event.planKey) return { apply: false, reason: "An activation that names no plan cannot be applied." };
      return {
        apply: true,
        reason: `Now on ${event.planKey}.`,
        next: {
          planKey: event.planKey,
          status: "active",
          currentPeriodStart: event.periodStart ?? event.occurredAt,
          currentPeriodEnd: event.periodEnd,
          externalRef: event.externalRef ?? base.externalRef,
          lastEventAt: event.occurredAt,
          // A fresh subscription starts with no end and no pending change.
          cancelAtPeriodEnd: false,
          scheduledPlanKey: null,
          terms: event.terms ?? null,
        },
      };
    }
    case "subscription.renewed":
    case "payment.recovered": {
      if (!sameSubscription) return { apply: false, reason: "About a different subscription than the one on record." };
      return {
        apply: true,
        reason: event.type === "payment.recovered" ? "Payment recovered; the plan is active again." : "Renewed.",
        next: {
          ...base,
          // A renewal may carry the plan the provider moved to at the period's
          // end — a scheduled downgrade arriving — and then it is the plan.
          planKey: event.planKey ?? base.planKey,
          scheduledPlanKey: event.planKey && event.planKey === base.scheduledPlanKey ? null : (base.scheduledPlanKey ?? null),
          status: "active",
          currentPeriodStart: event.periodStart ?? base.currentPeriodStart,
          currentPeriodEnd: event.periodEnd ?? base.currentPeriodEnd,
          lastEventAt: event.occurredAt,
          terms: event.terms ?? base.terms ?? null,
        },
      };
    }
    case "payment.failed": {
      if (!sameSubscription) return { apply: false, reason: "About a different subscription than the one on record." };
      // The plan stays. Past-due pauses metered work (entitlements.ts) and
      // leaves everything the household relies on in place.
      return { apply: true, reason: "A payment failed; the plan stays while it is retried.", next: { ...base, status: "past_due", lastEventAt: event.occurredAt } };
    }
    case "subscription.cancelled": {
      if (!sameSubscription) return { apply: false, reason: "About a different subscription than the one on record." };
      // Back to the free plan, never to nothing: a downgrade removes
      // capabilities, not records (story 20-004 holds that line already).
      return {
        apply: true,
        reason: "The paid subscription ended; the household is on the free plan and keeps everything it has.",
        next: {
          planKey: FALLBACK_PLAN_KEY,
          status: "active",
          currentPeriodStart: event.occurredAt,
          currentPeriodEnd: null,
          externalRef: null,
          lastEventAt: event.occurredAt,
          cancelAtPeriodEnd: false,
          scheduledPlanKey: null,
          provider: null,
          terms: null,
        },
      };
    }
    case "subscription.cancel_scheduled": {
      if (!sameSubscription) return { apply: false, reason: "About a different subscription than the one on record." };
      const ending = event.cancelAtPeriodEnd ?? true;
      return {
        apply: true,
        reason: ending ? "It ends at the end of the period; the plan stays until then." : "No longer ending; the plan continues.",
        next: { ...base, cancelAtPeriodEnd: ending, currentPeriodEnd: event.periodEnd ?? base.currentPeriodEnd, lastEventAt: event.occurredAt },
      };
    }
    default:
      return { apply: false, reason: "Recorded in the ledger; the subscription is unchanged." };
  }
}

/** A deployment's billing provider, or none — in which case plan changes apply directly, as they always have. */
export type BillingProviderFactory = (env: Record<string, string | undefined>) => BillingProvider | null;
