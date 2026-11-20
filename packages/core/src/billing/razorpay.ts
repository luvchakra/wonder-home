import { fromMinorUnits, toMinorUnits } from "./money";
import type {
  BillingEvent,
  CheckoutClient,
  LedgerInvoice,
  ProviderPlan,
  BillingInterval,
  BillingProvider,
  Checkout,
  CheckoutRequest,
  LedgerPayment,
  PaymentMethodKind,
  PaymentStatus,
  RemotePayment,
} from "./provider";
import { constantTimeEqual, hmacHex, WebhookSignatureError } from "./signature";

/**
 * Razorpay as a billing provider (story 20-009) — the preferred way to take a
 * subscription in INR.
 *
 * Code-complete and genuinely inert, like the Stripe adapter: nothing runs
 * until a deployment lists `razorpay` in `WONDERHOME_BILLING_PROVIDERS` and
 * sets `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`,
 * and a person maps our prices to Razorpay plans (`payment_provider_plans`).
 *
 * How it works:
 *   - A checkout is a Razorpay subscription created on the server against the
 *     Razorpay plan our own price maps to. The browser opens Razorpay Checkout
 *     in place with that subscription id and the publishable key id (UPI,
 *     cards, netbanking and wallets), falling back to Razorpay's hosted page
 *     (`short_url`). WonderHome never sees a card or a UPI PIN, and the key
 *     secret never leaves the server.
 *   - Razorpay plans are created (or a pasted plan id checked) from our own
 *     prices in Platform admin → Plans & billing (`provider-plans.ts`), so
 *     nobody copies an amount or a plan id by hand.
 *   - Everything the subscription does next arrives as a webhook, believed
 *     only once `X-Razorpay-Signature` — an HMAC-SHA256 of the raw body with
 *     the webhook secret — verifies. `x-razorpay-event-id` makes a redelivery a
 *     no-op downstream.
 *   - Razorpay has no idempotency header for creating a subscription, so a
 *     retry is kept to one by the checkout intent (one open intent per
 *     household and plan, its checkout link reused while it is open), and the
 *     intent id travels in the subscription's notes.
 */

const API = "https://api.razorpay.com/v1";
type Fetch = typeof fetch;

/** How many billing cycles a subscription authorises before it must be renewed by the customer. */
const TOTAL_COUNT: Record<BillingInterval, number> = { month: 120, year: 10 };

export type RazorpayConfig = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  fetch?: Fetch;
};

