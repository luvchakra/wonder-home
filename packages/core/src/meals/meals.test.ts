import { describe, expect, it } from "vitest";

import {
  assessMeal,
  checkPreferences,
  choosePlan,
  replanMeal,
  startBy,
  type IngredientNeed,
  type Meal,
  type PlanCandidate,
  type Preference,
  type Recipe,
} from "./meals";

const NOW = new Date("2026-09-17T12:00:00.000Z");

const recipe = (over: Partial<Recipe> = {}): Recipe => ({
  id: "paneer",
  name: "Paneer pulao",
  activeMinutes: 20,
  totalMinutes: 45,
  serves: 4,
  ...over,
});

const ingredient = (over: Partial<IngredientNeed> = {}): IngredientNeed => ({
  name: "Paneer",
  consumableId: "paneer",
  quantity: 200,
  unit: "g",
  essential: true,
  status: "have",
  ...over,
});

const meal = (over: Partial<Meal> = {}): Meal => ({
  id: "dinner-1",
  name: "Paneer pulao",
  slot: "dinner",
  onDate: "2026-09-17",
  readyBy: new Date("2026-09-17T14:00:00.000Z"),
  cookMemberId: "priya",
  status: "planned",
  readyAt: null,
  recipe: recipe(),
  ingredients: [ingredient()],
  ...over,
});

const context = { now: NOW, cookAvailable: true };

describe("when cooking has to start", () => {
  it("counts back from when the family eats, using total time not hands-on time", () => {
    expect(startBy(meal())?.toISOString()).toBe("2026-09-17T13:15:00.000Z");
  });

  it("has no answer without a recipe", () => {
    expect(startBy(meal({ recipe: null }))).toBeNull();
  });
});

describe("whether the family eats on time", () => {
  it("says nothing while there is time and everything is in", () => {
    expect(assessMeal(meal(), context).notable).toBe(false);
  });

  it("says nothing about a meal already eaten", () => {
    expect(assessMeal(meal({ status: "eaten" }), context).notable).toBe(false);
  });

  it("speaks up once the start time has passed", () => {
    const late = { now: new Date("2026-09-17T13:40:00.000Z"), cookAvailable: true };
    const assessment = assessMeal(meal(), late);

    expect(assessment.status).toBe("at_risk");
    expect(assessment.action).toEqual({ action: "start_cooking", target: "dinner-1" });
  });

  it("treats a missing essential as blocking, not as a late start", () => {
    // No amount of hurrying fixes an empty cupboard, and telling somebody to
    // start a dish they cannot make is worse than saying nothing.
    const assessment = assessMeal(meal({ ingredients: [ingredient({ status: "needed" })] }), {
      now: new Date("2026-09-17T13:40:00.000Z"),
      cookAvailable: true,
    });

    expect(assessment.status).toBe("blocked");
    expect(assessment.action).toEqual({ action: "substitute", target: "dinner-1" });
  });

  it("stays quiet while the missing thing is already on its way", () => {
    const assessment = assessMeal(meal({ ingredients: [ingredient({ status: "shopping" })] }), context);

    expect(assessment.notable).toBe(false);
  });

  it("ignores a missing garnish", () => {
    const assessment = assessMeal(
      meal({ ingredients: [ingredient(), ingredient({ name: "Coriander", essential: false, status: "needed" })] }),
      context,
    );

    expect(assessment.notable).toBe(false);
  });

  it("raises an absent cook before the clock becomes the problem", () => {
    const assessment = assessMeal(meal(), { now: NOW, cookAvailable: false });

    expect(assessment.action).toEqual({ action: "find_cook", target: "dinner-1" });
  });

  it("never asks anybody to tick off a preparation step", () => {
    const actions = [
      assessMeal(meal(), context).action,
      assessMeal(meal(), { now: new Date("2026-09-17T13:40:00.000Z"), cookAvailable: true }).action,
      assessMeal(meal({ ingredients: [ingredient({ status: "needed" })] }), context).action,
    ].map((action) => action?.action);

    expect(actions).not.toContain("mark_step_done");
    expect(actions).not.toContain("confirm_progress");
  });
});

