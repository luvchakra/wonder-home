import { describe, expect, it } from "vitest";

import { applyBillingEvent, FALLBACK_PLAN_KEY, type BillingEvent, type SubscriptionState } from "./provider";

/** Story 20-006: what a billing event is allowed to do to a subscription. */

const at = (iso: string) => new Date(iso);

function event(over: Partial<BillingEvent>): BillingEvent {
  return {
    providerEventId: "evt_1",
    type: "subscription.activated",
    householdId: "h-1",
    externalRef: "sub_1",
    planKey: "pro",
    periodStart: at("2026-09-01T00:00:00Z"),
    periodEnd: at("2026-10-01T00:00:00Z"),
    occurredAt: at("2026-09-01T00:00:00Z"),
    intentId: "i-1",
    ...over,
  };
}

const onPro: SubscriptionState = {
  planKey: "pro",
  status: "active",
  currentPeriodStart: at("2026-09-01T00:00:00Z"),
  currentPeriodEnd: at("2026-10-01T00:00:00Z"),
  externalRef: "sub_1",
  lastEventAt: at("2026-09-01T00:00:00Z"),
};

describe("a paid plan begins only with an activation", () => {
  it("activation moves a free household onto the plan it bought, with the provider's reference", () => {
    const decision = applyBillingEvent(null, event({}));
    expect(decision).toMatchObject({ apply: true, next: { planKey: "pro", status: "active", externalRef: "sub_1" } });
  });

  it("an activation that names no plan changes nothing", () => {
    expect(applyBillingEvent(null, event({ planKey: null })).apply).toBe(false);
  });
});

describe("renewals, failures and recovery", () => {
  it("a renewal moves the period on and keeps the plan", () => {
    const decision = applyBillingEvent(onPro, event({ type: "subscription.renewed", planKey: null, periodStart: at("2026-10-01T00:00:00Z"), periodEnd: at("2026-11-01T00:00:00Z"), occurredAt: at("2026-10-01T00:00:00Z") }));
    expect(decision).toMatchObject({ apply: true, next: { planKey: "pro", status: "active" } });
    if (decision.apply) expect(decision.next.currentPeriodEnd?.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("a failed payment keeps the plan and marks it past due — nothing is taken away", () => {
    const decision = applyBillingEvent(onPro, event({ type: "payment.failed", occurredAt: at("2026-10-01T01:00:00Z") }));
    expect(decision).toMatchObject({ apply: true, next: { planKey: "pro", status: "past_due" } });
  });

  it("a recovered payment makes it active again", () => {
    const pastDue = { ...onPro, status: "past_due" as const, lastEventAt: at("2026-10-01T01:00:00Z") };
    expect(applyBillingEvent(pastDue, event({ type: "payment.recovered", occurredAt: at("2026-10-03T00:00:00Z") }))).toMatchObject({ apply: true, next: { status: "active" } });
  });
});

describe("cancellation falls back to free, never to nothing", () => {
  it("the household lands on the free plan with no provider reference", () => {
    const decision = applyBillingEvent(onPro, event({ type: "subscription.cancelled", occurredAt: at("2026-10-05T00:00:00Z") }));
    expect(decision).toMatchObject({ apply: true, next: { planKey: FALLBACK_PLAN_KEY, status: "active", externalRef: null } });
  });
});

describe("providers deliver out of order and late; neither may rewind the truth", () => {
  it("an event older than the last one applied is ignored", () => {
    const renewed = { ...onPro, lastEventAt: at("2026-10-01T00:00:00Z") };
    const decision = applyBillingEvent(renewed, event({ type: "payment.failed", occurredAt: at("2026-09-15T00:00:00Z") }));
    expect(decision.apply).toBe(false);
  });

  it("an event about another subscription cannot touch the one on record", () => {
    for (const type of ["subscription.renewed", "payment.failed", "subscription.cancelled"] as const) {
      const decision = applyBillingEvent(onPro, event({ type, externalRef: "sub_OLD", occurredAt: at("2026-10-02T00:00:00Z") }));
      expect(decision.apply).toBe(false);
    }
  });
});
