import { describe, expect, it } from "vitest";

import { createRazorpayProvider, eventFromRazorpay, razorpayFromEnv, verifyRazorpaySignature } from "./razorpay";
import { hmacHex, WebhookSignatureError } from "./signature";

/** Story 20-009: Razorpay behind the same billing port as Stripe. */

const SECRET = "rzp_whsec_test";
const HOUSEHOLD = "4f1c2a3b-0000-4000-8000-000000000009";
const CREATED = 1790300000;

const subscription = (over: Record<string, unknown> = {}) => ({
  id: "sub_R1",
  plan_id: "plan_pro_inr_month",
  status: "active",
  current_start: CREATED,
  current_end: CREATED + 30 * 86400,
  paid_count: 1,
  notes: { household_id: HOUSEHOLD, plan_key: "pro", intent_id: "i-9", interval: "month", currency: "INR" },
  ...over,
});

const payment = (over: Record<string, unknown> = {}) => ({
  id: "pay_P1",
  amount: 29900,
  currency: "INR",
  status: "captured",
  method: "upi",
  order_id: "order_O1",
  created_at: CREATED,
  ...over,
});

const event = (name: string, payload: Record<string, unknown>) => ({ event: name, created_at: CREATED, payload });

describe("a Razorpay delivery is believed only once its signature verifies", () => {
  it("accepts the hex HMAC-SHA256 of the raw body, and refuses anything else", async () => {
    const body = JSON.stringify(event("subscription.activated", { subscription: { entity: subscription() } }));
    const good = await hmacHex(SECRET, body);
    await expect(verifyRazorpaySignature(body, good, SECRET)).resolves.toBeUndefined();
    await expect(verifyRazorpaySignature(body, null, SECRET)).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(verifyRazorpaySignature(`${body} `, good, SECRET)).rejects.toBeInstanceOf(WebhookSignatureError);
    await expect(verifyRazorpaySignature(body, await hmacHex("another-secret", body), SECRET)).rejects.toBeInstanceOf(WebhookSignatureError);
  });

  it("reads a verified delivery through the provider, keyed by Razorpay's event id", async () => {
    const provider = createRazorpayProvider({ keyId: "rzp_test_k", keySecret: "s", webhookSecret: SECRET });
    const body = JSON.stringify(event("subscription.activated", { subscription: { entity: subscription() }, payment: { entity: payment() } }));
    const headers = new Headers({ "x-razorpay-signature": await hmacHex(SECRET, body), "x-razorpay-event-id": "evt_R1" });
    const read = await provider.readWebhook(body, headers);
    expect(read).toMatchObject({ providerEventId: "evt_R1", type: "subscription.activated", householdId: HOUSEHOLD, planKey: "pro", intentId: "i-9" });
    await expect(provider.readWebhook(body, new Headers({ "x-razorpay-signature": "0".repeat(64), "x-razorpay-event-id": "evt_R1" }))).rejects.toBeInstanceOf(WebhookSignatureError);
  });
});

describe("Razorpay's vocabulary becomes WonderHome's", () => {
  it("activation carries the plan, the intent, the period and the terms, with the payment in major units", () => {
    const read = eventFromRazorpay(event("subscription.activated", { subscription: { entity: subscription() }, payment: { entity: payment() } }), "evt_1");
    expect(read).toMatchObject({
      type: "subscription.activated",
      externalRef: "sub_R1",
      planKey: "pro",
      intentId: "i-9",
      terms: { interval: "month", currency: "INR", amount: 299 },
      payment: { providerPaymentId: "pay_P1", amount: 299, currency: "INR", status: "succeeded", method: "upi", orderRef: "order_O1" },
    });
    expect(read?.periodEnd?.getTime()).toBe((CREATED + 30 * 86400) * 1000);
  });

  it("the first charge is ledger only; a later one is a renewal", () => {
    expect(eventFromRazorpay(event("subscription.charged", { subscription: { entity: subscription({ paid_count: 1 }) }, payment: { entity: payment() } }), "e1")).toMatchObject({ type: "payment.succeeded" });
    expect(eventFromRazorpay(event("subscription.charged", { subscription: { entity: subscription({ paid_count: 2 }) }, payment: { entity: payment({ id: "pay_P2" }) } }), "e2")).toMatchObject({
      type: "subscription.renewed",
      payment: { providerPaymentId: "pay_P2" },
    });
  });

  it("a renewal that cannot be charged falls behind; it is never cancelled on the spot", () => {
    for (const name of ["subscription.pending", "subscription.halted"]) {
      expect(eventFromRazorpay(event(name, { subscription: { entity: subscription() } }), name)).toMatchObject({ type: "payment.failed", externalRef: "sub_R1" });
    }
  });

  it("cancelled or completed ends it", () => {
    expect(eventFromRazorpay(event("subscription.cancelled", { subscription: { entity: subscription() } }), "c")).toMatchObject({ type: "subscription.cancelled" });
    expect(eventFromRazorpay(event("subscription.completed", { subscription: { entity: subscription() } }), "d")).toMatchObject({ type: "subscription.cancelled" });
  });

  it("a declined attempt is recorded, never a failed subscription, and keeps only the provider's code", () => {
    const failed = eventFromRazorpay(
      event("payment.failed", { payment: { entity: payment({ status: "failed", error_code: "BAD_REQUEST_ERROR", error_description: "Card declined for Priya", notes: { household_id: HOUSEHOLD } }) } }),
      "f",
    );
    expect(failed).toMatchObject({ type: "payment.attempt_failed", payment: { status: "failed", failureCode: "BAD_REQUEST_ERROR" } });
    expect(JSON.stringify(failed)).not.toContain("Priya");
  });

  it("a refund names its payment, and the household comes from our ledger, not the payload", () => {
    const refund = eventFromRazorpay(event("refund.processed", { refund: { entity: { id: "rfnd_1", payment_id: "pay_P1", amount: 14950, currency: "INR" } } }), "r");
    expect(refund).toMatchObject({ type: "refund.succeeded", householdId: "", refund: { providerPaymentId: "pay_P1", amount: 149.5, status: "succeeded" } });
    expect(eventFromRazorpay(event("refund.failed", { refund: { entity: { id: "rfnd_2", payment_id: "pay_P1", amount: 100, currency: "INR" } } }), "r2")).toMatchObject({ type: "refund.failed" });
  });

  it("anything it cannot tie to a household, or does not act on, is nothing — never a guess", () => {
    expect(eventFromRazorpay(event("subscription.activated", { subscription: { entity: subscription({ notes: {} }) } }), "x")).toBeNull();
    expect(eventFromRazorpay(event("subscription.activated", { subscription: { entity: subscription() } }), null)).toBeNull();
    expect(eventFromRazorpay(event("order.paid", {}), "y")).toBeNull();
    expect(eventFromRazorpay(event("payment.failed", { payment: { entity: payment({ status: "failed" }) } }), "z")).toBeNull();
  });
});

