import { describe, expect, it } from "vitest";

import {
  RUN_PHASES,
  advance,
  approvalFingerprint,
  approvalMatches,
  executeStep,
  isValidTransition,
  proposeLearning,
  type AgentRun,
  type PlannedStep,
  type StepContext,
} from "./orchestrator";

const run = (over: Partial<AgentRun> = {}): AgentRun => ({
  id: "r-1",
  householdId: "h-1",
  phase: "act",
  status: "running",
  steps: [
    { toolName: "outcomes.read", rationale: "See what is at risk", arguments: {} },
    { toolName: "outcomes.replan", rationale: "Move laundry later", arguments: { outcomeKey: "laundry.ready" } },
  ],
  completedSteps: 0,
  summary: "",
  ...over,
});

const context = (over: Partial<StepContext> = {}): StepContext => ({
  actor: { roles: ["head"] },
  actorHouseholdId: "h-1",
  autonomy: () => "execute",
  entitled: () => true,
  ...over,
});

const step = (over: Partial<PlannedStep> = {}): PlannedStep => ({
  toolName: "outcomes.replan",
  rationale: "Move laundry later",
  arguments: { outcomeKey: "laundry.ready", to: "sunday" },
  ...over,
});

describe("running a planned step", () => {
  it("executes a permitted step", () => {
    const { outcome } = executeStep(step(), run(), context());
    expect(outcome.kind).toBe("executed");
  });

  it("does not trust the plan about which household it is acting on", () => {
    // A plan naming another household is refused here, rather than assumed to
    // have been prevented earlier.
    const { outcome } = executeStep(step(), run({ householdId: "h-2" }), context());
    expect(outcome.kind).toBe("refused");
    expect(outcome.kind === "refused" && outcome.reason).toMatch(/not this household/i);
  });

  it("refuses a step the actor has no permission for", () => {
    const { outcome } = executeStep(
      step({ toolName: "bills.pay", arguments: {} }),
      run(),
      context({ actor: { roles: ["adult"] } }),
    );
    expect(outcome.kind).toBe("refused");
  });

  it("stops for approval rather than acting, on anything consequential", () => {
    const { outcome } = executeStep(step({ toolName: "bills.pay", arguments: {} }), run(), context());
    expect(outcome.kind).toBe("awaiting_approval");
  });
});

describe("advancing a run", () => {
  it("counts a completed step and keeps going", () => {
    const advanced = advance(run(), { kind: "executed", toolName: "outcomes.read" });
    expect(advanced.completedSteps).toBe(1);
    expect(advanced.status).toBe("running");
    expect(advanced.phase).toBe("act");
  });

  it("moves to monitoring once every step is done", () => {
    const advanced = advance(run({ completedSteps: 1 }), { kind: "executed", toolName: "outcomes.replan" });
    expect(advanced.phase).toBe("monitor");
  });

  it("stops at an approval instead of skipping ahead", () => {
    // The later steps were planned assuming this one happened; continuing would
    // act on a premise nobody agreed to.
    const advanced = advance(run(), {
      kind: "awaiting_approval",
      toolName: "bills.pay",
      reason: "Paying money always needs a person.",
    });
    expect(advanced.status).toBe("waiting_for_approval");
    expect(advanced.completedSteps).toBe(0);
  });

  it("fails the run on a refusal, and says why", () => {
    const advanced = advance(run(), {
      kind: "refused",
      toolName: "bills.pay",
      reason: "That is not this household.",
    });
    expect(advanced.status).toBe("failed");
    expect(advanced.summary).toMatch(/not this household/i);
  });
});

describe("the loop's phases", () => {
  it("covers the loop the backlog names", () => {
    expect(RUN_PHASES).toContain("observe");
    expect(RUN_PHASES).toContain("plan");
    expect(RUN_PHASES).toContain("act");
    expect(RUN_PHASES).toContain("learn");
  });

  it("will not let a run skip from observing to acting", () => {
    expect(isValidTransition("observe", "understand")).toBe(true);
    expect(isValidTransition("observe", "act")).toBe(false);
  });

  it("lets a run give up at any point", () => {
    expect(isValidTransition("observe", "done")).toBe(true);
    expect(isValidTransition("plan", "done")).toBe(true);
  });
});

describe("an approval binds to the exact action", () => {
  it("matches the step it was given for", () => {
    const fingerprint = approvalFingerprint(step());
    expect(approvalMatches(fingerprint, step())).toBe(true);
  });

  it("ignores argument order, which is not a change", () => {
    const a = approvalFingerprint(step({ arguments: { to: "sunday", outcomeKey: "laundry.ready" } }));
    const b = approvalFingerprint(step({ arguments: { outcomeKey: "laundry.ready", to: "sunday" } }));
    expect(a).toBe(b);
  });

  it("does not match a different amount", () => {
    const approved = approvalFingerprint(
      step({ toolName: "bills.pay", arguments: { bill: "electricity", amountMinor: 284000 } }),
    );
    const altered = step({ toolName: "bills.pay", arguments: { bill: "electricity", amountMinor: 999000 } });

    // Approving ₹2,840 is not approving ₹9,990.
    expect(approvalMatches(approved, altered)).toBe(false);
  });

  it("does not match a different bill", () => {
    const approved = approvalFingerprint(step({ toolName: "bills.pay", arguments: { bill: "electricity" } }));
    expect(approvalMatches(approved, step({ toolName: "bills.pay", arguments: { bill: "water" } }))).toBe(false);
  });

  it("does not match a different tool with the same arguments", () => {
    const approved = approvalFingerprint(step({ toolName: "outcomes.replan", arguments: { x: 1 } }));
    expect(approvalMatches(approved, step({ toolName: "bills.pay", arguments: { x: 1 } }))).toBe(false);
  });
});

describe("what a run may learn", () => {
  it("always records its own findings as observed", () => {
    // An agent cannot claim the household told it something.
    expect(proposeLearning({ key: "meals.dinner", value: { time: "20:00" }, confidence: 1 }).sourceType).toBe(
      "observed",
    );
  });

  it("never proposes a confirmed fact", () => {
    expect(proposeLearning({ key: "meals.dinner", value: {}, confidence: 1 }).status).toBe("learned");
  });

  it("caps its own confidence, because certainty comes from a person", () => {
    expect(proposeLearning({ key: "k", value: {}, confidence: 0.99 }).confidence).toBe(0.8);
    expect(proposeLearning({ key: "k", value: {}, confidence: 0.3 }).confidence).toBe(0.3);
  });
});