describe("preferences", () => {
  const allergy: Preference = {
    memberId: "aarav",
    kind: "allergy",
    subject: "peanut",
    source: "member_stated",
  };
  const houseRule: Preference = {
    memberId: null,
    kind: "ethical",
    subject: "beef",
    source: "member_stated",
  };
  const dislike: Preference = {
    memberId: "anaya",
    kind: "dislike",
    subject: "mushroom",
    source: "observed",
  };

  it("rules out a dish that is unsafe for somebody eating", () => {
    const verdict = checkPreferences([{ name: "Peanut sauce" }], [allergy], ["aarav"]);

    expect(verdict).toMatchObject({ allowed: false, severity: "unsafe" });
  });

  it("ignores an allergy of somebody who is not eating", () => {
    expect(checkPreferences([{ name: "Peanut sauce" }], [allergy], ["priya"]).allowed).toBe(true);
  });

  it("applies a household rule to everybody", () => {
    expect(checkPreferences([{ name: "Beef mince" }], [houseRule], ["priya"])).toMatchObject({
      severity: "unacceptable",
    });
  });

  it("does not let one person's dislike become a house rule", () => {
    const verdict = checkPreferences([{ name: "Mushroom risotto" }], [dislike], ["anaya", "priya"]);

    // Reported, and deliberately a weaker severity than an allergy or a rule.
    expect(verdict).toMatchObject({ allowed: false, severity: "disliked" });
  });

  it("weighs an allergy above a dislike when both apply", () => {
    const verdict = checkPreferences(
      [{ name: "Peanut and mushroom stir fry" }],
      [allergy, dislike],
      ["aarav", "anaya"],
    );

    expect(verdict).toMatchObject({ severity: "unsafe" });
  });
});

describe("choosing what to cook", () => {
  const candidate = (over: Partial<PlanCandidate> = {}): PlanCandidate => ({
    recipe: recipe(),
    missingEssential: [],
    preference: { allowed: true },
    ...over,
  });

  it("cooks the quickest thing that is fully in", () => {
    const choice = choosePlan(
      [
        candidate({ recipe: recipe({ id: "slow", name: "Slow dal", activeMinutes: 40 }) }),
        candidate({ recipe: recipe({ id: "quick", name: "Quick khichdi", activeMinutes: 10 }) }),
      ],
      { minutesAvailable: 120, canShopBefore: false },
    );

    expect(choice).toMatchObject({ kind: "cook" });
    if (choice.kind !== "cook") return;
    expect(choice.recipe.id).toBe("quick");
  });

  it("sends the household shopping when there is time to shop", () => {
    const choice = choosePlan([candidate({ missingEssential: ["Paneer"] })], {
      minutesAvailable: 120,
      canShopBefore: true,
    });

    expect(choice).toMatchObject({ kind: "shop", missing: ["Paneer"] });
  });

  it("suggests a substitution when there is not", () => {
    const choice = choosePlan([candidate({ missingEssential: ["Paneer"] })], {
      minutesAvailable: 120,
      canShopBefore: false,
    });

    expect(choice).toMatchObject({ kind: "substitute" });
  });

  it("defers rather than cooking something unsafe", () => {
    const choice = choosePlan(
      [
        candidate({
          preference: { allowed: false, severity: "unsafe", because: "Contains peanut.", affects: ["aarav"] },
        }),
      ],
      { minutesAvailable: 120, canShopBefore: true },
    );

    expect(choice).toMatchObject({ kind: "defer" });
  });

  it("defers when nothing fits the time", () => {
    const choice = choosePlan([candidate({ recipe: recipe({ totalMinutes: 180 }) })], {
      minutesAvailable: 30,
      canShopBefore: true,
    });

    expect(choice.kind).toBe("defer");
    expect(choice.because).toContain("time available");
  });

  it("always names a next action", () => {
    const kinds = [
      choosePlan([candidate()], { minutesAvailable: 120, canShopBefore: false }).kind,
      choosePlan([candidate({ missingEssential: ["x"] })], { minutesAvailable: 120, canShopBefore: true }).kind,
      choosePlan([], { minutesAvailable: 120, canShopBefore: true }).kind,
    ];

    expect(kinds).toEqual(["cook", "shop", "defer"]);
  });
});

describe("replanning", () => {
  it("moves a meal when the family eats at a different time", () => {
    const moved = replanMeal(meal(), { readyByMovedTo: new Date("2026-09-17T15:00:00.000Z") });

    expect(moved).toMatchObject({ kind: "move" });
  });

  it("reassigns when the cook cannot", () => {
    expect(replanMeal(meal(), { cookUnavailable: true })).toMatchObject({ kind: "reassign" });
  });

  it("will not move protected family time on its own", () => {
    // The one dinner everybody agreed on is not the planner's to rearrange.
    expect(
      replanMeal(meal(), { protectedTime: true, readyByMovedTo: new Date("2026-09-17T16:00:00.000Z") }),
    ).toMatchObject({ kind: "ask" });
  });

  it("leaves a meal alone when nothing changed", () => {
    expect(replanMeal(meal(), {})).toMatchObject({ kind: "keep" });
  });
});
