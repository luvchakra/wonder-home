import { describe, expect, it } from "vitest";

import { assertNoRenewingSubscription } from "./checkout";

/** Two live subscriptions would both charge: a second checkout waits until the first is set to end. */
const admin = (row: Record<string, unknown> | null) =>
  ({
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = () => Promise.resolve({ data: row, error: null });
      return chain;
    },
  }) as never;

describe("a household pays for one subscription at a time", () => {
  it("refuses a new checkout while a paid subscription still renews", async () => {
    await expect(assertNoRenewingSubscription(admin({ plan_key: "pro", external_ref: "sub_1", provider: "razorpay", cancel_at_period_end: false }), "h")).rejects.toThrow(/still renewing/);
  });

  it("allows it on Free, during early access, or once the current one is set to end", async () => {
    await expect(assertNoRenewingSubscription(admin(null), "h")).resolves.toBeUndefined();
    await expect(assertNoRenewingSubscription(admin({ plan_key: "pro", external_ref: null, provider: null, cancel_at_period_end: false }), "h")).resolves.toBeUndefined();
    await expect(assertNoRenewingSubscription(admin({ plan_key: "pro", external_ref: "sub_1", provider: "razorpay", cancel_at_period_end: true }), "h")).resolves.toBeUndefined();
  });
});