describe("the server makes every call, in Razorpay's own units", () => {
  it("a checkout is a subscription on the mapped plan, with the household and intent in its notes and a hosted link back", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const provider = createRazorpayProvider({
      keyId: "rzp_test_key",
      keySecret: "secret",
      webhookSecret: SECRET,
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        const body = url.includes("/refund") ? { id: "rfnd_9" } : url.endsWith("/subscriptions") ? { id: "sub_N", short_url: "https://rzp.io/i/abc" } : {};
        return new Response(JSON.stringify(body), { status: 200 });
      }) as unknown as typeof fetch,
    });
    const checkout = await provider.createCheckout({ intentId: "i-1", householdId: HOUSEHOLD, planKey: "pro", successUrl: "a", cancelUrl: "b", providerPlanRef: "plan_pro_inr_year", interval: "year", currency: "INR" });
    expect(checkout).toMatchObject({ providerSessionId: "sub_N", url: "https://rzp.io/i/abc" });
    const sent = JSON.parse(calls[0]!.init.body as string);
    expect(sent).toMatchObject({ plan_id: "plan_pro_inr_year", total_count: 10, notes: { household_id: HOUSEHOLD, plan_key: "pro", intent_id: "i-1", interval: "year" } });
    // The secret is only ever in the server's Authorization header.
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe(`Basic ${btoa("rzp_test_key:secret")}`);

    await provider.cancelSubscription!({ externalRef: "sub_N", atPeriodEnd: true });
    expect(calls[1]!.url).toMatch(/\/subscriptions\/sub_N\/cancel$/);
    expect(JSON.parse(calls[1]!.init.body as string)).toEqual({ cancel_at_cycle_end: 1 });

    const refund = await provider.refundPayment!({ providerPaymentId: "pay_P1", amount: 149.5, currency: "INR", idempotencyKey: "rf-2" });
    expect(refund.providerRefundId).toBe("rfnd_9");
    expect(JSON.parse(calls[2]!.init.body as string)).toMatchObject({ amount: 14950, notes: { refund_id: "rf-2" } });
  });

  it("never sells without a mapped plan, and a refused call keeps nothing of Razorpay's reply", async () => {
    const provider = createRazorpayProvider({
      keyId: "k",
      keySecret: "s",
      webhookSecret: SECRET,
      fetch: (async () => new Response(JSON.stringify({ error: { description: "card 4111 for Priya" } }), { status: 400 })) as unknown as typeof fetch,
    });
    expect(provider.sells("pro")).toBe(false);
    await expect(provider.createCheckout({ intentId: "i", householdId: HOUSEHOLD, planKey: "pro", successUrl: "a", cancelUrl: "b" })).rejects.toThrow(/No Razorpay plan/);
    await expect(provider.createCheckout({ intentId: "i", householdId: HOUSEHOLD, planKey: "pro", successUrl: "a", cancelUrl: "b", providerPlanRef: "plan_x" })).rejects.toThrow(/^Razorpay refused the request \(400\)\.$/);
  });

  it("a half-configured Razorpay is not a provider", () => {
    const full = { RAZORPAY_KEY_ID: "k", RAZORPAY_KEY_SECRET: "s", RAZORPAY_WEBHOOK_SECRET: "w" };
    expect(razorpayFromEnv(full)?.live).toBe(true);
    expect(razorpayFromEnv({ ...full, RAZORPAY_WEBHOOK_SECRET: "" })).toBeNull();
    expect(razorpayFromEnv({ ...full, RAZORPAY_KEY_SECRET: undefined })).toBeNull();
  });
});
