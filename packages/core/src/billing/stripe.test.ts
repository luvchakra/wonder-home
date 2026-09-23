import { describe, expect, it } from "vitest";

import { createStripeProvider, eventFromStripe, stripeFromEnv, verifyStripeSignature, WebhookSignatureError } from "./stripe";

/** Story 20-006: Stripe behind the billing port — idempotent checkouts, verified webhooks. */

const SECRET = "whsec_test_secret";
const NOW = new Date("2026-09-24T10:00:00Z");

async function sign(body: string, timestamp = Math.floor(NOW.getTime() / 1000), secret = SECRET) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  const hex = [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `t=${timestamp},v1=${hex}`;
}

const HOUSEHOLD = "4f1c2a3b-0000-4000-8000-000000000001";

const completed = {
  id: "evt_checkout",
  type: "checkout.session.completed",
  created: 1790200000,
  data: { object: { mode: "subscription", subscription: "sub_123", client_reference_id: HOUSEHOLD, metadata: { household_id: HOUSEHOLD, plan_key: "pro", intent_id: "i-9" } } },
};

describe("a webhook is believed only when its signature verifies", () => {
  it("accepts the provider's signature over the exact body", async () => {
    const body = JSON.stringify(completed);
    await expect(verifyStripeSignature(body, await sign(body), SECRET, NOW)).resolves.toBeUndefined();
  });

  it("rejects a body changed after signing", async () => {
    const body = JSON.stringify(completed);
    const header = await sign(body);
    await expect(verifyStripeSignature(body.replace("pro", "max"), header, SECRET, NOW)).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it("rejects the wrong secret, a missing header and a malformed one", async () => {
    const body = JSON.stringify(completed);
    await expect(verifyStripeSignature(body, await sign(body, undefined, "whsec_other"), SECRET, NOW)).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(verifyStripeSignature(body, null, SECRET, NOW)).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(verifyStripeSignature(body, "v1=abc", SECRET, NOW)).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it("rejects a replay outside the five-minute window", async () => {
    const body = JSON.stringify(completed);
    const old = await sign(body, Math.floor(NOW.getTime() / 1000) - 301);
    await expect(verifyStripeSignature(body, old, SECRET, NOW)).rejects.toThrow(/tolerance/);
  });
});

describe("Stripe's vocabulary becomes WonderHome's", () => {
  it("a completed subscription checkout is an activation, tied to the household, plan and intent", () => {
    expect(eventFromStripe(completed)).toMatchObject({
      type: "subscription.activated",
      householdId: HOUSEHOLD,
      planKey: "pro",
      intentId: "i-9",
      externalRef: "sub_123",
      providerEventId: "evt_checkout",
    });
  });

  it("a paid renewal invoice is a renewal; a retried one that finally paid is a recovery", () => {
    const invoice = (over: object) => ({
      id: "evt_inv",
      type: "invoice.paid",
      created: 1790300000,
      data: { object: { billing_reason: "subscription_cycle", attempt_count: 1, period_start: 1790300000, period_end: 1792900000, parent: { subscription_details: { subscription: "sub_123", metadata: { household_id: HOUSEHOLD } } }, ...over } },
    });
    expect(eventFromStripe(invoice({}))).toMatchObject({ type: "subscription.renewed", externalRef: "sub_123" });
    expect(eventFromStripe(invoice({ attempt_count: 3 }))).toMatchObject({ type: "payment.recovered" });
    // The first invoice is the checkout itself.
    expect(eventFromStripe(invoice({ billing_reason: "subscription_create" }))).toBeNull();
  });

  it("reads the older API's subscription_details too", () => {
    const legacy = { id: "evt_f", type: "invoice.payment_failed", created: 1790300000, data: { object: { subscription: "sub_123", subscription_details: { metadata: { household_id: HOUSEHOLD } } } } };
    expect(eventFromStripe(legacy)).toMatchObject({ type: "payment.failed", householdId: HOUSEHOLD, externalRef: "sub_123" });
  });

  it("a deleted subscription is a cancellation", () => {
    const deleted = { id: "evt_d", type: "customer.subscription.deleted", created: 1790400000, data: { object: { id: "sub_123", metadata: { household_id: HOUSEHOLD } } } };
    expect(eventFromStripe(deleted)).toMatchObject({ type: "subscription.cancelled", externalRef: "sub_123" });
  });

  it("an event we cannot tie to a household, or do not act on, is nothing — never a guess", () => {
    expect(eventFromStripe({ ...completed, data: { object: { mode: "subscription", subscription: "sub_1", metadata: {} } } })).toBeNull();
    expect(eventFromStripe({ ...completed, data: { object: { ...completed.data.object, mode: "payment" } } })).toBeNull();
    expect(eventFromStripe({ id: "evt_x", type: "customer.created", created: 1, data: { object: {} } })).toBeNull();
  });
});

describe("a checkout retry is the same transaction", () => {
  it("the intent id is Stripe's Idempotency-Key, and the household is carried onto the subscription", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const provider = createStripeProvider({
      secretKey: "sk_test_x",
      webhookSecret: SECRET,
      prices: { pro: "price_pro" },
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1", expires_at: 1790286400 }), { status: 200 });
      }) as unknown as typeof fetch,
    });
    const request = { intentId: "i-42", householdId: HOUSEHOLD, planKey: "pro", successUrl: "https://app/settings?checkout=complete", cancelUrl: "https://app/settings?checkout=cancelled" };
    const first = await provider.createCheckout(request);
    await provider.createCheckout(request);
    expect(first).toMatchObject({ providerSessionId: "cs_1", url: "https://checkout.stripe.com/c/cs_1" });
    expect(calls.map((call) => (call.init.headers as Record<string, string>)["idempotency-key"])).toEqual(["i-42", "i-42"]);
    const form = new URLSearchParams(calls[0]!.init.body as string);
    expect(form.get("line_items[0][price]")).toBe("price_pro");
    expect(form.get("subscription_data[metadata][household_id]")).toBe(HOUSEHOLD);
    expect(form.get("metadata[intent_id]")).toBe("i-42");
  });

  it("a plan with no price is never sold through Stripe", async () => {
    const provider = createStripeProvider({ secretKey: "sk", webhookSecret: SECRET, prices: { pro: "price_pro" } });
    expect(provider.sells("max")).toBe(false);
    await expect(provider.createCheckout({ intentId: "i", householdId: HOUSEHOLD, planKey: "max", successUrl: "x", cancelUrl: "y" })).rejects.toThrow(/No Stripe price/);
  });
});

describe("a half-configured provider is not a provider", () => {
  it("needs the switch, both secrets and at least one price", () => {
    const full = { WONDERHOME_BILLING_PROVIDER: "stripe", STRIPE_SECRET_KEY: "sk", STRIPE_WEBHOOK_SECRET: "wh", STRIPE_PRICE_PRO: "price_pro" };
    expect(stripeFromEnv(full)?.sells("pro")).toBe(true);
    expect(stripeFromEnv({ ...full, WONDERHOME_BILLING_PROVIDER: undefined })).toBeNull();
    expect(stripeFromEnv({ ...full, STRIPE_WEBHOOK_SECRET: "" })).toBeNull();
    expect(stripeFromEnv({ ...full, STRIPE_PRICE_PRO: undefined })).toBeNull();
  });
});
