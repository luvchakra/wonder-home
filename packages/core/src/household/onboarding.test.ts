import { describe, expect, it } from "vitest";

import { validateResponsibility, type ConfigMember } from "./configuration";
import {
  clampComposition,
  completionChecklist,
  customResponsibilityKey,
  guidedQuestions,
  nextStep,
  onboardingSummary,
  previousStep,
  questionToken,
  suggestResponsibilities,
  type HouseholdProfile,
  type OnboardingFacts,
} from "./onboarding";

/** The spec's golden household: two adults, two children, a cat and a maid. */
const golden: HouseholdProfile = {
  adults: [
    { id: "kunal", name: "Kunal", relationship: "Dad", workArrangement: "office" },
    { id: "priya", name: "Priya", relationship: "Mom", workArrangement: "home" },
  ],
  children: [
    { id: "aarav", name: "Aarav", age: 10, school: null },
    { id: "anya", name: "Anya", age: 6, school: null },
  ],
  pets: [{ id: "mochi", name: "Mochi", species: "Cat" }],
  helpers: [{ id: "lata", name: "Lata", role: "Maid", workingDays: 5 }],
};

const members: ConfigMember[] = [
  { id: "kunal", displayName: "Kunal", memberType: "adult" },
  { id: "priya", displayName: "Priya", memberType: "adult" },
  { id: "aarav", displayName: "Aarav", memberType: "child" },
  { id: "anya", displayName: "Anya", memberType: "child" },
  { id: "lata", displayName: "Lata", memberType: "helper" },
];

const byKey = (list: ReturnType<typeof suggestResponsibilities>) => new Map(list.map((entry) => [entry.key, entry]));

describe("the template engine", () => {
  const suggestions = suggestResponsibilities(golden);
  const keyed = byKey(suggestions);

  it("offers every category the household has a reason for", () => {
    const categories = new Set(suggestions.map((entry) => entry.category));
    expect([...categories].sort()).toEqual(["finance", "groceries", "help", "home", "kids", "pets"]);
  });

  it("gives a maid the jobs a maid is there for, with an adult as backup", () => {
    expect(keyed.get("home.cleaning")).toMatchObject({ primaryMemberId: "lata" });
    expect(keyed.get("laundry.ready")).toMatchObject({ primaryMemberId: "lata" });
    expect(["kunal", "priya"]).toContain(keyed.get("laundry.ready")!.backupMemberId);
    // Nobody cooks unless someone was said to — Lata is a maid, not a cook.
    expect(keyed.get("meals.dinner_ready")!.primaryMemberId).not.toBe("lata");
  });

  it("never assigns by relationship: swapping Dad and Mom changes nothing", () => {
    const swapped: HouseholdProfile = {
      ...golden,
      adults: [
        { ...golden.adults[0]!, relationship: "Mom" },
        { ...golden.adults[1]!, relationship: "Dad" },
      ],
    };
    const owners = (list: ReturnType<typeof suggestResponsibilities>) => list.map((entry) => `${entry.key}:${entry.primaryMemberId}:${entry.backupMemberId}`);
    expect(owners(suggestResponsibilities(swapped))).toEqual(owners(suggestions));
  });

  it("spreads the load: neither adult owns everything", () => {
    const adultOwned = suggestions.filter((entry) => entry.primaryMemberId === "kunal" || entry.primaryMemberId === "priya");
    const kunal = adultOwned.filter((entry) => entry.primaryMemberId === "kunal").length;
    const priya = adultOwned.filter((entry) => entry.primaryMemberId === "priya").length;
    expect(Math.abs(kunal - priya)).toBeLessThanOrEqual(1);
  });

  it("gives children what fits their age, and keeps the rest with an adult", () => {
    // Aarav, 10, owns his own routine, homework, bag and room.
    for (const base of ["kids.morning_routine", "school.homework_done", "kids.school_bag", "kids.room_tidy"]) {
      expect(keyed.get(`${base}.aarav`)!.primaryMemberId).toBe("aarav");
    }
    // Anya, 6, owns her room; her homework and morning routine stay with an adult.
    expect(keyed.get("kids.room_tidy.anya")!.primaryMemberId).toBe("anya");
    expect(["kunal", "priya"]).toContain(keyed.get("school.homework_done.anya")!.primaryMemberId);
    expect(["kunal", "priya"]).toContain(keyed.get("kids.morning_routine.anya")!.primaryMemberId);
  });

  it("offers a toddler nothing to own and nothing school-shaped", () => {
    const toddler = suggestResponsibilities({ ...golden, children: [{ id: "ira", name: "Ira", age: 2, school: null }] });
    expect(toddler.filter((entry) => entry.category === "kids")).toEqual([]);
    expect(toddler.some((entry) => entry.primaryMemberId === "ira")).toBe(false);
  });

  it("never gives a child money, and every suggestion passes the same validation a person's own would", () => {
    for (const entry of suggestions) {
      expect(validateResponsibility({ outcomeKey: entry.key, primaryMemberId: entry.primaryMemberId, backupMemberId: entry.backupMemberId, aiMode: "observe", priority: 3 }, members).ok, entry.key).toBe(true);
      if (entry.adultOnly) expect(["kunal", "priya"]).toContain(entry.primaryMemberId);
    }
  });

  it("uses valid, unique outcome keys", () => {
    const keys = suggestions.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(key).toMatch(/^[a-z][a-z0-9_.]{1,60}$/);
  });

  it("does not offer what the household already has, or said no to", () => {
    const again = suggestResponsibilities(golden, { existingKeys: ["laundry.ready"], dismissed: ["home.garden", "finance.budget_reviewed"] });
    const keys = again.map((entry) => entry.key);
    expect(keys).not.toContain("laundry.ready");
    expect(keys).not.toContain("finance.budget_reviewed");
  });

  it("gives a cook the cooking and a driver the school run", () => {
    const staffed = suggestResponsibilities({ ...golden, helpers: [{ id: "ram", name: "Ram", role: "Cook", workingDays: 6 }, { id: "sunil", name: "Sunil", role: "Driver", workingDays: 6 }] });
    const keyed = byKey(staffed);
    expect(keyed.get("meals.dinner_ready")!.primaryMemberId).toBe("ram");
    expect(keyed.get("school.run")!.primaryMemberId).toBe("sunil");
  });

  it("walks a dog and cleans a cat's litter, not the other way round", () => {
    const keys = suggestResponsibilities({ ...golden, pets: [{ id: "bruno", name: "Bruno", species: "Dog" }, { id: "mochi", name: "Mochi", species: "Cat" }] }).map((entry) => entry.key);
    expect(keys).toContain("pets.walked.bruno");
    expect(keys).not.toContain("pets.litter.bruno");
    expect(keys).toContain("pets.litter.mochi");
    expect(keys).not.toContain("pets.walked.mochi");
  });

  it("a household of one still gets a sensible, owned starting point", () => {
    const single = suggestResponsibilities({ adults: [{ id: "me", name: "Me", relationship: null, workArrangement: null }], children: [], pets: [], helpers: [] });
    expect(single.length).toBeGreaterThan(0);
    expect(single.every((entry) => entry.primaryMemberId === "me" && entry.backupMemberId === null)).toBe(true);
  });
});

