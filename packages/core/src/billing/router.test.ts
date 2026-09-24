import { describe, expect, it } from "vitest";

import { fromMinorUnits, toMinorUnits } from "./money";
import { yearlySavingPercent, type PlanPrice } from "./prices";
import { billingProvidersFromEnv, enabledProviderNames, routingConfigFromEnv, selectPaymentProvider } from "./router";
import { canMovePayment, nextPaymentStatus, statusAfterRefunds } from "./states";

/** Story 20-009: choosing a provider, money at the boundary, and which way a payment may move. */

const config = routingConfigFromEnv({});

describe("the provider is chosen, never assumed", () => {
  it("INR or a household in India goes to Razorpay; anything else to Stripe", () => {
    expect(selectPaymentProvider({ currency: "INR", country: null, eligible: ["razorpay", "stripe"], config })).toEqual({ provider: "razorpay", reason: "india_default" });
    expect(selectPaymentProvider({ currency: "USD", country: "IN", eligible: ["razorpay", "stripe"], config })).toEqual({ provider: "razorpay", reason: "india_default" });
    expect(selectPaymentProvider({ currency: "USD", country: "US", eligible: ["razorpay", "stripe"], config })).toEqual({ provider: "stripe", reason: "international_default" });
  });

  it("a preference is honoured only where it is eligible", () => {
    expect(selectPaymentProvider({ currency: "INR", country: "IN", preferred: "stripe", eligible: ["razorpay", "stripe"], config })).toEqual({ provider: "stripe", reason: "preferred" });
    expect(selectPaymentProvider({ currency: "INR", country: "IN", preferred: "stripe", eligible: ["razorpay"], config })).toEqual({ provider: "razorpay", reason: "india_default" });
  });

  it("falls back to the only eligible provider, and to nothing — with the reason — when none is", () => {
    expect(selectPaymentProvider({ currency: "EUR", country: "DE", eligible: ["razorpay"], config })).toEqual({ provider: "razorpay", reason: "only_eligible" });
    expect(selectPaymentProvider({ currency: "INR", country: "IN", eligible: [], config })).toEqual({ provider: null, reason: "none_eligible" });
  });

  it("the defaults are the deployment's to change", () => {
    const flipped = routingConfigFromEnv({ WONDERHOME_BILLING_INDIA_PROVIDER: "stripe", WONDERHOME_BILLING_INTERNATIONAL_PROVIDER: "razorpay" });
    expect(selectPaymentProvider({ currency: "INR", country: "IN", eligible: ["razorpay", "stripe"], config: flipped }).provider).toBe("stripe");
    // Nonsense is ignored rather than trusted.
    expect(routingConfigFromEnv({ WONDERHOME_BILLING_INDIA_PROVIDER: "paypal" }).indiaProvider).toBe("razorpay");
  });

  it("a provider is on only when listed and fully configured", () => {
    const env = { WONDERHOME_BILLING_PROVIDERS: "razorpay, stripe", RAZORPAY_KEY_ID: "k", RAZORPAY_KEY_SECRET: "s", RAZORPAY_WEBHOOK_SECRET: "w" };
    expect(enabledProviderNames(env)).toEqual(["razorpay", "stripe"]);
    // Stripe listed but not configured: not a provider.
    expect(billingProvidersFromEnv(env).map((provider) => provider.name)).toEqual(["razorpay"]);
    // Configured but not listed: not a provider either.
    expect(billingProvidersFromEnv({ ...env, WONDERHOME_BILLING_PROVIDERS: "" })).toEqual([]);
    // The older single switch still works.
    expect(enabledProviderNames({ WONDERHOME_BILLING_PROVIDER: "stripe" })).toEqual(["stripe"]);
  });
});

describe("money is major units everywhere but the provider boundary", () => {
  it("converts by the currency's own exponent, without float noise", () => {
    expect(toMinorUnits(299, "INR")).toBe(29900);
    expect(toMinorUnits(19.99, "USD")).toBe(1999);
    expect(toMinorUnits(0.1 + 0.2, "USD")).toBe(30);
    expect(toMinorUnits(500, "JPY")).toBe(500);
    expect(toMinorUnits(1.234, "KWD")).toBe(1234);
    expect(fromMinorUnits(29900, "INR")).toBe(299);
    expect(fromMinorUnits(1999, "USD")).toBe(19.99);
    expect(fromMinorUnits(500, "JPY")).toBe(500);
  });

  it("a yearly saving is arithmetic over two real prices, never a claim", () => {
    const monthly: PlanPrice = { id: "m", planKey: "pro", interval: "month", currency: "INR", amount: 299 };
    const yearly: PlanPrice = { id: "y", planKey: "pro", interval: "year", currency: "INR", amount: 2870 };
    expect(yearlySavingPercent(monthly, yearly)).toBe(20);
    expect(yearlySavingPercent(monthly, { ...yearly, currency: "USD" })).toBeNull();
    expect(yearlySavingPercent(monthly, { ...yearly, amount: 3600 })).toBeNull();
    expect(yearlySavingPercent(undefined, yearly)).toBeNull();
  });
});

describe("a payment only ever moves forward", () => {
  it("a late 'processing' never undoes a success, and only a refund moves a success on", () => {
    expect(nextPaymentStatus("succeeded", "processing")).toBe("succeeded");
    expect(nextPaymentStatus("succeeded", "failed")).toBe("succeeded");
    expect(nextPaymentStatus("processing", "succeeded")).toBe("succeeded");
    expect(nextPaymentStatus("succeeded", "refunded")).toBe("refunded");
    expect(nextPaymentStatus("refunded", "succeeded")).toBe("refunded");
    expect(nextPaymentStatus(null, "failed")).toBe("failed");
    expect(canMovePayment("failed", "succeeded")).toBe(true);
    expect(canMovePayment("cancelled", "succeeded")).toBe(false);
  });

  it("refunds add up to partially, then fully, refunded", () => {
    expect(statusAfterRefunds(299, 100)).toBe("partially_refunded");
    expect(statusAfterRefunds(299, 299)).toBe("refunded");
    expect(statusAfterRefunds(299.99, 299.99)).toBe("refunded");
  });
});
