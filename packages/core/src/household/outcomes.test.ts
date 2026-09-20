import { describe, expect, it } from "vitest";

import {
  attachDependencies,
  detectException,
  evaluateOutcome,
  planReplan,
  progressThroughWindow,
  type Outcome,
} from "./outcomes";

const at = (iso: string) => new Date(`2026-09-17T${iso}:00.000Z`);

const outcome = (over: Partial<Outcome> = {}): Outcome => ({
  id: "o-1",
  outcomeKey: "laundry.ready",
  status: "on_track",
  riskLevel: "none",
  ownerMemberId: "m-1",
  windowStart: at("08:00"),
  dueAt: at("20:00"),
  verifiedAt: null,
  verificationSource: null,
  ...over,
});

describe("evaluating an outcome", () => {
  it("says nothing when everything is normal", () => {
    const evaluation = evaluateOutcome(outcome(), at("10:00"));
    expect(evaluation.status).toBe("on_track");
    expect(evaluation.changed).toBe(false);
    // The product rule: normal routine work is silent.
    expect(evaluation.notable).toBe(false);
  });

  it("is still silent when an outcome is simply completed", () => {
    const evaluation = evaluateOutcome(
      outcome({ status: "on_track", verifiedAt: at("12:00"), verificationSource: "observed" }),
      at("13:00"),
    );
    expect(evaluation.status).toBe("met");
    expect(evaluation.changed).toBe(true);
    expect(evaluation.notable).toBe(false);
  });

  it("becomes a worry only near the end of its window", () => {
    expect(evaluateOutcome(outcome(), at("16:00")).status).toBe("on_track");
    expect(evaluateOutcome(outcome(), at("17:00")).status).toBe("at_risk");
  });

  it("escalates risk as the deadline approaches", () => {
    expect(evaluateOutcome(outcome(), at("17:00")).riskLevel).toBe("medium");
    expect(evaluateOutcome(outcome(), at("19:00")).riskLevel).toBe("high");
  });

  it("is missed once the deadline passes", () => {
    const evaluation = evaluateOutcome(outcome(), at("20:30"));
    expect(evaluation.status).toBe("missed");
    expect(evaluation.notable).toBe(true);
  });

  it("is blocked when an upstream outcome failed, and says which", () => {
    const evaluation = evaluateOutcome(
      outcome({ dependencies: [{ outcomeKey: "laundry.washed", status: "missed" }] }),
      at("10:00"),
    );
    expect(evaluation.status).toBe("blocked");
    expect(evaluation.reason).toContain("laundry.washed");
  });

  it("waits rather than worrying when a dependency is merely unfinished", () => {
    const evaluation = evaluateOutcome(
      outcome({ dependencies: [{ outcomeKey: "laundry.washed", status: "on_track" }] }),
      at("10:00"),
    );
    expect(evaluation.status).toBe("pending");
    expect(evaluation.riskLevel).toBe("low");
  });

  it("treats an outcome with no deadline as in progress, never late", () => {
    const evaluation = evaluateOutcome(outcome({ dueAt: null, windowStart: null }), at("23:00"));
    expect(evaluation.status).toBe("on_track");
  });

  it("uses a six-hour run-up when there is a deadline but no window", () => {
    const noWindow = outcome({ windowStart: null });
    expect(evaluateOutcome(noWindow, at("10:00")).status).toBe("on_track");
    expect(evaluateOutcome(noWindow, at("19:00")).status).toBe("at_risk");
  });

  it("leaves a cancelled outcome alone", () => {
    const evaluation = evaluateOutcome(outcome({ status: "cancelled" }), at("23:00"));
    expect(evaluation.status).toBe("cancelled");
    expect(evaluation.notable).toBe(false);
  });

  it("measures progress through the window, clamped at both ends", () => {
    expect(progressThroughWindow(outcome(), at("08:00"))).toBe(0);
    expect(progressThroughWindow(outcome(), at("14:00"))).toBeCloseTo(0.5, 2);
    expect(progressThroughWindow(outcome(), at("23:00"))).toBe(1);
  });
});

describe("detecting exceptions", () => {
  it("finds none while things are normal", () => {
    const normal = outcome();
    expect(detectException(normal, evaluateOutcome(normal, at("10:00")))).toBeNull();
  });

  it("gives every exception an impact and a recommended action", () => {
    const late = outcome();
    const exception = detectException(late, evaluateOutcome(late, at("21:00")));

    expect(exception?.kind).toBe("late");
    expect(exception?.impact.length).toBeGreaterThan(10);
    expect(exception?.recommendedAction.action).toBe("replan");
  });

  it("names the failed dependency, not just the blocked outcome", () => {
    const blocked = outcome({
      dependencies: [{ outcomeKey: "laundry.washed", status: "missed" }],
    });
    const exception = detectException(blocked, evaluateOutcome(blocked, at("10:00")));

    expect(exception?.kind).toBe("dependency_failed");
    expect(exception?.recommendedAction.target).toBe("laundry.washed");
  });

  it("treats an unowned outcome as an exception in its own right", () => {
    const unowned = outcome({ ownerMemberId: null });
    const exception = detectException(unowned, evaluateOutcome(unowned, at("10:00")));

    expect(exception?.kind).toBe("no_owner");
    expect(exception?.recommendedAction.action).toBe("assign_owner");
  });

  it("does not complain that a finished outcome has no owner", () => {
    const done = outcome({ ownerMemberId: null, verifiedAt: at("09:00"), verificationSource: "observed" });
    expect(detectException(done, evaluateOutcome(done, at("10:00")))).toBeNull();
  });
});

