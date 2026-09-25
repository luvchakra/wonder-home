import { describe, expect, it } from "vitest";

import { compareWithProvider, reconcileProvider, type LedgerEntry } from "./reconcile";
import { razorpayRemotePayment } from "./razorpay";
import { stripeRemotePayment } from "./stripe";

const PAID: LedgerEntry = { id: "p1", householdId: "h1", providerPaymentId: "pay_1", status: "succeeded", amount: 299, currency: "INR" };

describe("comparing the ledger with a provider", () => {
  it("agrees when status, amount and currency match", () => {
    expect(compareWithProvider(PAID, { status: "succeeded", amount: 299, currency: "INR" })).toBeNull();
  });

  it("names each kind of difference in closed words", () => {
    expect(compareWithProvider(PAID, null)).toBe("missing_at_provider");
    expect(compareWithProvider(PAID, { status: "succeeded", amount: 299, currency: "USD" })).toBe("currency_mismatch");
    expect(compareWithProvider(PAID, { status: "succeeded", amount: 199, currency: "INR" })).toBe("amount_mismatch");
    expect(compareWithProvider(PAID, { status: "refunded", amount: 299, currency: "INR" })).toBe("status_mismatch");
  });

  it("does not call two in-flight states a difference — that is timing", () => {
    expect(compareWithProvider({ ...PAID, status: "created" }, { status: "processing", amount: 299, currency: "INR" })).toBeNull();
    expect(compareWithProvider({ ...PAID, status: "processing" }, { status: "succeeded", amount: 299, currency: "INR" })).toBe("status_mismatch");
  });
});

describe("reading a provider's payment", () => {
  it("Razorpay: captured, partly and fully refunded, failed — in major units", () => {
    expect(razorpayRemotePayment({ status: "captured", amount: 29900, currency: "INR", amount_refunded: 0 })).toEqual({ status: "succeeded", amount: 299, currency: "INR" });
    expect(razorpayRemotePayment({ status: "captured", amount: 29900, currency: "INR", amount_refunded: 10000 })?.status).toBe("partially_refunded");
    expect(razorpayRemotePayment({ status: "refunded", amount: 29900, currency: "INR", amount_refunded: 29900 })?.status).toBe("refunded");
    expect(razorpayRemotePayment({ status: "failed", amount: 29900, currency: "INR" })?.status).toBe("failed");
    expect(razorpayRemotePayment({ status: "captured" })).toBeNull();
  });

  it("Stripe: a PaymentIntent and its latest charge", () => {
    expect(stripeRemotePayment({ status: "succeeded", amount: 1250, currency: "sgd", latest_charge: { amount_refunded: 0 } })).toEqual({ status: "succeeded", amount: 12.5, currency: "SGD" });
    expect(stripeRemotePayment({ status: "succeeded", amount: 1250, currency: "usd", latest_charge: { amount_refunded: 1250 } })?.status).toBe("refunded");
    expect(stripeRemotePayment({ status: "requires_payment_method", amount: 1250, currency: "usd", last_payment_error: { code: "card_declined" } })?.status).toBe("failed");
    expect(stripeRemotePayment({ status: "canceled", amount: 1250, currency: "usd" })?.status).toBe("cancelled");
  });
});

describe("a provider that is not configured", () => {
  it("is skipped and says so, touching nothing", async () => {
    const untouched = new Proxy({}, { get: () => { throw new Error("must not touch the database"); } });
    await expect(reconcileProvider(untouched as never, "razorpay", { provider: null })).resolves.toMatchObject({ outcome: "skipped_not_configured", checked: 0 });
  });
});