export function createRazorpayProvider(config: RazorpayConfig): BillingProvider {
  const doFetch = config.fetch ?? fetch;
  const auth = `Basic ${btoa(`${config.keyId}:${config.keySecret}`)}`;

  const client = (subscriptionId: string): CheckoutClient => ({ kind: "razorpay", keyId: config.keyId, subscriptionId });

  async function read(path: string): Promise<Record<string, unknown> | null> {
    const response = await doFetch(`${API}${path}`, { headers: { authorization: auth }, signal: AbortSignal.timeout(10_000) });
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok) throw new Error(`Razorpay refused the request (${response.status}).`);
    return (await response.json()) as Record<string, unknown>;
  }

  async function call(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await doFetch(`${API}${path}`, {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    // Razorpay's error body can echo what was sent; only the status is kept.
    if (!response.ok) throw new Error(`Razorpay refused the request (${response.status}).`);
    return (await response.json()) as Record<string, unknown>;
  }

  return {
    name: "razorpay",
    live: Boolean(config.keyId && config.keySecret && config.webhookSecret),
    currencies: ["INR"],

    // Razorpay sells only what our catalogue maps to one of its plans; there is
    // no configuration-only price list for it.
    sells() {
      return false;
    },

    async createCheckout(request: CheckoutRequest): Promise<Checkout> {
      if (!request.providerPlanRef) throw new Error(`No Razorpay plan is mapped for ${request.planKey}.`);
      const interval = request.interval ?? "month";
      const body = await call("/subscriptions", {
        plan_id: request.providerPlanRef,
        total_count: TOTAL_COUNT[interval],
        quantity: 1,
        customer_notify: 1,
        // Tied back to the household on every event without a lookup, and to
        // the intent that opened it. Keys and closed words only.
        notes: {
          household_id: request.householdId,
          plan_key: request.planKey,
          intent_id: request.intentId,
          interval,
          currency: request.currency ?? "INR",
        },
      });
      const id = typeof body.id === "string" ? body.id : null;
      const url = typeof body.short_url === "string" ? body.short_url : null;
      if (!id || !url || !url.startsWith("https://")) throw new Error("Razorpay sent a subscription we could not read.");
      return { providerSessionId: id, url, expiresAt: null, client: client(id) };
    },

    checkoutClient(providerSessionId) {
      return /^sub_[A-Za-z0-9]+$/.test(providerSessionId) ? client(providerSessionId) : null;
    },

    async createPlan({ priceId, name, interval, amount, currency }) {
      const body = await call("/plans", {
        period: interval === "year" ? "yearly" : "monthly",
        interval: 1,
        item: { name: name.slice(0, 120), amount: toMinorUnits(amount, currency), currency },
        notes: { plan_price_id: priceId },
      });
      const plan = razorpayPlan(body);
      if (!plan) throw new Error("Razorpay sent a plan we could not read.");
      return plan;
    },

    async fetchPlan(ref) {
      if (!/^plan_[A-Za-z0-9]+$/.test(ref)) return null;
      const body = await read(`/plans/${encodeURIComponent(ref)}`);
      return body ? razorpayPlan(body) : null;
    },

    async readWebhook(rawBody: string, headers: Headers): Promise<BillingEvent | null> {
      await verifyRazorpaySignature(rawBody, headers.get("x-razorpay-signature"), config.webhookSecret);
      const eventId = headers.get("x-razorpay-event-id");
      return eventFromRazorpay(JSON.parse(rawBody) as RazorpayEvent, eventId);
    },

    async cancelSubscription({ externalRef, atPeriodEnd }) {
      await call(`/subscriptions/${encodeURIComponent(externalRef)}/cancel`, { cancel_at_cycle_end: atPeriodEnd ? 1 : 0 });
    },

    async refundPayment({ providerPaymentId, amount, currency, idempotencyKey }) {
      const body = await call(`/payments/${encodeURIComponent(providerPaymentId)}/refund`, {
        amount: toMinorUnits(amount, currency),
        speed: "normal",
        // Our refund row travels with it, so its event finds the row again.
        receipt: idempotencyKey.slice(0, 40),
        notes: { refund_id: idempotencyKey },
      });
      if (typeof body.id !== "string") throw new Error("Razorpay sent a refund we could not read.");
      return { providerRefundId: body.id };
    },

    async fetchPayment(providerPaymentId) {
      const body = await read(`/payments/${encodeURIComponent(providerPaymentId)}`);
      return body ? razorpayRemotePayment(body as RzObject) : null;
    },
  };
}

/** Razorpay's plan entity in our words: monthly or yearly every one period, or nothing we can link. */
export function razorpayPlan(entity: RzObject): ProviderPlan | null {
  const item = typeof entity.item === "object" && entity.item !== null ? (entity.item as RzObject) : {};
  const currency = typeof item.currency === "string" ? item.currency.toUpperCase() : null;
  const minor = typeof item.amount === "number" ? item.amount : null;
  const interval = entity.interval === 1 ? (entity.period === "monthly" ? "month" : entity.period === "yearly" ? "year" : null) : null;
  if (typeof entity.id !== "string" || !currency || minor === null || !interval) return null;
  return { ref: entity.id, interval, amount: fromMinorUnits(minor, currency), currency };
}

/** Razorpay's payment entity as a status we compare with the ledger. */
export function razorpayRemotePayment(entity: RzObject): RemotePayment | null {
  const currency = typeof entity.currency === "string" ? entity.currency.toUpperCase() : null;
  const minor = typeof entity.amount === "number" ? entity.amount : null;
  if (!currency || minor === null) return null;
  const refunded = typeof entity.amount_refunded === "number" ? entity.amount_refunded : 0;
  const raw = entity.status;
  const status: PaymentStatus =
    raw === "captured" || raw === "refunded"
      ? refunded >= minor && minor > 0
        ? "refunded"
        : refunded > 0
          ? "partially_refunded"
          : "succeeded"
      : raw === "failed"
        ? "failed"
        : raw === "authorized"
          ? "processing"
          : "created";
  return { status, amount: fromMinorUnits(minor, currency), currency };
}

/** `X-Razorpay-Signature`: hex HMAC-SHA256 of the raw body with the webhook secret. */
export async function verifyRazorpaySignature(rawBody: string, header: string | null, secret: string): Promise<void> {
  if (!header) throw new WebhookSignatureError("missing header");
  const expected = await hmacHex(secret, rawBody);
  if (!constantTimeEqual(header.trim(), expected)) throw new WebhookSignatureError("no signature matches");
}

type RzObject = Record<string, unknown>;
type RazorpayEvent = {
  event?: unknown;
  created_at?: unknown;
  payload?: { subscription?: { entity?: RzObject }; payment?: { entity?: RzObject }; refund?: { entity?: RzObject } };
};

const METHOD: Record<string, PaymentMethodKind> = { card: "card", upi: "upi", netbanking: "netbanking", wallet: "wallet", emi: "emi", bank_transfer: "bank_transfer" };

function paymentFrom(entity: RzObject | undefined, status: PaymentStatus): LedgerPayment | null {
  if (!entity || typeof entity.id !== "string") return null;
  const currency = typeof entity.currency === "string" ? entity.currency.toUpperCase() : null;
  const card = typeof entity.card === "object" && entity.card !== null ? (entity.card as RzObject) : {};
  const last4 = typeof card.last4 === "string" && /^[0-9]{4}$/.test(card.last4) ? card.last4 : null;
  const code = typeof entity.error_code === "string" && /^[A-Za-z0-9_.-]{1,80}$/.test(entity.error_code) ? entity.error_code : null;
  return {
    providerPaymentId: entity.id,
    orderRef: typeof entity.order_id === "string" ? entity.order_id : null,
    amount: typeof entity.amount === "number" && currency ? fromMinorUnits(entity.amount, currency) : null,
    currency,
    status,
    failureCode: status === "failed" ? code : null,
    method: typeof entity.method === "string" ? (METHOD[entity.method] ?? "other") : null,
    methodLast4: last4,
    paidAt: status === "succeeded" && typeof entity.created_at === "number" ? new Date(entity.created_at * 1000) : null,
  };
}

/**
 * Razorpay's vocabulary into ours. An event we do not act on, or one we cannot
 * tie to a household, is `null` — never a guess. Refund events are tied back
 * through our own payments ledger (see `resolveHousehold` in webhook.ts), so
 * they may carry an empty household id here.
 */
export function eventFromRazorpay(event: RazorpayEvent, eventId: string | null): BillingEvent | null {
  if (typeof event.event !== "string" || !eventId) return null;
  const occurredAt = new Date((typeof event.created_at === "number" ? event.created_at : 0) * 1000);
  const subscription = event.payload?.subscription?.entity;
  const paymentEntity = event.payload?.payment?.entity;
  const notes = (value: unknown) => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {});
  const text = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);
  const unix = (value: unknown) => (typeof value === "number" ? new Date(value * 1000) : null);

  const base = { providerEventId: eventId, occurredAt, intentId: null, planKey: null, periodStart: null, periodEnd: null };

  if (event.event.startsWith("subscription.")) {
    if (!subscription) return null;
    const meta = notes(subscription.notes);
    const householdId = text(meta.household_id);
    if (!householdId) return null;
    const externalRef = text(subscription.id);
    const periodStart = unix(subscription.current_start);
    const periodEnd = unix(subscription.current_end);
    const interval = meta.interval === "year" ? "year" : meta.interval === "month" ? "month" : null;
    const currency = text(meta.currency);
    const payment = paymentFrom(paymentEntity, "succeeded");
    const terms = { interval, currency, amount: payment?.amount ?? null } as const;
    // Razorpay raises an invoice for every subscription charge; the payment
    // names it. That is the household's receipt line under Billing history.
    const invoiceId = text(paymentEntity?.invoice_id);
    const invoice: LedgerInvoice | null =
      payment && invoiceId
        ? {
            providerInvoiceId: invoiceId,
            number: null,
            amount: payment.amount,
            currency: payment.currency,
            status: "paid",
            invoiceUrl: null,
            receiptUrl: null,
            periodStart,
            periodEnd,
            issuedAt: payment.paidAt ?? occurredAt,
          }
        : null;

    switch (event.event) {
      case "subscription.activated":
        return { ...base, type: "subscription.activated", householdId, externalRef, planKey: text(meta.plan_key), intentId: text(meta.intent_id), periodStart, periodEnd, terms, payment, invoice };
      case "subscription.charged": {
        // The first charge is the one that activated it: ledger only.
        const first = typeof subscription.paid_count === "number" && subscription.paid_count <= 1;
        return first
          ? { ...base, type: "payment.succeeded", householdId, externalRef, payment, invoice }
          : { ...base, type: "subscription.renewed", householdId, externalRef, periodStart, periodEnd, terms, payment, invoice };
      }
      case "subscription.pending":
      case "subscription.halted":
        // A renewal could not be charged: behind, never removed.
        return { ...base, type: "payment.failed", householdId, externalRef, payment: paymentFrom(paymentEntity, "failed") };
      case "subscription.cancelled":
      case "subscription.completed":
        return { ...base, type: "subscription.cancelled", householdId, externalRef };
      default:
        return null;
    }
  }

  if (event.event === "payment.failed") {
    const meta = notes(paymentEntity?.notes);
    const householdId = text(meta.household_id);
    const payment = paymentFrom(paymentEntity, "failed");
    if (!householdId || !payment) return null;
    return { ...base, type: "payment.attempt_failed", householdId, externalRef: null, payment };
  }

  if (event.event === "refund.processed" || event.event === "refund.failed") {
    const refund = event.payload?.refund?.entity;
    if (!refund || typeof refund.id !== "string" || typeof refund.payment_id !== "string") return null;
    const currency = typeof refund.currency === "string" ? refund.currency.toUpperCase() : null;
    if (!currency || typeof refund.amount !== "number") return null;
    return {
      ...base,
      type: event.event === "refund.processed" ? "refund.succeeded" : "refund.failed",
      // Found from our ledger by the payment it refunds.
      householdId: text(notes(refund.notes).household_id) ?? "",
      externalRef: null,
      refund: {
        providerRefundId: refund.id,
        providerPaymentId: refund.payment_id,
        amount: fromMinorUnits(refund.amount, currency),
        currency,
        status: event.event === "refund.processed" ? "succeeded" : "failed",
      },
    };
  }

  return null;
}

/** The deployment's Razorpay, or none. Every piece must be present; a half-configured provider is not a provider. */
export function razorpayFromEnv(env: Record<string, string | undefined>, fetchImpl?: Fetch): BillingProvider | null {
  const keyId = env.RAZORPAY_KEY_ID?.trim();
  const keySecret = env.RAZORPAY_KEY_SECRET?.trim();
  const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!keyId || !keySecret || !webhookSecret) return null;
  return createRazorpayProvider({ keyId, keySecret, webhookSecret, fetch: fetchImpl });
}
