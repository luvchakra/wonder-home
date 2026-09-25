import { slugifyOutcomeKey } from "./configuration";
import { milestoneFor } from "./setup";

/**
 * Intelligent household onboarding (story 02-009): the pure half.
 *
 * Three things live here, all deterministic and all computed from real
 * household data, so they can be tested without a database and can never
 * drift from what the household actually has:
 *
 *   1. `suggestResponsibilities` — the template engine. From who is in the
 *      household (adults and how they work, children and their ages, pets,
 *      helpers and their roles) it proposes who might own what. It never
 *      assigns by relationship ("Dad → maintenance"): owners are chosen by
 *      stated role (a cook cooks) and by availability, and the load is spread.
 *      Suggestions are not stored; accepting one writes a real responsibility.
 *   2. `onboardingSummary` — readiness, as arithmetic someone can explain:
 *      each area is a count of things done out of things there are, weighted
 *      by configurable weights. A suggestion nobody accepted never counts as
 *      configured.
 *   3. `guidedQuestions` — the one next useful question, derived from what is
 *      still missing, so a question already answered can never come back.
 *
 * AI is never the authority here. HomeTalk can explain or change any of it
 * afterwards, through the same validated writes.
 */

// ---------------------------------------------------------------------------
// The household, as setup sees it
// ---------------------------------------------------------------------------

export type WorkArrangement = "office" | "home" | "hybrid" | "not_working";

export type ProfileAdult = { id: string; name: string; relationship: string | null; workArrangement: WorkArrangement | null };
export type ProfileChild = { id: string; name: string; age: number | null; school: string | null };
export type ProfilePet = { id: string; name: string; species: string };
export type ProfileHelper = { id: string; name: string; role: string | null; workingDays: number };

export type HouseholdProfile = {
  adults: readonly ProfileAdult[];
  children: readonly ProfileChild[];
  pets: readonly ProfilePet[];
  helpers: readonly ProfileHelper[];
};

export type Composition = { adults: number; children: number; pets: number; helpers: number };

export const COMPOSITION_LIMITS: Record<keyof Composition, { min: number; max: number }> = {
  adults: { min: 1, max: 12 },
  children: { min: 0, max: 12 },
  pets: { min: 0, max: 12 },
  helpers: { min: 0, max: 12 },
};

export function clampComposition(input: Partial<Record<keyof Composition, unknown>>): Composition {
  const clamp = (key: keyof Composition) => {
    const value = Math.trunc(Number(input[key]));
    const { min, max } = COMPOSITION_LIMITS[key];
    return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
  };
  return { adults: clamp("adults"), children: clamp("children"), pets: clamp("pets"), helpers: clamp("helpers") };
}

