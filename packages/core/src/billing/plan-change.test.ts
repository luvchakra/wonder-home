import { describe, expect, it } from "vitest";

import type { PlanFeature, Subscription } from "./entitlements";
import {
  assessPlanChange,
  describePlanChange,
  needsConfirmation,
  type PlanChangeAssessment,
} from "./plan-change";

/**
 * Changing plans without losing anything (story 20-004).
 *
 * The way products break "no data loss" is not by running a DELETE. It is by
 * letting a downgrade make things unreachable and calling that "no longer
 * available". So most of what is asserted here is that a change is *described*
 * honestly before it happens, and that nothing in the assessment ever proposes
 * removing anything.
 */

function feature(key: string, overrides: Partial<PlanFeature> = {}): PlanFeature {
  return { featureKey: key, enabled: true, limitPerPeriod: null, period: "month", ...overrides };
}

function subscription(features: PlanFeature[]): Subscription {
  return {
    planKey: "pro",
    status: "active",
    features,
    currentPeriodStart: new Date("2026-09-01T00:00:00.000Z"),
  };
}

const PRO = [
  feature("conversation.text"),
  feature("school.connector"),
  feature("finance.bills"),
  feature("ai.agent_runs", { limitPerPeriod: 500 }),
];

const FREE = [
  feature("conversation.text", { limitPerPeriod: 50 }),
  feature("school.connector", { enabled: false }),
  feature("finance.bills", { enabled: false }),
  feature("ai.agent_runs", { limitPerPeriod: 10 }),
];

describe("what a downgrade does", () => {
  const assessment = assessPlanChange({
    from: subscription(PRO),
    toPlanKey: "free",
    toFeatures: FREE,
    usage: { "conversation.text": 12, "ai.agent_runs": 140 },
  });

  it("names every capability that stops", () => {
    expect(assessment.stopping.map((entry) => entry.featureKey).sort()).toEqual([
      "finance.bills",
      "school.connector",
    ]);
  });

  it("says what happens to what they already have, per capability", () => {
    // "Your data is kept" is not a thing anybody pictures. Somebody worried
    // about downgrading is picturing their bills.
    const bills = assessment.stopping.find((entry) => entry.featureKey === "finance.bills");
    expect(bills!.whatHappens).toContain("bills");
    expect(bills!.whatHappens).toContain("stay");
  });

  it("names a limit the household is already over", () => {
    const runs = assessment.exceeded.find((entry) => entry.featureKey === "ai.agent_runs");
    expect(runs).toMatchObject({ have: 140, allowed: 10 });
    expect(runs!.whatHappens).toContain("until you are back under 10");
  });

  it("does not flag a limit the household is under", () => {
    // 12 used against a new allowance of 50 is not a problem.
    expect(assessment.exceeded.map((entry) => entry.featureKey)).not.toContain("conversation.text");
  });

  it("is called a downgrade", () => {
    expect(assessment.direction).toBe("downgrade");
  });

  it("never proposes removing anything", () => {
    expect(assessment.deletesData).toBe(false);
  });
});

describe("what an upgrade does", () => {
  const assessment = assessPlanChange({
    from: subscription(FREE),
    toPlanKey: "pro",
    toFeatures: PRO,
    usage: {},
  });

  it("names what is gained and takes nothing away", () => {
    expect(assessment.gaining.map((entry) => entry.featureKey).sort()).toEqual([
      "finance.bills",
      "school.connector",
    ]);
    expect(assessment.stopping).toHaveLength(0);
    expect(assessment.exceeded).toHaveLength(0);
    expect(assessment.direction).toBe("upgrade");
  });

  it("does not need confirming", () => {
    // Nothing a household has stops working because they were given more.
    expect(needsConfirmation(assessment)).toBe(false);
  });
});

