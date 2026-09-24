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

describe("story 20-009: ending later, ledger-only events and a plan moved at renewal", () => {
  it("a subscription set to end at the period's end keeps its plan until then, and can be taken back", () => {
    const ending = applyBillingEvent(onPro, event({ type: "subscription.cancel_scheduled", cancelAtPeriodEnd: true, occurredAt: at("2026-09-10T00:00:00Z") }));
    expect(ending).toMatchObject({ apply: true, next: { planKey: "pro", status: "active", cancelAtPeriodEnd: true } });
    const state = ending.apply ? ending.next : onPro;
    const resumed = applyBillingEvent(state, event({ type: "subscription.cancel_scheduled", cancelAtPeriodEnd: false, occurredAt: at("2026-09-11T00:00:00Z") }));
    expect(resumed).toMatchObject({ apply: true, next: { cancelAtPeriodEnd: false } });
  });

  it("a payment, a declined attempt or a refund goes to the ledger and moves nothing", () => {
    for (const type of ["payment.succeeded", "payment.attempt_failed", "refund.succeeded", "refund.failed"] as const) {
      const decision = applyBillingEvent(onPro, event({ type, occurredAt: at("2026-09-12T00:00:00Z") }));
      expect(decision.apply).toBe(false);
      expect(decision.reason).toMatch(/^Recorded/);
    }
  });

  it("a renewal that arrives on the downgraded plan makes it the plan, and clears what was scheduled", () => {
    const scheduled = { ...onPro, planKey: "max", scheduledPlanKey: "pro" };
    const decision = applyBillingEvent(scheduled, event({ type: "subscription.renewed", planKey: "pro", occurredAt: at("2026-10-01T00:00:00Z") }));
    expect(decision).toMatchObject({ apply: true, next: { planKey: "pro", scheduledPlanKey: null } });
  });

  it("activation starts with no end, no scheduled change and the terms it was bought on", () => {
    const decision = applyBillingEvent({ ...onPro, cancelAtPeriodEnd: true, scheduledPlanKey: "free" }, event({ occurredAt: at("2026-10-02T00:00:00Z"), terms: { interval: "year", currency: "INR", amount: 2870 } }));
    expect(decision).toMatchObject({ apply: true, next: { cancelAtPeriodEnd: false, scheduledPlanKey: null, terms: { interval: "year", amount: 2870 } } });
  });

  it("cancellation clears who billed it and what it cost", () => {
    const decision = applyBillingEvent({ ...onPro, provider: "razorpay", terms: { interval: "month", currency: "INR", amount: 299 } }, event({ type: "subscription.cancelled", occurredAt: at("2026-10-05T00:00:00Z") }));
    expect(decision).toMatchObject({ apply: true, next: { planKey: FALLBACK_PLAN_KEY, provider: null, terms: null } });
  });
});
