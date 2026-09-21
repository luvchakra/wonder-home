import { describe, expect, it } from "vitest";

import {
  canDependOn,
  conditionMatches,
  detectConflicts,
  downstreamOf,
  nextPolicyVersion,
  selectApplicablePolicy,
  slugifyOutcomeKey,
  validatePlaybookItem,
  validatePolicyCondition,
  validateResponsibility,
  type ConditionalPolicy,
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

describe("naming an outcome without also having to key it", () => {
  const key = /^[a-z][a-z0-9_.]{1,60}$/;

  it("turns a plain household name into the same shape a hand-typed key had", () => {
    expect(slugifyOutcomeKey("Laundry ready")).toBe("laundry.ready");
  });

  it("collapses punctuation and repeated spaces into single dots", () => {
    expect(slugifyOutcomeKey("Mom's chores!!  done")).toBe("mom.s.chores.done");
  });

  it("never produces something the planner would refuse", () => {
    for (const name of ["Laundry ready", "Mom's chores!!  done", "123", "A", "   ", "🎉🎉🎉"]) {
      expect(slugifyOutcomeKey(name)).toMatch(key);
    }
  });

  it("gives two different names two different keys", () => {
    expect(slugifyOutcomeKey("Laundry ready")).not.toBe(slugifyOutcomeKey("Dinner ready"));
  });

  it("gives the same name back the same key, so re-saving it updates rather than duplicates", () => {
    expect(slugifyOutcomeKey("Laundry ready")).toBe(slugifyOutcomeKey("Laundry ready"));
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

    expect(lines.join(" ")).toContain("household's owner");
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

describe("conflicts nothing catches at write time (02-007)", () => {
  it("finds nothing wrong with an assignment that still holds together", () => {
    expect(detectConflicts([responsibility()], members)).toEqual([]);
  });

  it("catches an owner who has since left the household", () => {
    const conflicts = detectConflicts([responsibility({ primaryMemberId: "ravi" })], members);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: "orphaned_owner", outcomeKey: "laundry.ready", memberIds: ["ravi"] });
  });

  it("catches a backup who has since left the household", () => {
    const conflicts = detectConflicts([responsibility({ backupMemberId: "ravi" })], members);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: "orphaned_backup", outcomeKey: "laundry.ready", memberIds: ["ravi"] });
  });

  it("catches a backup who is also the owner, even though a fresh save would refuse it", () => {
    // validateResponsibility blocks this at write time; this checks the
    // state as it stands, however it came to be that way.
    const conflicts = detectConflicts([responsibility({ backupMemberId: "kunal" })], members);

    expect(conflicts.some((c) => c.kind === "same_backup_as_owner")).toBe(true);
  });

  it("catches a child now owning what is not a child's to carry", () => {
    const conflicts = detectConflicts(
      [responsibility({ outcomeKey: "finance.bills_paid", primaryMemberId: "anaya", backupMemberId: null })],
      members,
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ kind: "child_owns_adult_only", memberIds: ["anaya"] });
  });

  it("catches a child backing up an adult-only outcome too", () => {
    const conflicts = detectConflicts(
      [responsibility({ outcomeKey: "finance.bills_paid", primaryMemberId: "kunal", backupMemberId: "anaya" })],
      members,
    );

    expect(conflicts.some((c) => c.kind === "child_owns_adult_only" && c.memberIds[0] === "anaya")).toBe(true);
  });

  it("never flags a child on an outcome that is a child's to carry", () => {
    const conflicts = detectConflicts(
      [responsibility({ outcomeKey: "school.homework_done", primaryMemberId: "anaya", backupMemberId: null })],
      members,
    );

    expect(conflicts).toEqual([]);
  });

  it("reports one conflict per outcome independently, across the whole household", () => {
    const conflicts = detectConflicts(
      [
        responsibility({ outcomeKey: "laundry.ready", primaryMemberId: "ravi" }),
        responsibility({ outcomeKey: "groceries.stocked" }),
        responsibility({ outcomeKey: "meals.dinner_ready", backupMemberId: "ravi" }),
      ],
      members,
    );

    expect(conflicts.map((c) => c.outcomeKey).sort()).toEqual(["laundry.ready", "meals.dinner_ready"]);
  });

  it("never reports a conflict with no resolution to offer", () => {
    const conflicts = detectConflicts(
      [
        responsibility({ primaryMemberId: "ravi" }),
        responsibility({ outcomeKey: "finance.bills_paid", primaryMemberId: "anaya", backupMemberId: null }),
      ],
      members,
    );

    expect(conflicts.length).toBeGreaterThan(0);
    for (const conflict of conflicts) {
      expect(conflict.resolution.length, conflict.kind).toBeGreaterThan(0);
    }
  });
});