export const ONBOARDING_STEPS = ["welcome", "basics", "overview", "adults", "children", "pets", "suggestions", "review", "summary", "guided", "done"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type OnboardingStatus = "in_progress" | "deferred" | "completed";

/** Where "Next" goes from a step: the people steps are skipped when there is nobody of that kind. */
export function nextStep(step: OnboardingStep, composition: Composition): OnboardingStep {
  const order: OnboardingStep[] = ["welcome", "basics", "overview", "adults", "children", "pets", "suggestions", "review", "summary", "done"];
  const skip = (candidate: OnboardingStep) =>
    (candidate === "children" && composition.children === 0) || (candidate === "pets" && composition.pets === 0 && composition.helpers === 0);
  let index = order.indexOf(step === "guided" ? "summary" : step);
  do index += 1;
  while (index < order.length - 1 && skip(order[index]!));
  return order[Math.min(index, order.length - 1)]!;
}

export function previousStep(step: OnboardingStep, composition: Composition): OnboardingStep {
  const order: OnboardingStep[] = ["welcome", "basics", "overview", "adults", "children", "pets", "suggestions", "review", "summary"];
  const skip = (candidate: OnboardingStep) =>
    (candidate === "children" && composition.children === 0) || (candidate === "pets" && composition.pets === 0 && composition.helpers === 0);
  let index = order.indexOf(step === "guided" || step === "done" ? "summary" : step);
  if (index <= 0) return "welcome";
  do index -= 1;
  while (index > 0 && skip(order[index]!));
  return order[index]!;
}

// ---------------------------------------------------------------------------
// The template engine
// ---------------------------------------------------------------------------

export const SUGGESTION_CATEGORIES = ["home", "kids", "groceries", "finance", "pets", "help"] as const;
export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<SuggestionCategory, string> = {
  home: "Home",
  kids: "Kids",
  groceries: "Groceries",
  finance: "Bills & Finance",
  pets: "Pets",
  help: "Household Help",
};

export type SuggestedResponsibility = {
  /** The outcome key it would be saved under — stable, so a decision about it sticks. */
  key: string;
  category: SuggestionCategory;
  title: string;
  /** What good looks like, for the playbook — in the household's words, not steps. */
  definition: string;
  frequency: string;
  primaryMemberId: string | null;
  backupMemberId: string | null;
  /** Why these owners, in one plain sentence. */
  rationale: string;
  /** 0–1: higher when it rests on something the family said (a helper's role), lower on a default. */
  confidence: number;
  /** Money and access outcomes: never a child's. */
  adultOnly: boolean;
};

type Owner = { id: string; name: string };

/** Lower is more often at home — who is likelier to have room for one more thing. */
const AVAILABILITY_RANK: Record<WorkArrangement | "unknown", number> = { not_working: 0, home: 1, hybrid: 2, unknown: 2, office: 3 };

/** A helper role, as said, to the jobs it usually covers. Only ever a starting point. */
function helperCovers(role: string | null): Set<string> {
  const said = (role ?? "").toLowerCase();
  const covers = new Set<string>();
  if (/maid|clean|house ?keep|domestic|bai/.test(said)) ["cleaning", "laundry", "dishes"].forEach((job) => covers.add(job));
  if (/cook|chef/.test(said)) covers.add("cooking");
  if (/driver|chauffeur/.test(said)) ["school_run", "errands"].forEach((job) => covers.add(job));
  if (/nanny|babysit|ayah|au pair/.test(said)) ["after_school", "kids_meals"].forEach((job) => covers.add(job));
  if (/garden|mali/.test(said)) covers.add("garden");
  if (/care ?giver|nurse|attendant/.test(said)) covers.add("care");
  return covers;
}

/** A key-safe slug of a name: "Aarav" → "aarav". */
function nameSlug(name: string): string {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return (/^[a-z]/.test(slug) ? slug : `p_${slug}`).slice(0, 20) || "p";
}

function keyFor(base: string, name?: string): string {
  return (name ? `${base}.${nameSlug(name)}` : base).slice(0, 61);
}

export function suggestResponsibilities(
  profile: HouseholdProfile,
  options: { existingKeys?: Iterable<string>; dismissed?: Iterable<string> } = {},
): SuggestedResponsibility[] {
  const adults = [...profile.adults];
  const load = new Map<string, number>(adults.map((adult) => [adult.id, 0]));
  const rank = (adult: ProfileAdult) => AVAILABILITY_RANK[adult.workArrangement ?? "unknown"];

  /** The adult with the least on their plate, the likelier-to-be-home first on a tie. */
  const pickAdult = (except: readonly (string | null)[] = []): ProfileAdult | null => {
    const candidates = adults.filter((adult) => !except.includes(adult.id));
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => (load.get(a.id)! - load.get(b.id)!) || rank(a) - rank(b) || adults.indexOf(a) - adults.indexOf(b));
    return candidates[0]!;
  };
  /** Owning something is a whole job; backing it up is half of one. */
  const assign = (adult: ProfileAdult | null, weight = 1) => {
    if (adult) load.set(adult.id, (load.get(adult.id) ?? 0) + weight);
    return adult;
  };

  const helperFor = (job: string): ProfileHelper | null => profile.helpers.find((helper) => helperCovers(helper.role).has(job)) ?? null;

  const out: SuggestedResponsibility[] = [];
  const push = (entry: Omit<SuggestedResponsibility, "adultOnly"> & { adultOnly?: boolean }) =>
    out.push({ adultOnly: false, ...entry });

  /** A household job: a helper whose role covers it, backed by an adult; else two adults sharing it. */
  const householdJob = (input: { key: string; category: SuggestionCategory; title: string; definition: string; frequency: string; job: string | null }) => {
    const helper = input.job ? helperFor(input.job) : null;
    if (helper) {
      const backup = assign(pickAdult(), 0.5);
      push({
        ...input,
        primaryMemberId: helper.id,
        backupMemberId: backup?.id ?? null,
        rationale: `${helper.name} is your ${helper.role?.toLowerCase() ?? "help"}, so this is usually part of their day${backup ? `, with ${backup.name} as backup` : ""}.`,
        confidence: 0.8,
      });
      return;
    }
    const primary = assign(pickAdult());
    const backup = pickAdult(primary ? [primary.id] : []);
    push({
      ...input,
      primaryMemberId: primary?.id ?? null,
      backupMemberId: backup?.id ?? null,
      rationale: primary
        ? `Spread across the adults so nobody carries everything${backup ? `; ${backup.name} covers when ${primary.name} can't` : ""}.`
        : "Nobody is set up to own this yet.",
      confidence: 0.6,
    });
  };

  // --- Home -----------------------------------------------------------------
  householdJob({ key: "meals.dinner_ready", category: "home", title: "Cooking meals", definition: "Dinner is on the table on time, and everyone has eaten.", frequency: "Daily", job: "cooking" });
  householdJob({ key: "home.cleaning", category: "home", title: "Cleaning", definition: "The home is clean and tidy enough that nobody has to think about it.", frequency: "Daily", job: "cleaning" });
  householdJob({ key: "laundry.ready", category: "home", title: "Laundry", definition: "Clothes are washed, dried and put away before anyone runs out.", frequency: "3 times a week", job: "laundry" });
  householdJob({ key: "home.maintenance", category: "home", title: "Home maintenance", definition: "Repairs and servicing happen before something breaks down.", frequency: "As needed", job: null });
  householdJob({ key: "home.supplies", category: "home", title: "Household supplies", definition: "Cleaning and bathroom supplies never run out.", frequency: "Weekly", job: null });
  if (helperFor("garden")) {
    householdJob({ key: "home.garden", category: "home", title: "Garden", definition: "Plants are watered and the garden is looked after.", frequency: "Daily", job: "garden" });
  }

  // --- Groceries --------------------------------------------------------------
  householdJob({ key: "groceries.stocked", category: "groceries", title: "Grocery shopping", definition: "The kitchen has what this week's meals need.", frequency: "Weekly", job: "errands" });
  householdJob({ key: "groceries.list_updated", category: "groceries", title: "Keep the grocery list up to date", definition: "Anything running low is on the list before it runs out.", frequency: "As needed", job: null });
  if (profile.children.length > 0) {
    householdJob({ key: "groceries.school_snacks", category: "groceries", title: "School snacks and tiffin supplies", definition: "There is always something for school snacks and tiffin.", frequency: "Weekly", job: null });
  }

  // --- Bills & Finance (adults only) -----------------------------------------
  const adultJob = (input: { key: string; title: string; definition: string; frequency: string }) => {
    const primary = assign(pickAdult());
    const backup = pickAdult(primary ? [primary.id] : []);
    push({
      ...input,
      category: "finance",
      primaryMemberId: primary?.id ?? null,
      backupMemberId: backup?.id ?? null,
      rationale: "Money matters stay with the adults, and are shared so both know where things stand.",
      confidence: 0.6,
      adultOnly: true,
    });
  };
  adultJob({ key: "finance.bills_paid", title: "Pay household bills", definition: "Every bill is paid on time, with no late fees.", frequency: "Monthly" });
  adultJob({ key: "finance.budget_reviewed", title: "Monthly budget check", definition: "The family knows where the money went this month.", frequency: "Monthly" });
  if (profile.children.length > 0) {
    adultJob({ key: "finance.school_fees", title: "School fees", definition: "School fees are paid before they are due.", frequency: "Per term" });
  }

  // --- Kids (age-appropriate, one per child) ---------------------------------
  for (const child of profile.children) {
    const age = child.age;
    const grownEnough = (minimum: number) => age !== null && age >= minimum;
    const supervisor = () => pickAdult();

    /** A child's own task once they are old enough, with an adult as backup; before that, an adult's. */
    const childTask = (input: { base: string; title: string; definition: string; frequency: string; ownFrom: number; offerFrom: number }) => {
      if (age !== null && age < input.offerFrom) return;
      if (grownEnough(input.ownFrom)) {
        const backup = assign(supervisor(), 0.5);
        push({
          key: keyFor(input.base, child.name),
          category: "kids",
          title: `${input.title} — ${child.name}`,
          definition: input.definition,
          frequency: input.frequency,
          primaryMemberId: child.id,
          backupMemberId: backup?.id ?? null,
          rationale: `At ${age}, ${child.name} can own this, with ${backup?.name ?? "an adult"} keeping an eye on it.`,
          confidence: 0.7,
        });
        return;
      }
      const primary = assign(supervisor());
      push({
        key: keyFor(input.base, child.name),
        category: "kids",
        title: `${input.title} — ${child.name}`,
        definition: input.definition,
        frequency: input.frequency,
        primaryMemberId: primary?.id ?? null,
        backupMemberId: null,
        rationale: age === null ? `Tell us ${child.name}'s age and this can be shared with them when they're ready.` : `At ${age}, ${child.name} still needs an adult for this.`,
        confidence: age === null ? 0.5 : 0.7,
      });
    };

    childTask({ base: "kids.morning_routine", title: "Morning routine", definition: "Up, washed, dressed and fed in time for the day.", frequency: "Daily", ownFrom: 8, offerFrom: 3 });
    childTask({ base: "school.homework_done", title: "Homework", definition: "Homework is done and checked before the next school day.", frequency: "School days", ownFrom: 9, offerFrom: 6 });
    childTask({ base: "kids.school_bag", title: "Pack school bag", definition: "The bag has everything for tomorrow, packed the night before.", frequency: "School days", ownFrom: 7, offerFrom: 5 });
    childTask({ base: "kids.room_tidy", title: "Room organization", definition: "Their room is tidy enough to find things in.", frequency: "Weekly", ownFrom: 6, offerFrom: 4 });
  }
  if (profile.children.some((child) => child.age === null || child.age >= 3)) {
    householdJob({ key: "school.run", category: "kids", title: "School drop-off and pick-up", definition: "Everyone gets to school and home again on time.", frequency: "School days", job: "school_run" });
    householdJob({ key: "kids.after_school", category: "kids", title: "After-school snacks and care", definition: "Someone is there after school, with something to eat.", frequency: "School days", job: "after_school" });
  }

  // --- Pets (one set per pet) -------------------------------------------------
  for (const pet of profile.pets) {
    const species = pet.species.toLowerCase();
    const petJob = (base: string, title: string, definition: string, frequency: string) => {
      const primary = assign(pickAdult());
      const backup = pickAdult(primary ? [primary.id] : []);
      push({
        key: keyFor(base, pet.name),
        category: "pets",
        title: `${title} — ${pet.name}`,
        definition,
        frequency,
        primaryMemberId: primary?.id ?? null,
        backupMemberId: backup?.id ?? null,
        rationale: `${pet.name} depends on someone every day, so there is always a backup.`,
        confidence: 0.6,
      });
    };
    petJob("pets.fed", "Feeding", "Fed on time, with fresh water, every day.", "Daily");
    if (/dog|puppy/.test(species)) petJob("pets.walked", "Walks", "Walked every day, morning and evening.", "Daily");
    if (/cat|kitten/.test(species)) petJob("pets.litter", "Litter box", "The litter box is clean.", "Daily");
    petJob("pets.vet", "Vet visits and vaccinations", "Vaccinations and check-ups happen on time.", "As needed");
  }

  // --- Household help ---------------------------------------------------------
  if (profile.helpers.length > 0) {
    const helperNames = profile.helpers.map((helper) => helper.name).join(" and ");
    const helpJob = (key: string, title: string, definition: string, frequency: string, adultOnly = false) => {
      const primary = assign(pickAdult());
      const backup = pickAdult(primary ? [primary.id] : []);
      push({
        key,
        category: "help",
        title,
        definition,
        frequency,
        primaryMemberId: primary?.id ?? null,
        backupMemberId: backup?.id ?? null,
        rationale: `Someone at home keeps things running smoothly with ${helperNames}.`,
        confidence: 0.6,
        adultOnly,
      });
    };
    helpJob("household.help_schedule", "Plan the helpers' week", "Everyone knows who is coming when, and what they will do.", "Weekly");
    helpJob("household.help_attendance", "Track attendance and leave", "Days off and leave are known in advance and covered.", "As needed");
    helpJob("finance.helper_salary", "Pay household help", "Salaries are paid on time, every month.", "Monthly", true);
    helpJob("household.help_supplies", "Supplies the helpers need", "The helpers have what they need to do the job.", "Weekly");
  }

  const skip = new Set([...(options.existingKeys ?? []), ...(options.dismissed ?? [])]);
  const seen = new Set<string>();
  return out.filter((entry) => {
    if (skip.has(entry.key) || seen.has(entry.key)) return false;
    seen.add(entry.key);
    return true;
  });
}

