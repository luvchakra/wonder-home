import type { BillingEvent, BillingProvider, Checkout, CheckoutRequest } from "./provider";

/**
 * Stripe as a billing provider (story 20-006).
 *
 * Code-complete and genuinely inert: nothing here runs until a deployment sets
 * `WONDERHOME_BILLING_PROVIDER=stripe`, `STRIPE_SECRET_KEY`,
 * `STRIPE_WEBHOOK_SECRET` and a `STRIPE_PRICE_<PLAN>` for each plan it sells.
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

export class WebhookSignatureError extends Error {
  constructor(reason: string) {
    super(`Webhook signature rejected: ${reason}`);
    this.name = "WebhookSignatureError";
  }
}

export function createStripeProvider(config: StripeConfig): BillingProvider {
  const doFetch = config.fetch ?? fetch;

  return {
    name: "stripe",
    live: Boolean(config.secretKey && config.webhookSecret && Object.keys(config.prices).length > 0),

    sells(planKey) {
      return Boolean(config.prices[planKey]);
    },

    async createCheckout(request: CheckoutRequest): Promise<Checkout> {
      const price = config.prices[request.planKey];
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
  };
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
      if (event.type === "invoice.payment_failed") {
        return { ...base, type: "payment.failed", householdId, externalRef: subscription };
      }
      // The first invoice is the checkout itself, already applied as the activation.
      if (object.billing_reason === "subscription_create") return null;
      const recovered = typeof object.attempt_count === "number" && object.attempt_count > 1;
      return {
        ...base,
        type: recovered ? "payment.recovered" : "subscription.renewed",
        householdId,
        externalRef: subscription,
        periodStart: unix(object.period_start),
        periodEnd: unix(object.period_end),
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

/** The deployment's Stripe, or none. Every piece must be present; a half-configured provider is not a provider. */
export function stripeFromEnv(env: Record<string, string | undefined>, fetchImpl?: Fetch): BillingProvider | null {
  if (env.WONDERHOME_BILLING_PROVIDER?.trim().toLowerCase() !== "stripe") return null;
  const secretKey = env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secretKey || !webhookSecret) return null;
  const prices: Record<string, string> = {};
  for (const [name, value] of Object.entries(env)) {
    const match = /^STRIPE_PRICE_([A-Z][A-Z0-9_]{0,30})$/.exec(name);
    if (match && value?.trim()) prices[match[1]!.toLowerCase()] = value.trim();
  }
  if (Object.keys(prices).length === 0) return null;
  return createStripeProvider({ secretKey, webhookSecret, prices, fetch: fetchImpl });
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}