describe("narrowing a policy to a specific case (02-008)", () => {
  it("accepts a well-formed hour window", () => {
    expect(validatePolicyCondition({ kind: "hour_range", startHour: 21, endHour: 7 }).ok).toBe(true);
  });

  it("refuses an hour outside the day", () => {
    expect(validatePolicyCondition({ kind: "hour_range", startHour: 21, endHour: 24 }).ok).toBe(false);
  });

  it("refuses a window that starts and ends at the same hour", () => {
    expect(validatePolicyCondition({ kind: "hour_range", startHour: 9, endHour: 9 }).ok).toBe(false);
  });

  it("accepts a member-type condition without complaint", () => {
    expect(validatePolicyCondition({ kind: "member_type", memberType: "child" }).ok).toBe(true);
  });

  describe("whether a condition holds for a moment", () => {
    it("has no condition always match, so an unconditional policy is always in play", () => {
      expect(conditionMatches(null, {})).toBe(true);
    });

    it("matches a member-type condition only for that exact type", () => {
      const condition = { kind: "member_type", memberType: "child" } as const;

      expect(conditionMatches(condition, { memberType: "child" })).toBe(true);
      expect(conditionMatches(condition, { memberType: "adult" })).toBe(false);
      expect(conditionMatches(condition, {})).toBe(false);
    });

    it("matches an hour window within the same day", () => {
      const condition = { kind: "hour_range", startHour: 9, endHour: 17 } as const;

      expect(conditionMatches(condition, { hour: 12 })).toBe(true);
      expect(conditionMatches(condition, { hour: 8 })).toBe(false);
      expect(conditionMatches(condition, { hour: 17 })).toBe(false);
    });

    it("matches an hour window that wraps past midnight", () => {
      // Quiet hours, 9pm to 7am.
      const condition = { kind: "hour_range", startHour: 21, endHour: 7 } as const;

      expect(conditionMatches(condition, { hour: 23 })).toBe(true);
      expect(conditionMatches(condition, { hour: 3 })).toBe(true);
      expect(conditionMatches(condition, { hour: 12 })).toBe(false);
    });

    it("never matches an hour window with no hour given", () => {
      expect(conditionMatches({ kind: "hour_range", startHour: 21, endHour: 7 }, {})).toBe(false);
    });
  });

  describe("choosing which policy applies", () => {
    const unconditional: ConditionalPolicy = { name: "Everyday spending", rule: { limitMinor: 200000 }, condition: null };
    const forChildren: ConditionalPolicy = {
      name: "Children's spending",
      rule: { limitMinor: 20000 },
      condition: { kind: "member_type", memberType: "child" },
    };

    it("falls back to the unconditional default when nothing more specific matches", () => {
      expect(selectApplicablePolicy([unconditional, forChildren], { memberType: "adult" })).toEqual(unconditional);
    });

    it("prefers the conditional policy that matches over the household's default", () => {
      expect(selectApplicablePolicy([unconditional, forChildren], { memberType: "child" })).toEqual(forChildren);
    });

    it("returns nothing when the household has set no policy in this category", () => {
      expect(selectApplicablePolicy([], { memberType: "adult" })).toBeNull();
    });

    it("resolves two matching conditional policies by name, so the answer never depends on array order", () => {
      const forHelpers: ConditionalPolicy = {
        name: "Aardvark's exception",
        rule: { limitMinor: 50000 },
        condition: { kind: "member_type", memberType: "child" },
      };

      const forward = selectApplicablePolicy([forChildren, forHelpers], { memberType: "child" });
      const backward = selectApplicablePolicy([forHelpers, forChildren], { memberType: "child" });

      expect(forward).toEqual(forHelpers);
      expect(backward).toEqual(forHelpers);
    });
  });

  it("says what a conditional policy is narrowed to, in the downstream effects", () => {
    const lines = downstreamOf({
      kind: "policy",
      category: "spending",
      name: "Children's spending",
      version: 1,
      condition: { kind: "member_type", memberType: "child" },
    });

    expect(lines.join(" ")).toContain("only for children");
  });

  it("says nothing extra about a condition when a policy has none", () => {
    const lines = downstreamOf({ kind: "policy", category: "spending", name: "Everyday spending", version: 1 });

    expect(lines.join(" ")).not.toContain("Applies only");
  });
});
