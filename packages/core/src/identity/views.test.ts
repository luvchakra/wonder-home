import { describe, expect, it } from "vitest";

import { buildPersonalView } from "./views";
import type { HouseholdMembership } from "./schemas";

const household = {
  id: "h-1",
  name: "Chakraborty Home",
  timezone: "Asia/Kolkata",
  status: "active" as const,
  ownerMemberId: "m-1",
};

const membership = (over: Partial<HouseholdMembership> = {}): HouseholdMembership => ({
  household,
  memberId: "m-1",
  displayName: "Kunal",
  memberType: "adult",
  roles: ["head"],
  ...over,
});

describe("personalized views", () => {
  it("gives the head every section", () => {
    const view = buildPersonalView(membership());
    expect(view.roleLabel).toBe("Admin");
    expect(view.sections.map((s) => s.key)).toContain("manage");
    expect(view.sections.map((s) => s.key)).toContain("bills");
  });

  it("omits a child's forbidden sections from the payload rather than hiding them", () => {
    const view = buildPersonalView(
      membership({ memberId: "m-2", displayName: "Anaya", memberType: "child", roles: ["child"] }),
      "older_child",
    );

    const keys = view.sections.map((section) => section.key);
    expect(keys).not.toContain("bills");
    expect(keys).not.toContain("members");
    expect(keys).not.toContain("manage");
    // Absent, not merely styled away: nothing about finance is in the payload.
    expect(JSON.stringify(view)).not.toMatch(/bills|finance/i);
  });

  it("gives a child their own school work", () => {
    const view = buildPersonalView(
      membership({ memberType: "child", roles: ["child"] }),
      "teen",
    );
    expect(view.sections.map((s) => s.key)).toContain("school");
    expect(view.tone).toBe("child");
  });

  it("does not show an adult both school vantage points", () => {
    const keys = buildPersonalView(membership({ roles: ["adult"], memberType: "adult" })).sections.map(
      (s) => s.key,
    );
    expect(keys).toContain("school_all");
    expect(keys).not.toContain("school");
  });

  it("produces different views from the same household for different members", () => {
    const head = buildPersonalView(membership());
    const child = buildPersonalView(
      membership({ memberId: "m-2", memberType: "child", roles: ["child"] }),
    );

    expect(head.householdName).toBe(child.householdName);
    expect(head.sections.length).toBeGreaterThan(child.sections.length);
    expect(head.permissions).not.toEqual(child.permissions);
  });

  it("gives a helper the shared family context and nothing private", () => {
    const view = buildPersonalView(
      membership({ memberId: "m-3", displayName: "Sunita", memberType: "helper", roles: ["helper"] }),
    );
    expect(view.tone).toBe("helper");
    expect(view.roleLabel).toBe("Househelper");
    expect(view.sections.map((s) => s.key)).toEqual(["family_time"]);
  });

  it("labels an administrator the same as the head — both are just Admin", () => {
    expect(buildPersonalView(membership({ roles: ["administrator"] })).roleLabel).toBe("Admin");
  });

  it("reports the derived age band without storing it anywhere", () => {
    expect(buildPersonalView(membership({ memberType: "child", roles: ["child"] }), "young_child").ageBand).toBe(
      "young_child",
    );
    expect(buildPersonalView(membership()).ageBand).toBeNull();
  });
});
