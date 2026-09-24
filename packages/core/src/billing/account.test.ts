import { describe, expect, it } from "vitest";

import { bestYearlySaving, formatPrice, methodWords, paymentStatusWords, priceLines, type PlanTier } from "./account";
import type { PlanPrice } from "./prices";

/** Story 20-010: what the plan screens say about money, all of it arithmetic over the catalogue. */

const PLANS: PlanTier[] = [
  { key: "free", name: "Free", requiresPayment: false },
  { key: "pro", name: "Pro", requiresPayment: false },
  { key: "max", name: "Max", requiresPayment: true },
];

// The catalogue as decided: ₹299 and ₹599 a month, a year at 20% off, rounded down.
const PRICES: PlanPrice[] = [
  { id: "pm", planKey: "pro", interval: "month", currency: "INR", amount: 299 },
  { id: "py", planKey: "pro", interval: "year", currency: "INR", amount: 2870 },
  { id: "mm", planKey: "max", interval: "month", currency: "INR", amount: 599 },
  { id: "my", planKey: "max", interval: "year", currency: "INR", amount: 5750 },
];

describe("prices come from the catalogue, never from the screen", () => {
  it("a monthly line is the price itself, with no saving to claim", () => {
    const lines = priceLines(PLANS, PRICES, "month");
    expect(lines.pro).toMatchObject({ priceId: "pm", amount: 299, currency: "INR", perMonth: null, savingPercent: null });
    expect(lines.max).toMatchObject({ priceId: "mm", amount: 599 });
  });

  it("a yearly line states what it comes to per month and what it saves, both from real prices", () => {
    const lines = priceLines(PLANS, PRICES, "year");
    expect(lines.pro).toMatchObject({ priceId: "py", amount: 2870, perMonth: 239.16, savingPercent: 20 });
    expect(lines.max).toMatchObject({ priceId: "my", amount: 5750, perMonth: 479.16, savingPercent: 20 });
    expect(bestYearlySaving(PLANS, PRICES)).toBe(20);
  });

  it("a plan the catalogue does not price has no price — Free is never an invented ₹0 line", () => {
    expect(priceLines(PLANS, PRICES, "month").free).toBeNull();
    // Nor is another currency guessed from INR.
    expect(priceLines(PLANS, PRICES, "month", "USD").pro).toBeNull();
    expect(bestYearlySaving(PLANS, [])).toBeNull();
  });

  it("a priced plan that does not require payment yet is early access; one that does is not", () => {
    const lines = priceLines(PLANS, PRICES, "month");
    expect(lines.pro?.earlyAccess).toBe(true);
    expect(lines.max?.earlyAccess).toBe(false);
  });
});

describe("money reads the way a household reads it", () => {
  it("whole rupees without paise, paise when there are any", () => {
    expect(formatPrice(299, "INR")).toBe("₹299");
    expect(formatPrice(5750, "INR")).toBe("₹5,750");
    expect(formatPrice(239.16, "INR")).toBe("₹239.16");
  });

  it("a payment's state is a closed word, and a method shows four digits at most", () => {
    expect(paymentStatusWords("succeeded")).toEqual({ label: "Paid", tone: "handled" });
    expect(paymentStatusWords("failed").tone).toBe("risk");
    expect(paymentStatusWords("processing").label).toBe("Processing");
    expect(methodWords("card", "4242")).toBe("Card •••• 4242");
    expect(methodWords("upi", null)).toBe("UPI");
    expect(methodWords(null, null)).toBeNull();
  });
});
