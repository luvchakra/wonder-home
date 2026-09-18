import { describe, expect, it } from "vitest";

import { assessSetup, milestoneFor, setupWindow, type SetupFacts } from "./setup";

const bare: SetupFacts = {
  householdName: "Chakraborty Family",
  timezone: "Asia/Kolkata",
  members: 1,
  children: 0,
  childrenWithBirthdays: 0,
  childrenWithGuardians: 0,
  helpers: 0,
  helperAvailabilityWindows: 0,
  responsibilities: 0,
  playbookItems: 0,
  policies: 0,
  homeAssets: 0,
  pets: 0,
  obligations: 0,
  foodPreferences: 0,
  recipes: 0,
  schoolEnrolments: 0,
  familyEvents: 0,
};

const full: SetupFacts = {
  ...bare,
  members: 4,
  children: 2,
  childrenWithBirthdays: 2,
  childrenWithGuardians: 2,
  helpers: 1,
  helperAvailabilityWindows: 5,
  responsibilities: 6,
  playbookItems: 3,
  policies: 1,
  homeAssets: 2,
  obligations: 3,
  foodPreferences: 4,
  schoolEnrolments: 2,
  familyEvents: 1,
};

describe("how set up a household is", () => {
  it("a brand-new household already has its basics, so it never starts at zero", () => {
    const assessment = assessSetup(bare);

    expect(assessment.percent).toBeGreaterThan(0);
    expect(assessment.steps.find((step) => step.key === "basics")?.done).toBe(true);
    expect(assessment.complete).toBe(false);
  });

  it("reaches exactly 100% when every applicable step is done", () => {
    const assessment = assessSetup(full);

    expect(assessment).toMatchObject({ percent: 100, complete: true, milestone: "Fully set up" });
    expect(assessment.next).toEqual([]);
  });

  it("leaves out the steps that do not apply, so a household without children can be complete", () => {
    const assessment = assessSetup({
      ...full,
      children: 0,
      childrenWithBirthdays: 0,
      childrenWithGuardians: 0,
      schoolEnrolments: 0,
      helpers: 0,
      helperAvailabilityWindows: 0,
    });

    expect(assessment.steps.map((step) => step.key)).not.toContain("children");
    expect(assessment.steps.map((step) => step.key)).not.toContain("school");
    expect(assessment.steps.map((step) => step.key)).not.toContain("helper_hours");
    expect(assessment.percent).toBe(100);
  });

  it("counts a child step done only when every child is covered", () => {
    const assessment = assessSetup({ ...full, childrenWithBirthdays: 1 });

    expect(assessment.steps.find((step) => step.key === "children")?.done).toBe(false);
    expect(assessment.complete).toBe(false);
  });

  it("offers the next three undone steps, each with somewhere to go", () => {
    const assessment = assessSetup(bare);

    expect(assessment.next).toHaveLength(3);
    for (const step of assessment.next) {
      expect(step.done).toBe(false);
      expect(step.href.startsWith("/")).toBe(true);
      expect(step.why.length).toBeGreaterThan(10);
    }
  });

  it("weights the steps that unlock the most", () => {
    const people = assessSetup({ ...bare, members: 2 }).percent;
    const bills = assessSetup({ ...bare, obligations: 1 }).percent;

    expect(people).toBeGreaterThan(bills);
  });

  it("is arithmetic over facts: the same facts always give the same number", () => {
    expect(assessSetup(full)).toEqual(assessSetup({ ...full }));
  });
});

describe("milestones", () => {
  it("name where the household stands", () => {
    expect(milestoneFor(10)).toBe("Just getting started");
    expect(milestoneFor(25)).toBe("Good start");
    expect(milestoneFor(50)).toBe("Halfway there");
    expect(milestoneFor(75)).toBe("Nearly there");
    expect(milestoneFor(100)).toBe("Fully set up");
  });
});

describe("whose week it is", () => {
  const now = new Date("2026-09-18T09:00:00.000Z");

  it("a person who has never signed in is in their first week", () => {
    expect(setupWindow({ firstSeenAt: null, adminSince: null, now })).toEqual({ prominent: true, daysLeft: 7 });
  });

  it("stays prominent for seven days after the first sign-in", () => {
    const window = setupWindow({ firstSeenAt: "2026-09-15T09:00:00.000Z", adminSince: "2026-09-15T09:00:00.000Z", now });

    expect(window.prominent).toBe(true);
    expect(window.daysLeft).toBe(4);
  });

  it("goes quiet once the week has passed", () => {
    const window = setupWindow({ firstSeenAt: "2026-09-01T09:00:00.000Z", adminSince: "2026-09-01T09:00:00.000Z", now });

    expect(window).toEqual({ prominent: false, daysLeft: 0 });
  });

  it("an adult promoted to administrator later gets their own week from the promotion", () => {
    const window = setupWindow({ firstSeenAt: "2026-08-01T09:00:00.000Z", adminSince: "2026-09-17T09:00:00.000Z", now });

    expect(window.prominent).toBe(true);
    expect(window.daysLeft).toBe(6);
  });

  it("ignores a moment it cannot read rather than throwing", () => {
    const window = setupWindow({ firstSeenAt: "2026-09-17T09:00:00.000Z", adminSince: "not a date", now });

    expect(window.prominent).toBe(true);
  });
});