describe("a change that trades one thing for another", () => {
  it("is lateral, not an upgrade", () => {
    // Calling it an upgrade would be a sales word in a place that should
    // carry only facts.
    const assessment = assessPlanChange({
      from: subscription([feature("school.connector"), feature("commerce.orders")]),
      toPlanKey: "other",
      toFeatures: [feature("school.connector", { enabled: false }), feature("commerce.orders"), feature("meals.planning")],
      usage: {},
    });

    expect(assessment.direction).toBe("lateral");
    expect(assessment.gaining).toHaveLength(1);
    expect(assessment.stopping).toHaveLength(1);
  });

  it("is lateral when nothing changes at all", () => {
    const assessment = assessPlanChange({
      from: subscription(PRO),
      toPlanKey: "pro-renamed",
      toFeatures: PRO,
      usage: {},
    });

    expect(assessment.direction).toBe("lateral");
    expect(assessment.gaining).toHaveLength(0);
    expect(assessment.stopping).toHaveLength(0);
  });
});

describe("a household with no plan at all", () => {
  it("only ever gains", () => {
    const assessment = assessPlanChange({ from: null, toPlanKey: "free", toFeatures: FREE, usage: {} });

    expect(assessment.fromPlanKey).toBeNull();
    expect(assessment.stopping).toHaveLength(0);
    expect(assessment.gaining.length).toBeGreaterThan(0);
  });
});

describe("a limit of zero", () => {
  it("is described as none rather than as a number to get under", () => {
    const assessment = assessPlanChange({
      from: subscription([feature("ai.agent_runs", { limitPerPeriod: 100 })]),
      toPlanKey: "free",
      toFeatures: [feature("ai.agent_runs", { limitPerPeriod: 0 })],
      usage: { "ai.agent_runs": 3 },
    });

    expect(assessment.exceeded[0]!.whatHappens).toContain("allows none");
  });
});

describe("what a household reads before agreeing", () => {
  const assessment = assessPlanChange({
    from: subscription(PRO),
    toPlanKey: "free",
    toFeatures: FREE,
    usage: { "ai.agent_runs": 140 },
  });

  it("leads with what is lost", () => {
    // A downgrade screen that opens with what you keep is a screen written to
    // get somebody through it.
    const lines = describePlanChange(assessment);
    expect(lines[0]).toContain("stops");
  });

  it("always ends with the promise", () => {
    for (const each of [assessment, assessPlanChange({ from: null, toPlanKey: "free", toFeatures: FREE, usage: {} })]) {
      expect(describePlanChange(each).at(-1)).toContain("Nothing is deleted");
    }
  });

  it("says plainly when a change does nothing", () => {
    const nothing = assessPlanChange({ from: subscription(PRO), toPlanKey: "pro2", toFeatures: PRO, usage: {} });
    expect(describePlanChange(nothing).join(" ")).toContain("The plan name changes, and that is all");
  });

  it("names the numbers rather than saying 'some'", () => {
    expect(describePlanChange(assessment).join(" ")).toContain("used 140 this period");
  });
});

describe("confirmation", () => {
  const cases: [string, PlanChangeAssessment, boolean][] = [
    [
      "a capability stopping",
      assessPlanChange({ from: subscription(PRO), toPlanKey: "free", toFeatures: FREE, usage: {} }),
      true,
    ],
    [
      "a limit already exceeded",
      assessPlanChange({
        from: subscription([feature("ai.agent_runs", { limitPerPeriod: 500 })]),
        toPlanKey: "free",
        toFeatures: [feature("ai.agent_runs", { limitPerPeriod: 10 })],
        usage: { "ai.agent_runs": 140 },
      }),
      true,
    ],
    [
      "a pure upgrade",
      assessPlanChange({ from: subscription(FREE), toPlanKey: "pro", toFeatures: PRO, usage: {} }),
      false,
    ],
  ];

  for (const [name, assessment, expected] of cases) {
    it(`${expected ? "asks" : "does not ask"} about ${name}`, () => {
      expect(needsConfirmation(assessment)).toBe(expected);
    });
  }
});
