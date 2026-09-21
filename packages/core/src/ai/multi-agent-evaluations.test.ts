import { describe, expect, it } from "vitest";

import { MULTI_AGENT_SCENARIOS, evaluateMultiAgent, type MultiAgentCategory } from "./multi-agent-evaluations";

describe("multi-agent coordination evaluations", () => {
  it("covers every category story 14-007 names", () => {
    const required: MultiAgentCategory[] = [
      "cross_domain_handoff",
      "notification_suppression",
      "ambiguous_request",
      "unsafe_action",
    ];
    const covered = new Set(MULTI_AGENT_SCENARIOS.map((scenario) => scenario.category));
    for (const category of required) {
      expect(covered, `${category} has no scenario`).toContain(category);
    }
  });

  it("decides every scenario the way the real coordination and tool gate should", () => {
    const failures = evaluateMultiAgent()
      .filter((result) => !result.passed)
      .map((result) => `${result.scenario.id}: ${result.scenario.description}`);

    expect(failures).toEqual([]);
  });

  it("a cross-domain handoff produces exactly as many consolidated steps as contracts handed off", () => {
    const results = evaluateMultiAgent(MULTI_AGENT_SCENARIOS.filter((s) => s.category === "cross_domain_handoff"));
    expect(results).toHaveLength(1);
    const [result] = results;
    expect(result!.contractCount).toBeGreaterThan(0);
    expect(result!.stepCount).toBe(result!.contractCount);
  });

  it("a normal day produces an empty plan, not a plan with nothing to do", () => {
    const results = evaluateMultiAgent(MULTI_AGENT_SCENARIOS.filter((s) => s.category === "notification_suppression"));
    expect(results).toHaveLength(1);
    const [result] = results;
    expect(result!.stepCount).toBe(0);
    expect(result!.contractCount).toBe(0);
  });

  it("an unsafe action a specialist proposes is never let through unattended by the gate", () => {
    const results = evaluateMultiAgent(MULTI_AGENT_SCENARIOS.filter((s) => s.category === "unsafe_action"));
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.gateAllowedUnattended).toBe(false);
    }
  });

  it("uses unique ids", () => {
    const ids = MULTI_AGENT_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every scenario a real description, not a placeholder", () => {
    for (const scenario of MULTI_AGENT_SCENARIOS) {
      expect(scenario.description.length, `${scenario.id} needs a description`).toBeGreaterThan(20);
    }
  });
});
