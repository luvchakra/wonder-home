import { describe, expect, it } from "vitest";

import {
  checkEntitlement,
  featureSummary,
  periodStart,
  type PlanFeature,
  type Subscription,
} from "./entitlements";

const NOW = new Date("2026-09-17T09:00:00.000Z");

const feature = (over: Partial<PlanFeature> = {}): PlanFeature => ({
  featureKey: "ai.agent_runs",
  enabled: true,
  limitPerPeriod: 20,
  period: "month",
  ...over,
});

const subscription = (over: Partial<Subscription> = {}): Subscription => ({
  planKey: "free",
  status: "active",
  features: [feature(), feature({ featureKey: "household.outcomes", limitPerPeriod: null, period: "forever" })],
  currentPeriodStart: new Date("2026-09-01T00:00:00.000Z"),
  ...over,
});

describe("whether a household may use a feature", () => {
  it("allows an unmetered feature without counting anything", () => {
    const decision = checkEntitlement({
      subscription: subscription(),
      feature: "household.outcomes",
    });

    expect(decision).toMatchObject({ allowed: true, remaining: null });
  });

  it("allows a metered feature while the allowance holds, and says what is left", () => {
    const decision = checkEntitlement({ subscription: subscription(), feature: "ai.agent_runs", used: 5 });

    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(14);
  });

  it("refuses once the allowance is spent", () => {
    const decision = checkEntitlement({ subscription: subscription(), feature: "ai.agent_runs", used: 20 });

    expect(decision).toMatchObject({ allowed: false, code: "quota_exhausted", remaining: 0 });
  });

  it("refuses a feature the plan does not include, and says so in those terms", () => {
    const decision = checkEntitlement({ subscription: subscription(), feature: "commerce.orders" });

    expect(decision).toMatchObject({ allowed: false, code: "not_in_plan" });
    expect(decision.reason).toContain("not part of this household's plan");
  });

  it("treats a disabled feature as absent rather than as a zero allowance", () => {
    const off = subscription({ features: [feature({ enabled: false })] });

    expect(checkEntitlement({ subscription: off, feature: "ai.agent_runs" })).toMatchObject({
      code: "not_in_plan",
    });
  });

  it("distinguishes a listed-but-exhausted feature from one that was never included", () => {
    // Zero is a real allowance: the household has the feature and has used it up.
    const none = subscription({ features: [feature({ limitPerPeriod: 0 })] });

    expect(checkEntitlement({ subscription: none, feature: "ai.agent_runs" })).toMatchObject({
      code: "quota_exhausted",
    });
  });

  it("fails closed when there is no subscription at all", () => {
    expect(checkEntitlement({ subscription: null, feature: "household.outcomes" })).toMatchObject({
      allowed: false,
      code: "no_subscription",
    });
  });
});

describe("when a subscription lapses", () => {
  it("stops the metered work", () => {
    const lapsed = subscription({ status: "past_due" });

    expect(checkEntitlement({ subscription: lapsed, feature: "ai.agent_runs" })).toMatchObject({
      allowed: false,
      code: "subscription_inactive",
    });
  });

  it("leaves what the household already relies on working", () => {
    // Downgrades never delete data, and a family should not lose the outcomes
    // they depend on because a card expired.
    const lapsed = subscription({ status: "cancelled" });

    expect(checkEntitlement({ subscription: lapsed, feature: "household.outcomes" }).allowed).toBe(true);
  });
});

describe("usage periods", () => {
  it("aligns to the calendar so two households roll over together", () => {
    expect(periodStart("month", NOW).toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(periodStart("day", NOW).toISOString()).toBe("2026-09-17T00:00:00.000Z");
    expect(periodStart("year", NOW).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("gives an unmetered feature one bucket for all time", () => {
    expect(periodStart("forever", NOW).getTime()).toBe(0);
  });
});

describe("what a client may be told", () => {
  it("lists the enabled features with their limits", () => {
    const summary = featureSummary(subscription());

    expect(summary.planKey).toBe("free");
    expect(summary.features).toContainEqual({
      featureKey: "ai.agent_runs",
      label: "Background agent runs",
      limit: 20,
      period: "month",
    });
  });

  it("says nothing at all without a subscription", () => {
    expect(featureSummary(null)).toEqual({ planKey: null, features: [] });
  });
});