describe("readiness is arithmetic, and a suggestion is never 'configured'", () => {
  const composition = { adults: 2, children: 2, pets: 1, helpers: 1 };
  const pending = suggestResponsibilities(golden);
  const base: OnboardingFacts = { composition, profile: golden, responsibilityKeys: [], pending, helpersWithHours: 0 };

  it("nothing accepted yet: every responsibility area waits for review, none is ready", () => {
    const summary = onboardingSummary(base);
    const state = (area: string) => summary.rows.find((row) => row.area === area)!.state;
    expect(state("family")).toBe("ready");
    expect(state("home")).toBe("needs_review");
    expect(state("groceries")).toBe("needs_review");
    expect(state("school")).toBe("needs_info");
    expect(state("help")).toBe("needs_info");
    expect(completionChecklist(summary).find((item) => item.label === "Responsibilities added")!.done).toBe(false);
  });

  it("accepting the home suggestions makes home ready, and the percent is the weighted count", () => {
    const homeKeys = pending.filter((entry) => entry.category === "home").map((entry) => entry.key);
    const summary = onboardingSummary({ ...base, responsibilityKeys: homeKeys, pending: pending.filter((entry) => entry.category !== "home") });
    const home = summary.rows.find((row) => row.area === "home")!;
    expect(home).toMatchObject({ state: "ready", done: homeKeys.length, total: homeKeys.length });
    const expected = Math.round(
      (summary.rows.reduce((sum, row) => sum + row.weight * (row.total === 0 ? 0 : Math.min(1, row.done / row.total)), 0) /
        summary.rows.reduce((sum, row) => sum + row.weight, 0)) * 100,
    );
    expect(summary.percent).toBe(expected);
  });

  it("names people the household said it has but has not named yet", () => {
    const summary = onboardingSummary({ ...base, profile: { ...golden, children: [golden.children[0]!] } });
    expect(summary.rows.find((row) => row.area === "family")).toMatchObject({ state: "needs_info", done: 3, total: 4 });
    expect(summary.next).toMatchObject({ area: "family", step: "children" });
  });

  it("the next action is the biggest gap — here, the children's school", () => {
    const allKeys = pending.map((entry) => entry.key);
    const summary = onboardingSummary({ ...base, responsibilityKeys: allKeys, pending: [], helpersWithHours: 1 });
    expect(summary.next).toMatchObject({ area: "school", label: "Add each child's school" });
    const done = onboardingSummary({
      ...base,
      profile: { ...golden, children: golden.children.map((child) => ({ ...child, school: "Kids' School" })) },
      responsibilityKeys: allKeys,
      pending: [],
      helpersWithHours: 1,
    });
    expect(done.percent).toBe(100);
    expect(done.next).toBeNull();
    expect(completionChecklist(done).every((item) => item.done)).toBe(true);
  });

  it("a household with no children has no kids or school rows at all", () => {
    const summary = onboardingSummary({ ...base, composition: { ...composition, children: 0 }, profile: { ...golden, children: [] }, pending: suggestResponsibilities({ ...golden, children: [] }) });
    expect(summary.rows.map((row) => row.area)).not.toContain("school");
    expect(summary.rows.map((row) => row.area)).not.toContain("kids");
  });
});

