import { fromMinorUnits, toMinorUnits } from "./money";
import type { BillingEvent, BillingProvider, Checkout, CheckoutRequest, LedgerInvoice, LedgerPayment, PaymentStatus, RemotePayment } from "./provider";
import { constantTimeEqual, hmacHex, WebhookSignatureError } from "./signature";

export { WebhookSignatureError } from "./signature";

/**
 * Stripe as a billing provider (story 20-006).
 *
 * Code-complete and genuinely inert: nothing here runs until a deployment lists
 * `stripe` in `WONDERHOME_BILLING_PROVIDERS` (or the older
 * `WONDERHOME_BILLING_PROVIDER=stripe`) and sets `STRIPE_SECRET_KEY` and
 * `STRIPE_WEBHOOK_SECRET`. What it sells is either our catalogue's prices
 * mapped to Stripe prices (`payment_provider_plans`, story 20-009) or, as
 * before, a `STRIPE_PRICE_<PLAN>` per plan.
 * No session has configured those, and CLAUDE.md is explicit that a provider
 * is live only once credentials, contract behaviour and integration tests
 * exist — so `live` is true only when every one of them is present, and the
 * product never offers a checkout that goes nowhere.
 *
 * Two contract rules matter more than the API shape:
 *   - Every checkout is created with our intent id as Stripe's
 *     `Idempotency-Key`, so a retry cannot open a second transaction for the
 *     same approved intent.
 *   - A webhook is believed only after its signature verifies against the
 *     raw body, inside a five-minute window, compared in constant time.
 */

const API = "https://api.stripe.com";
export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

type Fetch = typeof fetch;

export type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  /** WonderHome plan key → Stripe price id. A plan without one is never sold through Stripe. */
  prices: Record<string, string>;
  fetch?: Fetch;
};