/** Where a household's own responsibility is filed, so it is counted under the category it was added in. */
const CATEGORY_KEY_PREFIX: Record<SuggestionCategory, string> = {
  home: "home",
  kids: "kids",
  groceries: "groceries",
  finance: "finance",
  pets: "pets",
  help: "household help",
};

/** The key a household's own new responsibility is saved under, never colliding with one it already has. */
export function customResponsibilityKey(title: string, taken: Iterable<string>, category?: SuggestionCategory): string {
  const base = slugifyOutcomeKey(category ? `${CATEGORY_KEY_PREFIX[category]} ${title}` : title);
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 100; suffix += 1) {
    const candidate = `${base.slice(0, 58)}_${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base.slice(0, 50)}_${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export type ReadinessState = "ready" | "needs_review" | "needs_info" | "not_configured";

export const READINESS_LABELS: Record<ReadinessState, string> = {
  ready: "Ready",
  needs_review: "Needs review",
  needs_info: "Needs info",
  not_configured: "Not configured",
};

export type ReadinessArea = "family" | "home" | "groceries" | "kids" | "school" | "finance" | "pets" | "help";

/** How much each area counts toward "how ready is this household". Configurable; the total need not be 100. */
export const ONBOARDING_WEIGHTS: Record<ReadinessArea, number> = {
  family: 3,
  home: 2,
  groceries: 1,
  kids: 2,
  school: 1,
  finance: 1,
  pets: 1,
  help: 1,
};

export type ReadinessRow = {
  area: ReadinessArea;
  label: string;
  /** What is there, in words: "4 members", "12 suggested". */
  detail: string;
  state: ReadinessState;
  /** Done out of total — the fraction behind the state. */
  done: number;
  total: number;
  weight: number;
};

export type OnboardingFacts = {
  composition: Composition;
  profile: HouseholdProfile;
  /** Outcome keys the household has as real responsibilities. */
  responsibilityKeys: readonly string[];
  /** Suggestions still waiting for a decision. */
  pending: readonly SuggestedResponsibility[];
  /** Helpers with a working pattern on record. */
  helpersWithHours: number;
};

export type OnboardingSummary = {
  percent: number;
  milestone: string;
  rows: ReadinessRow[];
  next: NextAction | null;
};

export type NextAction = { area: ReadinessArea; label: string; step: OnboardingStep; category?: SuggestionCategory };

/** Which category a responsibility the household already has is counted under. */
export function responsibilityCategory(key: string): SuggestionCategory {
  return categoryOf(key, []);
}

function categoryOf(key: string, pending: readonly SuggestedResponsibility[]): SuggestionCategory {
  const suggested = pending.find((entry) => entry.key === key);
  if (suggested) return suggested.category;
  if (/^(school\.|kids\.)/.test(key)) return "kids";
  if (/^groceries\./.test(key)) return "groceries";
  if (/^finance\.helper|^household\.help/.test(key)) return "help";
  if (/^(finance|bills|payments)\./.test(key)) return "finance";
  if (/^pets\./.test(key)) return "pets";
  return "home";
}

export function onboardingSummary(facts: OnboardingFacts, weights: Record<ReadinessArea, number> = ONBOARDING_WEIGHTS): OnboardingSummary {
  const { composition, profile, pending } = facts;
  const rows: ReadinessRow[] = [];
  const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

  // Family: everyone the household said it has, named.
  const namedPeople = profile.adults.length + profile.children.length;
  const expectedPeople = Math.max(composition.adults + composition.children, namedPeople);
  rows.push({
    area: "family",
    label: "Family",
    detail: plural(namedPeople, "member"),
    state: namedPeople >= expectedPeople ? "ready" : "needs_info",
    done: namedPeople,
    total: expectedPeople,
    weight: weights.family,
  });

  const accepted = (category: SuggestionCategory) => facts.responsibilityKeys.filter((key) => categoryOf(key, pending) === category).length;
  const waiting = (category: SuggestionCategory) => pending.filter((entry) => entry.category === category).length;
  const categoryRow = (area: ReadinessArea & SuggestionCategory, label: string) => {
    const done = accepted(area);
    const open = waiting(area);
    const state: ReadinessState = open > 0 ? "needs_review" : done > 0 ? "ready" : "not_configured";
    rows.push({
      area,
      label,
      detail: open > 0 ? `${open} suggested${done > 0 ? `, ${done} set` : ""}` : done > 0 ? `${done} set` : "Nothing yet",
      state,
      done,
      total: done + open,
      weight: weights[area],
    });
  };

  categoryRow("home", "Home responsibilities");
  categoryRow("groceries", "Groceries");

  if (composition.children > 0 || profile.children.length > 0) {
    categoryRow("kids", "Kids");
    const children = Math.max(composition.children, profile.children.length);
    const enrolled = profile.children.filter((child) => child.school).length;
    rows.push({
      area: "school",
      label: "School",
      detail: plural(children, "child", "children"),
      state: enrolled >= children ? "ready" : "needs_info",
      done: enrolled,
      total: children,
      weight: weights.school,
    });
  }

  categoryRow("finance", "Bills & Finance");

  if (composition.pets > 0 || profile.pets.length > 0) {
    const pets = Math.max(composition.pets, profile.pets.length);
    const named = profile.pets.length;
    const open = waiting("pets");
    const done = accepted("pets");
    rows.push({
      area: "pets",
      label: "Pets",
      detail: plural(named, "pet"),
      state: named < pets ? "needs_info" : open > 0 ? "needs_review" : done > 0 ? "ready" : "not_configured",
      // Naming every pet, then every pet-care suggestion decided.
      done: named + done,
      total: pets + done + open,
      weight: weights.pets,
    });
  }

  if (composition.helpers > 0 || profile.helpers.length > 0) {
    const helpers = Math.max(composition.helpers, profile.helpers.length);
    const named = profile.helpers.length;
    const open = waiting("help");
    rows.push({
      area: "help",
      label: "Household help",
      detail: plural(named, "helper"),
      state: named < helpers || facts.helpersWithHours < named ? "needs_info" : open > 0 ? "needs_review" : "ready",
      done: named + facts.helpersWithHours,
      total: helpers * 2,
      weight: weights.help,
    });
  }

  const weighted = rows.reduce((sum, row) => sum + row.weight * (row.total === 0 ? 0 : Math.min(1, row.done / row.total)), 0);
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  const percent = totalWeight === 0 ? 0 : Math.round((weighted / totalWeight) * 100);

  return { percent, milestone: milestoneFor(percent), rows, next: nextAction(rows, profile, composition) };
}

/** The one thing most worth doing next: the biggest weighted gap, said as an action. */
function nextAction(rows: readonly ReadinessRow[], profile: HouseholdProfile, composition: Composition): NextAction | null {
  // Everyone named comes first: every suggestion depends on who is here.
  const family = rows.find((row) => row.area === "family");
  if (family && family.state !== "ready") {
    return { area: "family", label: "Add everyone's names", step: profile.adults.length < composition.adults ? "adults" : "children" };
  }
  const gaps = rows
    .filter((row) => row.state !== "ready")
    .map((row) => ({ row, gap: row.weight * (row.total === 0 ? 1 : 1 - Math.min(1, row.done / row.total)) }))
    .sort((a, b) => b.gap - a.gap);
  const top = gaps[0]?.row;
  if (!top) return null;
  switch (top.area) {
    case "school":
      return { area: "school", label: profile.children.length === 1 ? `Add ${profile.children[0]!.name}'s school` : "Add each child's school", step: "guided" };
    case "help":
      return { area: "help", label: "Add your helpers' working days", step: "pets" };
    case "pets":
      return top.state === "needs_info"
        ? { area: "pets", label: "Add your pets' names", step: "pets" }
        : { area: "pets", label: "Review pet care", step: "review", category: "pets" };
    default:
      return {
        area: top.area,
        label: top.state === "needs_review" ? `Review ${top.label.toLowerCase()}` : `Set up ${top.label.toLowerCase()}`,
        step: "review",
        category: top.area as SuggestionCategory,
      };
  }
}

