import { describe, expect, it } from "vitest";

import { GOLDEN_SCENARIOS, evaluateAll, type ScenarioCategory } from "./evaluations";

describe("golden scenario evaluations", () => {
  it("covers every category the non-functional requirements name", () => {
    const required: ScenarioCategory[] = [
      "household_change",
      "notification_suppression",
      "child_boundary",
      "helper_privacy",
      "payment_approval",
    ];
    const covered = new Set(GOLDEN_SCENARIOS.map((scenario) => scenario.category));
    for (const category of required) {
      expect(covered, `${category} has no scenario`).toContain(category);
    }
  });

  it("decides every scenario the way the product says it should", () => {
    const failures = evaluateAll()
      .filter((result) => !result.passed)
      .map((result) => `${result.scenario.id}: expected ${result.scenario.expected}, got ${result.actual}`);

    expect(failures).toEqual([]);
  });

  it("distinguishes refusing a payment from requiring approval for one", () => {
    const results = evaluateAll(GOLDEN_SCENARIOS.filter((s) => s.category === "payment_approval"));
    const outcomes = new Set(results.map((result) => result.actual));

    // One says never; the other says not without a person. Collapsing them
    // would either block the household or authorize a child.
    expect(outcomes).toContain("refuse");
    expect(outcomes).toContain("require_approval");
  });

  it("never lets a permission alone authorize a payment unattended", () => {
    const paying = evaluateAll(GOLDEN_SCENARIOS.filter((s) => s.category === "payment_approval"));
    expect(paying.every((result) => result.actual !== "allow")).toBe(true);
  });

  it("stays silent about routine work and speaks when something is at risk", () => {
    const results = evaluateAll(
      GOLDEN_SCENARIOS.filter((s) => s.category === "notification_suppression"),
    );
    expect(results.map((r) => r.actual)).toContain("stay_silent");
    expect(results.map((r) => r.actual)).toContain("allow");
  });

  it("gives every scenario a rationale, so a later change is a discussion not a guess", () => {
    for (const scenario of GOLDEN_SCENARIOS) {
      expect(scenario.rationale.length, `${scenario.id} needs a rationale`).toBeGreaterThan(20);
    }
  });

  it("uses unique ids", () => {
    const ids = GOLDEN_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
