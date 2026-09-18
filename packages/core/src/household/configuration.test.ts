import { describe, expect, it } from "vitest";

import {
  canDependOn,
  downstreamOf,
  nextPolicyVersion,
  validatePlaybookItem,
  validateResponsibility,
  type ConfigMember,
  type ResponsibilityInput,
} from "./configuration";

const members: ConfigMember[] = [
  { id: "kunal", displayName: "Kunal", memberType: "adult" },
  { id: "priya", displayName: "Priya", memberType: "adult" },
  { id: "anaya", displayName: "Anaya", memberType: "child" },
];

const responsibility = (over: Partial<ResponsibilityInput> = {}): ResponsibilityInput => ({
  outcomeKey: "laundry.ready",
  primaryMemberId: "kunal",
  backupMemberId: "priya",
  aiMode: "prepare",
  priority: 3,
  ...over,
});

describe("assignments that hold together", () => {
  it("accepts an owner, a different backup and an autonomy level", () => {
    expect(validateResponsibility(responsibility(), members).ok).toBe(true);
  });

  it("refuses a backup who is also the owner", () => {
    const result = validateResponsibility(responsibility({ backupMemberId: "kunal" }), members);

    expect(result.ok).toBe(false);
    expect(result.problems[0]?.message).toContain("not a backup");
  });

  it("refuses a backup covering nobody", () => {
    // The row would say the outcome is unowned and simultaneously that
    // somebody covers it.
    const result = validateResponsibility(
      responsibility({ primaryMemberId: null, backupMemberId: "priya", aiMode: "observe" }),
      members,
    );

    expect(result.ok).toBe(false);
    expect(result.problems.some((problem) => problem.field === "primaryMemberId")).toBe(true);
  });

  it("refuses letting WonderHome act alone on an outcome nobody owns", () => {
    const result = validateResponsibility(
      responsibility({ primaryMemberId: null, backupMemberId: null, aiMode: "execute" }),
      members,
    );

    expect(result.ok).toBe(false);
    expect(result.problems[0]?.message).toContain("own an outcome before");
  });

  it("refuses sending approvals to nobody", () => {
    const result = validateResponsibility(
      responsibility({ primaryMemberId: null, backupMemberId: null, aiMode: "approve" }),
      members,
    );

    expect(result.ok).toBe(false);
  });

  it("allows an unowned outcome as long as WonderHome only watches it", () => {
    const result = validateResponsibility(
      responsibility({ primaryMemberId: null, backupMemberId: null, aiMode: "observe" }),
      members,
    );

    expect(result.ok).toBe(true);
  });

  it("refuses putting a child in charge of the money", () => {
    const result = validateResponsibility(
      responsibility({ outcomeKey: "finance.bills_paid", primaryMemberId: "anaya", backupMemberId: null }),
      members,
    );

    expect(result.ok).toBe(false);
    expect(result.problems[0]?.message).toContain("is a child");
  });

  it("still lets a child own something that is a child's to carry", () => {
    const result = validateResponsibility(
      responsibility({ outcomeKey: "school.homework_done", primaryMemberId: "anaya", backupMemberId: null }),
      members,
    );

    expect(result.ok).toBe(true);
  });

  it("refuses somebody who is not in this household", () => {
    const result = validateResponsibility(responsibility({ primaryMemberId: "stranger" }), members);

    expect(result.ok).toBe(false);
    expect(result.problems[0]?.message).toContain("not in this household");
  });

  it("refuses a priority outside the scale", () => {
    expect(validateResponsibility(responsibility({ priority: 9 }), members).ok).toBe(false);
  });
});

describe("a playbook entry", () => {
  const item = {
    outcomeKey: "laundry.ready",
    name: "Laundry ready",
    outcomeDefinition: "Clean uniforms ready by Sunday evening.",
    operatingWindow: { startHour: 8, endHour: 20 },
    escalateAfterHours: 12,
  };

  it("accepts an outcome described in the family's own words", () => {
    expect(validatePlaybookItem(item).ok).toBe(true);
  });

  it("refuses a key the planner could not refer to", () => {
    expect(validatePlaybookItem({ ...item, outcomeKey: "Laundry Ready!" }).ok).toBe(false);
  });

  it("refuses a definition too thin to plan against", () => {
    expect(validatePlaybookItem({ ...item, outcomeDefinition: "clean" }).ok).toBe(false);
  });

  it("refuses a window that starts and ends at the same hour", () => {
    const result = validatePlaybookItem({ ...item, operatingWindow: { startHour: 9, endHour: 9 } });

    expect(result.ok).toBe(false);
    expect(result.problems[0]?.message).toContain("not a window");
  });

  it("accepts a window that wraps past midnight", () => {
    // 10pm to 6am is a real household window — the overnight wash.
    expect(validatePlaybookItem({ ...item, operatingWindow: { startHour: 22, endHour: 6 } }).ok).toBe(true);
  });

  it("refuses escalating before any time has passed", () => {
    expect(validatePlaybookItem({ ...item, escalateAfterHours: 0 }).ok).toBe(false);
  });

  it("accepts no window and no escalation at all", () => {
    expect(validatePlaybookItem({ ...item, operatingWindow: null, escalateAfterHours: null }).ok).toBe(true);
  });
});

