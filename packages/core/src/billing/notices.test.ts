import { describe, expect, it } from "vitest";

import { paymentNoticeFor, paymentNoticeText } from "./notices";

const PAYMENT = { id: "p1", amount: 299, currency: "INR", planKey: "pro" };

describe("payment notices come from the ledger's own moves", () => {
  it("a payment moving into success or failure is news; anything else is not", () => {
    expect(paymentNoticeFor("processing", "succeeded", PAYMENT)?.kind).toBe("payment_succeeded");
    expect(paymentNoticeFor(null, "failed", PAYMENT)?.kind).toBe("payment_failed");
    expect(paymentNoticeFor("succeeded", "succeeded", PAYMENT)).toBeNull();
    expect(paymentNoticeFor(null, "processing", PAYMENT)).toBeNull();
    expect(paymentNoticeFor("succeeded", "refunded", PAYMENT)).toBeNull();
  });

  it("says what happened in plain words, in the payment's own currency", () => {
    const paid = paymentNoticeText({ kind: "payment_succeeded", paymentId: "p1", amount: 299, currency: "INR", planKey: "pro" });
    expect(paid.title).toBe("Payment received");
    expect(paid.body).toContain("₹299");
    expect(paid.body).toContain("WonderHome Pro");
    const failed = paymentNoticeText({ kind: "payment_failed", paymentId: "p1", amount: 12.5, currency: "SGD", planKey: "max" });
    expect(failed.body).toContain("Nothing was taken");
    expect(failed.body).toMatch(/12\.50/);
    const refund = paymentNoticeText({ kind: "refund_succeeded", refundId: "r1", paymentId: "p1", amount: 100, currency: "INR" });
    expect(refund.title).toBe("Refund completed");
  });

  it("leaves the amount out rather than guess one", () => {
    expect(paymentNoticeText({ kind: "payment_failed", paymentId: "p1", amount: null, currency: null, planKey: null }).body).toBe(
      "A payment for your WonderHome plan didn't go through. Nothing was taken, and your plan stays as it is while you try again from Billing.",
    );
  });
});