describe("replanning", () => {
  const chain: Outcome[] = [
    outcome({ id: "o-1", outcomeKey: "laundry.washed", dependencies: [] }),
    outcome({
      id: "o-2",
      outcomeKey: "laundry.dried",
      dependencies: [{ outcomeKey: "laundry.washed", status: "on_track" }],
    }),
    outcome({
      id: "o-3",
      outcomeKey: "laundry.ready",
      dependencies: [{ outcomeKey: "laundry.dried", status: "pending" }],
    }),
    outcome({ id: "o-4", outcomeKey: "dinner.served", dependencies: [] }),
  ];

  it("reaches everything downstream of a change", () => {
    const { affected } = planReplan({ outcomes: chain, changedKeys: ["laundry.washed"] });
    expect(affected.map((o) => o.outcomeKey)).toEqual([
      "laundry.washed",
      "laundry.dried",
      "laundry.ready",
    ]);
  });

  it("leaves unrelated plans alone", () => {
    const { untouched } = planReplan({ outcomes: chain, changedKeys: ["laundry.washed"] });
    // A household whose whole schedule shuffles because one thing moved has
    // been given a worse problem than the one it started with.
    expect(untouched.map((o) => o.outcomeKey)).toEqual(["dinner.served"]);
  });

  it("touches nothing when nothing changed", () => {
    const { affected, untouched } = planReplan({ outcomes: chain, changedKeys: [] });
    expect(affected).toEqual([]);
    expect(untouched).toHaveLength(4);
  });

  it("does not loop forever on a cycle", () => {
    const cyclic: Outcome[] = [
      outcome({ outcomeKey: "a", dependencies: [{ outcomeKey: "b", status: "pending" }] }),
      outcome({ outcomeKey: "b", dependencies: [{ outcomeKey: "a", status: "pending" }] }),
    ];
    const { affected } = planReplan({ outcomes: cyclic, changedKeys: ["a"] });
    expect(affected.map((o) => o.outcomeKey).sort()).toEqual(["a", "b"]);
  });
});

describe("connecting upstream and downstream outcomes (03-006)", () => {
  it("gives an outcome with no edges an empty dependency list, not nothing", () => {
    const [result] = attachDependencies([outcome({ outcomeKey: "dinner.served" })], []);
    expect(result!.dependencies).toEqual([]);
  });

  it("attaches an upstream outcome's current status", () => {
    const outcomes = [
      outcome({ outcomeKey: "laundry.washed", status: "missed" }),
      outcome({ outcomeKey: "laundry.dried" }),
    ];
    const edges = [{ itemKey: "laundry.dried", dependsOnKey: "laundry.washed" }];

    const [, dried] = attachDependencies(outcomes, edges);

    expect(dried!.dependencies).toEqual([{ outcomeKey: "laundry.washed", status: "missed" }]);
  });

  it("treats an upstream outcome with no live instance as pending, not met", () => {
    const [result] = attachDependencies(
      [outcome({ outcomeKey: "dinner.served" })],
      [{ itemKey: "dinner.served", dependsOnKey: "groceries.stocked" }],
    );

    expect(result!.dependencies).toEqual([{ outcomeKey: "groceries.stocked", status: "pending" }]);
  });

  it("attaches every edge for an outcome that waits on more than one thing", () => {
    const outcomes = [
      outcome({ outcomeKey: "groceries.stocked", status: "on_track" }),
      outcome({ outcomeKey: "cook.available", status: "met" }),
      outcome({ outcomeKey: "dinner.served" }),
    ];
    const edges = [
      { itemKey: "dinner.served", dependsOnKey: "groceries.stocked" },
      { itemKey: "dinner.served", dependsOnKey: "cook.available" },
    ];

    const [, , dinner] = attachDependencies(outcomes, edges);

    expect(dinner!.dependencies?.map((d) => d.outcomeKey).sort()).toEqual(["cook.available", "groceries.stocked"]);
  });

  it("never attaches an edge belonging to a different outcome", () => {
    const outcomes = [outcome({ outcomeKey: "laundry.washed" }), outcome({ outcomeKey: "dinner.served" })];
    const edges = [{ itemKey: "dinner.served", dependsOnKey: "groceries.stocked" }];

    const [washed] = attachDependencies(outcomes, edges);

    expect(washed!.dependencies).toEqual([]);
  });

  it("feeds straight into evaluation the same way a hand-built dependency list already did", () => {
    const outcomes = [
      outcome({ outcomeKey: "laundry.washed", status: "missed" }),
      outcome({ outcomeKey: "laundry.dried", dueAt: at("22:00") }),
    ];
    const [, dried] = attachDependencies(outcomes, [{ itemKey: "laundry.dried", dependsOnKey: "laundry.washed" }]);

    const evaluation = evaluateOutcome(dried!, at("10:00"));

    expect(evaluation.status).toBe("blocked");
    expect(evaluation.reason).toContain("laundry.washed");
  });
});