describe("one outcome waiting for another", () => {
  const edges = [
    { itemKey: "meals.dinner_ready", dependsOnKey: "groceries.stocked" },
    { itemKey: "groceries.stocked", dependsOnKey: "finance.bills_paid" },
  ];

  it("accepts a dependency that does not loop back", () => {
    expect(canDependOn("laundry.ready", "groceries.stocked", edges).ok).toBe(true);
  });

  it("refuses an outcome waiting for itself", () => {
    expect(canDependOn("laundry.ready", "laundry.ready", edges).ok).toBe(false);
  });

  it("refuses a direct loop", () => {
    const result = canDependOn("groceries.stocked", "meals.dinner_ready", edges);

    expect(result.ok).toBe(false);
    expect(result.problems[0]?.message).toContain("waiting for each other");
  });

  it("refuses a loop several steps long", () => {
    // finance → meals → groceries → finance
    expect(canDependOn("finance.bills_paid", "meals.dinner_ready", edges).ok).toBe(false);
  });

  it("terminates on a graph that already contains a cycle", () => {
    const looped = [
      { itemKey: "a", dependsOnKey: "b" },
      { itemKey: "b", dependsOnKey: "a" },
    ];

    expect(canDependOn("c", "a", looped).ok).toBe(true);
  });
});

describe("versioning a policy", () => {
  it("starts at one", () => {
    expect(nextPolicyVersion([])).toBe(1);
  });

  it("goes up from the highest, so an old version is never overwritten", () => {
    expect(nextPolicyVersion([1, 2, 3])).toBe(4);
    expect(nextPolicyVersion([3, 1])).toBe(4);
  });
});

describe("what a change will actually do", () => {
  it("spells out that execute means acting without asking", () => {
    const lines = downstreamOf({
      kind: "responsibility",
      outcomeKey: "laundry.ready",
      aiMode: "execute",
      owned: true,
    });

    expect(lines.join(" ")).toContain("without asking");
    // The reassurance that matters most: autonomy is not a way around policy.
    expect(lines.join(" ")).toContain("never overrides a policy");
  });

  it("says observe does nothing at all, so nobody expects suggestions", () => {
    const lines = downstreamOf({
      kind: "responsibility",
      outcomeKey: "laundry.ready",
      aiMode: "observe",
      owned: true,
    });

    expect(lines[0]).toContain("does nothing else");
  });

  it("says where things go when nobody owns the outcome", () => {
    const lines = downstreamOf({
      kind: "responsibility",
      outcomeKey: "laundry.ready",
      aiMode: "observe",
      owned: false,
    });

    expect(lines.join(" ")).toContain("Head of Family");
  });

  it("tells a household the old version of a policy survives", () => {
    const lines = downstreamOf({ kind: "policy", category: "spending", name: "Everyday", version: 3 });

    expect(lines.join(" ")).toContain("version 3");
    expect(lines.join(" ")).toContain("still knowable");
    expect(lines.join(" ")).toContain("neither a screen nor the assistant");
  });

  it("says a playbook window in hours a person recognises", () => {
    const lines = downstreamOf({
      kind: "playbook",
      name: "Laundry ready",
      window: { startHour: 8, endHour: 20 },
    });

    expect(lines.join(" ")).toContain("8am to 8pm");
  });

  it("says plainly when there is no window", () => {
    const lines = downstreamOf({ kind: "playbook", name: "Laundry ready", window: null });

    expect(lines.join(" ")).toContain("any time of day");
  });

  it("never returns an empty explanation for any change", () => {
    const changes = [
      { kind: "responsibility", outcomeKey: "a.b", aiMode: "prepare", owned: true },
      { kind: "policy", category: "privacy", name: "Kids", version: 1 },
      { kind: "playbook", name: "X", window: null },
    ] as const;

    for (const change of changes) {
      expect(downstreamOf(change).length, change.kind).toBeGreaterThan(0);
    }
  });
});