// ---------------------------------------------------------------------------
// Guided questions
// ---------------------------------------------------------------------------

export type GuidedQuestion =
  | { id: "school"; text: string; children: { id: string; name: string }[] }
  | { id: "helper_hours"; text: string; helpers: { id: string; name: string }[] }
  | { id: "accept_category"; category: SuggestionCategory; text: string; count: number };

/**
 * What WonderHome asks next, most useful first — one at a time on screen.
 *
 * Each question exists only while its answer is missing, so it can never be
 * asked twice: add the school and the school question is gone. Anything the
 * household set aside this visit (`skipped`) waits for another day.
 */
export function guidedQuestions(facts: OnboardingFacts, skipped: Iterable<string> = []): GuidedQuestion[] {
  const skip = new Set(skipped);
  const questions: GuidedQuestion[] = [];
  const { profile, pending } = facts;

  const unenrolled = profile.children.filter((child) => !child.school);
  if (unenrolled.length > 0) {
    const names = unenrolled.map((child) => child.name);
    const who = unenrolled.length === 1 ? names[0]! : unenrolled.length === 2 ? "two children" : `${unenrolled.length} children`;
    questions.push({
      id: "school",
      text:
        unenrolled.length === 1
          ? `I see ${who} is at school. Which school does ${who} go to? I'll use it for routines and homework tracking.`
          : `I see you have ${who}. Which schools do they go to? I'll use it for their routines and homework tracking.`,
      children: unenrolled.map((child) => ({ id: child.id, name: child.name })),
    });
  }

  if (profile.helpers.length > facts.helpersWithHours) {
    const helpers = profile.helpers;
    questions.push({
      id: "helper_hours",
      text: helpers.length === 1 ? `Which days does ${helpers[0]!.name} usually come, and when?` : "Which days do your helpers usually come, and when?",
      helpers: helpers.map((helper) => ({ id: helper.id, name: helper.name })),
    });
  }

  const offers: { category: SuggestionCategory; text: (count: number) => string }[] = [
    { category: "groceries", text: () => "Would you like me to set up a weekly grocery routine based on a family like yours?" },
    { category: "kids", text: (count) => `Shall I set up the ${count} kids' routines I suggested, so everyone knows who does what?` },
    { category: "home", text: (count) => `Shall I keep the ${count} home responsibilities I suggested, as they are?` },
    { category: "pets", text: () => "Want me to add feeding and vet reminders for your pets?" },
    { category: "help", text: () => "Shall I set up the routine around your household help?" },
    { category: "finance", text: () => "Shall I keep track of bills and payments, shared between the adults?" },
  ];
  for (const offer of offers) {
    const count = pending.filter((entry) => entry.category === offer.category).length;
    if (count > 0) questions.push({ id: "accept_category", category: offer.category, text: offer.text(count), count });
  }

  return questions.filter((question) => !skip.has(question.id === "accept_category" ? `accept_${question.category}` : question.id));
}