describe("guided questions ask only what is missing, one useful thing at a time", () => {
  const composition = { adults: 2, children: 2, pets: 1, helpers: 1 };
  const facts: OnboardingFacts = { composition, profile: golden, responsibilityKeys: [], pending: suggestResponsibilities(golden), helpersWithHours: 0 };

  it("asks about school first when there are children without one", () => {
    const [first] = guidedQuestions(facts);
    expect(first).toMatchObject({ id: "school" });
    expect(first!.text).toContain("two children");
  });

  it("never asks again once it is answered", () => {
    const answered = guidedQuestions({
      ...facts,
      profile: { ...golden, children: golden.children.map((child) => ({ ...child, school: "Kids' School" })) },
      helpersWithHours: 1,
    });
    expect(answered.map((question) => question.id)).not.toContain("school");
    expect(answered.map((question) => question.id)).not.toContain("helper_hours");
  });

  it("'Maybe later' sets a question aside for this visit", () => {
    const questions = guidedQuestions(facts);
    const later = guidedQuestions(facts, [questionToken(questions[0]!)]);
    expect(later[0]).not.toEqual(questions[0]);
  });

  it("offers a grocery routine only while grocery suggestions wait", () => {
    const withGroceries = guidedQuestions(facts).find((question) => question.id === "accept_category" && question.category === "groceries");
    expect(withGroceries).toBeDefined();
    const none = guidedQuestions({ ...facts, pending: facts.pending.filter((entry) => entry.category !== "groceries") });
    expect(none.find((question) => question.id === "accept_category" && question.category === "groceries")).toBeUndefined();
  });
});

describe("the steps and the counts", () => {
  it("skips the children and pets steps when there is nobody to name", () => {
    const none = { adults: 1, children: 0, pets: 0, helpers: 0 };
    expect(nextStep("adults", none)).toBe("suggestions");
    expect(previousStep("suggestions", none)).toBe("adults");
    const some = { adults: 2, children: 1, pets: 0, helpers: 1 };
    expect(nextStep("adults", some)).toBe("children");
    expect(nextStep("children", some)).toBe("pets");
    expect(nextStep("summary", some)).toBe("done");
  });

  it("keeps counts within sense: at least one adult, never negative", () => {
    expect(clampComposition({ adults: 0, children: -2, pets: "3", helpers: 99 })).toEqual({ adults: 1, children: 0, pets: 3, helpers: 12 });
  });

  it("a household's own responsibility gets a key that never collides", () => {
    expect(customResponsibilityKey("Water the plants", [])).toBe("water.the.plants");
    expect(customResponsibilityKey("Water the plants", ["water.the.plants"])).toBe("water.the.plants_2");
    expect(customResponsibilityKey("Water the plants", [], "home")).toBe("home.water.the.plants");
    expect(customResponsibilityKey("Weekly sweep", [], "help")).toBe("household.help.weekly.sweep");
    expect(customResponsibilityKey("Fruit", [], "groceries")).toBe("groceries.fruit");
  });
});