export function createStripeProvider(config: StripeConfig): BillingProvider {
  const doFetch = config.fetch ?? fetch;

  return {
    name: "stripe",
    // Prices come from our catalogue (`payment_provider_plans`) or, for a
    // deployment still pricing through configuration, `STRIPE_PRICE_<PLAN>`.
    live: Boolean(config.secretKey && config.webhookSecret),

    sells(planKey) {
      return Boolean(config.prices[planKey]);
    },

    async createCheckout(request: CheckoutRequest): Promise<Checkout> {
      const price = request.providerPlanRef ?? config.prices[request.planKey];
      if (!price) throw new Error(`No Stripe price is configured for plan ${request.planKey}.`);

      const form = new URLSearchParams({
        mode: "subscription",
        "line_items[0][price]": price,
        "line_items[0][quantity]": "1",
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        client_reference_id: request.householdId,
        "metadata[household_id]": request.householdId,
        "metadata[plan_key]": request.planKey,
        "metadata[intent_id]": request.intentId,
        // Carried onto the subscription so renewals, failures and
        // cancellations can be tied back to the household without a lookup.
        "subscription_data[metadata][household_id]": request.householdId,
        "subscription_data[metadata][plan_key]": request.planKey,
        ...(request.interval ? { "subscription_data[metadata][interval]": request.interval } : {}),
        ...(request.customerEmail ? { customer_email: request.customerEmail } : {}),
      });

      const response = await doFetch(`${API}/v1/checkout/sessions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.secretKey}`,
          "content-type": "application/x-www-form-urlencoded",
          "idempotency-key": request.intentId,
        },
        body: form.toString(),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Stripe refused the checkout (${response.status}).`);
      const body = (await response.json()) as { id?: unknown; url?: unknown; expires_at?: unknown };
      if (typeof body.id !== "string" || typeof body.url !== "string") throw new Error("Stripe sent a checkout we could not read.");
      return {
        providerSessionId: body.id,
        url: body.url,
        expiresAt: typeof body.expires_at === "number" ? new Date(body.expires_at * 1000) : null,
      };
    },

    async readWebhook(rawBody: string, headers: Headers, now: Date = new Date()): Promise<BillingEvent | null> {
      await verifyStripeSignature(rawBody, headers.get("stripe-signature"), config.webhookSecret, now);
      return eventFromStripe(JSON.parse(rawBody) as StripeEvent);
    },

    async cancelSubscription({ externalRef, atPeriodEnd }) {
      const path = `${API}/v1/subscriptions/${encodeURIComponent(externalRef)}`;
      const response = atPeriodEnd
        ? await doFetch(path, {
            method: "POST",
            headers: { authorization: `Bearer ${config.secretKey}`, "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ cancel_at_period_end: "true" }).toString(),
            signal: AbortSignal.timeout(10_000),
          })
        : await doFetch(path, { method: "DELETE", headers: { authorization: `Bearer ${config.secretKey}` }, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`Stripe refused the cancellation (${response.status}).`);
    },

    async refundPayment({ providerPaymentId, amount, currency, idempotencyKey }) {
      const response = await doFetch(`${API}/v1/refunds`, {
        method: "POST",
        headers: { authorization: `Bearer ${config.secretKey}`, "content-type": "application/x-www-form-urlencoded", "idempotency-key": idempotencyKey },
        body: new URLSearchParams({
          payment_intent: providerPaymentId,
          amount: String(toMinorUnits(amount, currency)),
          "metadata[refund_id]": idempotencyKey,
        }).toString(),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Stripe refused the refund (${response.status}).`);
      const body = (await response.json()) as { id?: unknown };
      if (typeof body.id !== "string") throw new Error("Stripe sent a refund we could not read.");
      return { providerRefundId: body.id };
    },

    async fetchPayment(providerPaymentId) {
      const url = `${API}/v1/payment_intents/${encodeURIComponent(providerPaymentId)}?expand[]=latest_charge`;
      const response = await doFetch(url, { headers: { authorization: `Bearer ${config.secretKey}` }, signal: AbortSignal.timeout(10_000) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Stripe refused the request (${response.status}).`);
      return stripeRemotePayment((await response.json()) as Record<string, unknown>);
    },
  };
}

/** A Stripe PaymentIntent (with its latest charge) as a status we compare with the ledger. */
export function stripeRemotePayment(intent: Record<string, unknown>): RemotePayment | null {
  const currency = typeof intent.currency === "string" ? intent.currency.toUpperCase() : null;
  const minor = typeof intent.amount === "number" ? intent.amount : null;
  if (!currency || minor === null) return null;
  const charge = intent.latest_charge && typeof intent.latest_charge === "object" ? (intent.latest_charge as Record<string, unknown>) : null;
  const refunded = typeof charge?.amount_refunded === "number" ? charge.amount_refunded : 0;
  const raw = intent.status;
  const status: PaymentStatus =
    raw === "succeeded"
      ? refunded >= minor && minor > 0
        ? "refunded"
        : refunded > 0
          ? "partially_refunded"
          : "succeeded"
      : raw === "canceled"
        ? "cancelled"
        : raw === "processing"
          ? "processing"
          : raw === "requires_action" || raw === "requires_confirmation"
            ? "requires_action"
            : raw === "requires_payment_method" && intent.last_payment_error
              ? "failed"
              : "created";
  return { status, amount: fromMinorUnits(minor, currency), currency };
}

/** `Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>]` over `${t}.${rawBody}`, HMAC-SHA256 with the endpoint secret. */
export async function verifyStripeSignature(rawBody: string, header: string | null, secret: string, now: Date = new Date()): Promise<void> {
  if (!header) throw new WebhookSignatureError("missing header");
  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value ?? "");
  if (!Number.isFinite(timestamp) || signatures.length === 0) throw new WebhookSignatureError("malformed header");
  if (Math.abs(now.getTime() / 1000 - timestamp) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) throw new WebhookSignatureError("outside the tolerance window");

  const expected = await hmacHex(secret, `${timestamp}.${rawBody}`);
  if (!signatures.some((signature) => constantTimeEqual(signature, expected))) throw new WebhookSignatureError("no signature matches");
}

type StripeObject = Record<string, unknown>;
type StripeEvent = { id?: unknown; type?: unknown; created?: unknown; data?: { object?: StripeObject } };

/**
 * Stripe's vocabulary into ours. Anything we do not act on is `null`, and an
 * event we cannot tie to a household is `null` too — never a guess.
 */
export function eventFromStripe(event: StripeEvent): BillingEvent | null {
  const object = event.data?.object;
  if (typeof event.id !== "string" || typeof event.type !== "string" || !object) return null;
  const occurredAt = new Date((typeof event.created === "number" ? event.created : 0) * 1000);
  const metadata = (value: unknown) => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {});
  const text = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);
  const unix = (value: unknown) => (typeof value === "number" ? new Date(value * 1000) : null);

  const base = { providerEventId: event.id, occurredAt, intentId: null, planKey: null, periodStart: null, periodEnd: null };

  switch (event.type) {
    case "checkout.session.completed": {
      if (object.mode !== "subscription") return null;
      const meta = metadata(object.metadata);
      const householdId = text(meta.household_id) ?? text(object.client_reference_id);
      if (!householdId) return null;
      return {
        ...base,
        type: "subscription.activated",
        householdId,
        externalRef: text(object.subscription),
        planKey: text(meta.plan_key),
        intentId: text(meta.intent_id),
        periodStart: occurredAt,
      };
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      // Where Stripe puts the subscription's metadata moved between API
      // versions; both places are read.
      const parent = metadata(metadata(object.parent).subscription_details);
      const legacy = metadata(object.subscription_details);
      const meta = { ...metadata(legacy.metadata), ...metadata(parent.metadata) };
      const householdId = text(meta.household_id);
      if (!householdId) return null;
      const subscription = text(parent.subscription) ?? text(object.subscription);
      const ledger = invoiceLedger(object, occurredAt, event.type === "invoice.paid" ? "succeeded" : "failed");
      if (event.type === "invoice.payment_failed") {
        return { ...base, type: "payment.failed", householdId, externalRef: subscription, payment: ledger.payment };
      }
      // The first invoice is the checkout itself, already applied as the
      // activation: it goes to the ledger, and moves nothing.
      if (object.billing_reason === "subscription_create") {
        return { ...base, type: "payment.succeeded", householdId, externalRef: subscription, payment: ledger.payment, invoice: ledger.invoice };
      }
      const recovered = typeof object.attempt_count === "number" && object.attempt_count > 1;
      return {
        ...base,
        type: recovered ? "payment.recovered" : "subscription.renewed",
        householdId,
        externalRef: subscription,
        periodStart: unix(object.period_start),
        periodEnd: unix(object.period_end),
        payment: ledger.payment,
        invoice: ledger.invoice,
        terms: { interval: meta.interval === "year" ? "year" : meta.interval === "month" ? "month" : null, currency: ledger.payment?.currency ?? null, amount: ledger.payment?.amount ?? null },
      };
    }
    case "customer.subscription.updated": {
      // Set to end at the period's end, or taken back. Only that is read here;
      // a plan change arrives with its renewal.
      const householdId = text(metadata(object.metadata).household_id);
      if (!householdId || typeof object.cancel_at_period_end !== "boolean") return null;
      return {
        ...base,
        type: "subscription.cancel_scheduled",
        householdId,
        externalRef: text(object.id),
        cancelAtPeriodEnd: object.cancel_at_period_end,
        periodEnd: unix(object.current_period_end) ?? unix(object.cancel_at),
      };
    }
    case "refund.updated":
    case "refund.failed": {
      const currency = text(object.currency)?.toUpperCase() ?? null;
      const paymentIntent = text(object.payment_intent);
      if (!currency || !paymentIntent || typeof object.amount !== "number") return null;
      const status = event.type === "refund.failed" || object.status === "failed" ? "failed" : object.status === "succeeded" ? "succeeded" : null;
      if (!status) return null;
      return {
        ...base,
        type: status === "succeeded" ? "refund.succeeded" : "refund.failed",
        // Found from our ledger by the payment it refunds.
        householdId: text(metadata(object.metadata).household_id) ?? "",
        externalRef: null,
        refund: { providerRefundId: String(object.id), providerPaymentId: paymentIntent, amount: fromMinorUnits(object.amount, currency), currency, status },
      };
    }
    case "customer.subscription.deleted": {
      const householdId = text(metadata(object.metadata).household_id);
      if (!householdId) return null;
      return { ...base, type: "subscription.cancelled", householdId, externalRef: text(object.id) };
    }
    default:
      return null;
  }
}

/** An invoice's payment and the invoice itself, for the ledger. Amounts back to major units. */
function invoiceLedger(invoice: StripeObject, occurredAt: Date, status: "succeeded" | "failed"): { payment: LedgerPayment | null; invoice: LedgerInvoice | null } {
  const text = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);
  const unix = (value: unknown) => (typeof value === "number" ? new Date(value * 1000) : null);
  const currency = text(invoice.currency)?.toUpperCase() ?? null;
  const minor = typeof invoice.amount_paid === "number" && status === "succeeded" ? invoice.amount_paid : typeof invoice.amount_due === "number" ? invoice.amount_due : null;
  const amount = minor !== null && currency ? fromMinorUnits(minor, currency) : null;
  const paymentId = text(invoice.payment_intent) ?? text(invoice.charge);
  const https = (value: unknown) => {
    const url = text(value);
    return url && url.startsWith("https://") ? url : null;
  };
  return {
    payment: paymentId
      ? { providerPaymentId: paymentId, orderRef: null, amount, currency, status, failureCode: null, method: null, methodLast4: null, paidAt: status === "succeeded" ? occurredAt : null }
      : null,
    invoice: text(invoice.id)
      ? {
          providerInvoiceId: text(invoice.id)!,
          number: text(invoice.number),
          amount,
          currency,
          status: status === "succeeded" ? "paid" : "open",
          invoiceUrl: https(invoice.hosted_invoice_url),
          receiptUrl: https(invoice.invoice_pdf),
          periodStart: unix(invoice.period_start),
          periodEnd: unix(invoice.period_end),
          issuedAt: unix(invoice.created) ?? occurredAt,
        }
      : null,
  };
}

/** The deployment's Stripe, or none. Every piece must be present; a half-configured provider is not a provider. */
export function stripeFromEnv(env: Record<string, string | undefined>, fetchImpl?: Fetch): BillingProvider | null {
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secretKey || !webhookSecret) return null;
  const prices: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    const match = /^STRIPE_PRICE_([A-Z][A-Z0-9_]{0,30})$/.exec(name);
    if (match && value?.trim()) prices[match[1]!.toLowerCase()] = value.trim();
  }
  return createStripeProvider({ secretKey, webhookSecret, prices, fetch: fetchImpl });
}