/** The skip token a question is set aside under for this visit. */
export function questionToken(question: GuidedQuestion): string {
  return question.id === "accept_category" ? `accept_${question.category}` : question.id;
}

// ---------------------------------------------------------------------------
// The final checklist
// ---------------------------------------------------------------------------

export type ChecklistKey = "family" | "responsibilities" | "groceries" | "school" | "pets" | "help";
/** `key` names the line, so a screen can say it in the reader's language; `label` is the English. */
export type ChecklistItem = { key: ChecklistKey; label: string; done: boolean };

/** Only what is really set up is ticked — a suggestion nobody accepted is not "added". */
export function completionChecklist(summary: OnboardingSummary): ChecklistItem[] {
  const row = (area: ReadinessArea) => summary.rows.find((entry) => entry.area === area);
  const items: ChecklistItem[] = [];
  const add = (area: ReadinessArea & ChecklistKey, label: string, doneWhen: (entry: ReadinessRow) => boolean) => {
    const entry = row(area);
    if (entry) items.push({ key: area, label, done: doneWhen(entry) });
  };
  add("family", "Family set up", (entry) => entry.state === "ready");
  const anyAccepted = summary.rows.some((entry) => ["home", "kids", "finance"].includes(entry.area) && entry.done > 0);
  items.push({ key: "responsibilities", label: "Responsibilities added", done: anyAccepted });
  add("groceries", "Grocery routine ready", (entry) => entry.done > 0);
  add("school", "Kids and school set up", (entry) => entry.state === "ready");
  add("pets", "Pet care added", (entry) => entry.state === "ready");
  add("help", "Household help added", (entry) => entry.state === "ready" || entry.state === "needs_review");
  return items;
}
