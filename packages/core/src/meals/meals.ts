import { isoDate, silent, type HomeAssessment } from "../home/assessment";

/**
 * Meals as readiness outcomes (stories 10-001 through 10-005).
 *
 * The rule the backlog states and this module enforces: a meal outcome is
 * "readiness for eating rather than requiring cooks to record every preparation
 * step". So there is no progress, no steps, no confirmation that the rice went
 * on. There is a time the family needs to eat, and a judgement about whether
 * that is still going to happen.
 *
 * Preferences carry their scope for a reason that matters more than it looks:
 * treating one person's dislike as a household rule is how a meal planner ends
 * up unable to cook anything anybody enjoys.
 */

export const MEAL_SLOTS = ["breakfast", "lunch", "snack", "dinner"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_STATUSES = [
  "planned",
  "at_risk",
  "ready",
  "eaten",
  "skipped",
  "replanned",
] as const;
export type MealStatus = (typeof MEAL_STATUSES)[number];

export type Recipe = {
  id: string;
  name: string;
  /** Time the cook is actually occupied. */
  activeMinutes: number;
  /** Wall-clock time from starting to ready, including anything unattended. */
  totalMinutes: number;
  serves: number;
  /** Whatever the household recorded — never computed from ingredients. Null means not recorded. */
  caloriesPerServing?: number | null;
  proteinGrams?: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
};

export type IngredientNeed = {
  name: string;
  consumableId: string | null;
  quantity: number;
  unit: string;
  essential: boolean;
  status: "needed" | "have" | "shopping" | "substituted" | "missing";
  substituteName?: string | null;
};

export type Meal = {
  id: string;
  name: string;
  slot: MealSlot;
  onDate: string;
  /** When the family needs to eat. The outcome, not a start time. */
  readyBy: Date;
  cookMemberId: string | null;
  status: MealStatus;
  readyAt: Date | null;
  recipe: Recipe | null;
  ingredients: IngredientNeed[];
};

/** When cooking has to start for this to be ready in time. */
export function startBy(meal: Meal): Date | null {
  if (!meal.recipe) return null;
  return new Date(meal.readyBy.getTime() - meal.recipe.totalMinutes * 60_000);
}

export type MealContext = {
  now: Date;
  /** Whether the named cook is around between starting and ready. */
  cookAvailable: boolean;
};

/**
 * Whether the family will eat on time, and what to do if not (10-001, 10-005).
 *
 * Note the order of the checks. A missing essential ingredient outranks a late
 * start, because no amount of hurrying fixes an empty cupboard, and telling
 * somebody to start cooking a dish they cannot make is worse than saying
 * nothing.
 */
export function assessMeal(meal: Meal, context: MealContext): HomeAssessment {
  const subjectKey = `meal.${meal.id}`;

  if (
    meal.status === "eaten" ||
    meal.status === "skipped" ||
    meal.status === "ready"
  ) {
    return silent(subjectKey, meal.name, "This meal is settled.");
  }

  const missing = meal.ingredients.filter(
    (ingredient) =>
      ingredient.essential &&
      (ingredient.status === "needed" || ingredient.status === "missing"),
  );

  if (missing.length > 0) {
    const shopping = missing.every(
      (ingredient) => ingredient.status === "shopping",
    );
    return {
      subjectKey,
      title: meal.name,
      status: "blocked",
      riskLevel: "medium",
      notable: !shopping,
      reason: `${meal.name} needs ${missing.map((ingredient) => ingredient.name).join(", ")}.`,
      // The action is shopping or substituting, never "cook anyway".
      action: {
        action: missing.length === 1 ? "substitute" : "shop_for_meal",
        target: meal.id,
      },
      dueOn: isoDate(meal.readyBy),
    };
  }

  const start = startBy(meal);
  if (!start) {
    return {
      subjectKey,
      title: meal.name,
      status: "pending",
      riskLevel: "none",
      notable: false,
      reason: `${meal.name} has no recipe attached, so WonderHome cannot time it.`,
      action: null,
      dueOn: isoDate(meal.readyBy),
    };
  }

  if (context.now > meal.readyBy) {
    return {
      subjectKey,
      title: meal.name,
      status: "missed",
      riskLevel: "medium",
      notable: true,
      reason: `${meal.name} was meant to be ready by now.`,
      action: { action: "replan_meal", target: meal.id },
      dueOn: isoDate(meal.readyBy),
    };
  }

  if (!context.cookAvailable) {
    return {
      subjectKey,
      title: meal.name,
      status: "at_risk",
      riskLevel: "medium",
      notable: true,
      reason: `Nobody is free to cook ${meal.name} in time.`,
      action: { action: "find_cook", target: meal.id },
      dueOn: isoDate(meal.readyBy),
    };
  }

  if (context.now > start) {
    const lateMinutes = Math.round(
      (context.now.getTime() - start.getTime()) / 60_000,
    );
    return {
      subjectKey,
      title: meal.name,
      status: "at_risk",
      riskLevel: lateMinutes > 30 ? "high" : "medium",
      notable: true,
      reason: `${meal.name} needed to be started ${lateMinutes} minutes ago to be ready on time.`,
      action: { action: "start_cooking", target: meal.id },
      dueOn: isoDate(meal.readyBy),
    };
  }

  return silent(subjectKey, meal.name, `${meal.name} is on track.`);
}

export const PREFERENCE_KINDS = [
  "allergy",
  "medical",
  "ethical",
  "dislike",
  "preference",
] as const;

export type Preference = {
  /** Null for the whole household; a member id for one person only. */
  memberId: string | null;
  kind: (typeof PREFERENCE_KINDS)[number];
  subject: string;
  source: "member_stated" | "observed" | "imported";
};

export type PreferenceVerdict =
  | { allowed: true }
  | {
      allowed: false;
      severity: "unsafe" | "unacceptable" | "disliked";
      because: string;
      affects: string[];
    };

/**
 * Whether a dish suits the people who will eat it (10-002, 10-006).
 *
 * An allergy is not a preference and the two must never be weighed together.
 * A household that will not eat beef and a child who dislikes mushrooms produce
 * different answers: one rules the dish out, the other is worth mentioning
 * while still cooking it for everyone else.
 */
export function checkPreferences(
  ingredients: readonly { name: string }[],
  preferences: readonly Preference[],
  eating: readonly string[],
): PreferenceVerdict {
  const names = ingredients.map((ingredient) => ingredient.name.toLowerCase());

  const relevant = preferences.filter(
    (preference) =>
      preference.memberId === null || eating.includes(preference.memberId),
  );

  const hits = relevant.filter((preference) =>
    names.some((name) => name.includes(preference.subject.toLowerCase())),
  );

  const unsafe = hits.filter(
    (hit) => hit.kind === "allergy" || hit.kind === "medical",
  );
  if (unsafe.length > 0) {
    return {
      allowed: false,
      severity: "unsafe",
      because: `Contains ${unsafe.map((hit) => hit.subject).join(", ")}.`,
      affects: unsafe.map((hit) => hit.memberId ?? "household"),
    };
  }

  const ethical = hits.filter((hit) => hit.kind === "ethical");
  if (ethical.length > 0) {
    return {
      allowed: false,
      severity: "unacceptable",
      because: `This household does not eat ${ethical.map((hit) => hit.subject).join(", ")}.`,
      affects: ethical.map((hit) => hit.memberId ?? "household"),
    };
  }

  const disliked = hits.filter((hit) => hit.kind === "dislike");
  if (disliked.length > 0) {
    // Worth saying, not worth refusing: one person's dislike does not decide
    // what the rest of the family eats.
    return {
      allowed: false,
      severity: "disliked",
      because: `${disliked.map((hit) => hit.subject).join(", ")} — somebody eating will not enjoy this.`,
      affects: disliked.map((hit) => hit.memberId ?? "household"),
    };
  }

  return { allowed: true };
}

export type PlanCandidate = {
  recipe: Recipe;
  /** Essential ingredients the household does not have. */
  missingEssential: string[];
  preference: PreferenceVerdict;
};

export type PlanChoice =
  | { kind: "cook"; recipe: Recipe; because: string }
  | { kind: "shop"; recipe: Recipe; because: string; missing: string[] }
  | { kind: "substitute"; recipe: Recipe; because: string; missing: string[] }
  | { kind: "defer"; because: string };

/**
 * Picks what to cook, and says what has to happen for it (10-002, 10-006).
 *
 * Every outcome carries an action the household can take — cook, shop,
 * substitute or defer — because the criterion is that a recommendation must
 * "expose a clear next action". A suggestion with no next step is a suggestion
 * that leaves the thinking with the family.
 */
export function choosePlan(
  candidates: readonly PlanCandidate[],
  options: { minutesAvailable: number; canShopBefore: boolean },
): PlanChoice {
  const safe = candidates.filter(
    (candidate) =>
      candidate.preference.allowed ||
      candidate.preference.severity === "disliked",
  );

  if (safe.length === 0) {
    return {
      kind: "defer",
      because: "Nothing here suits everybody who is eating.",
    };
  }

  const inTime = safe.filter(
    (candidate) => candidate.recipe.totalMinutes <= options.minutesAvailable,
  );
  if (inTime.length === 0) {
    return {
      kind: "defer",
      because: "Nothing here can be ready in the time available.",
    };
  }

  // Everything to hand and nobody minds: cook it.
  const ready = inTime.filter(
    (candidate) =>
      candidate.missingEssential.length === 0 && candidate.preference.allowed,
  );
  if (ready.length > 0) {
    const quickest = [...ready].sort(
      (a, b) => a.recipe.activeMinutes - b.recipe.activeMinutes,
    )[0]!;
    return {
      kind: "cook",
      recipe: quickest.recipe,
      because: `Everything is in, and it needs ${quickest.recipe.activeMinutes} minutes of actual cooking.`,
    };
  }

  // Something is missing. Shopping only helps if there is time to shop.
  const nearlyReady = [...inTime].sort(
    (a, b) => a.missingEssential.length - b.missingEssential.length,
  )[0]!;

  if (nearlyReady.missingEssential.length > 0) {
    return options.canShopBefore
      ? {
          kind: "shop",
          recipe: nearlyReady.recipe,
          because: `${nearlyReady.recipe.name} needs ${nearlyReady.missingEssential.length} thing(s) first.`,
          missing: nearlyReady.missingEssential,
        }
      : {
          kind: "substitute",
          recipe: nearlyReady.recipe,
          because: "There is no time to shop, so this needs a substitution.",
          missing: nearlyReady.missingEssential,
        };
  }

  // Everything is in, but somebody will not enjoy it. Still a meal.
  return {
    kind: "cook",
    recipe: nearlyReady.recipe,
    because: nearlyReady.preference.allowed
      ? "Everything is in."
      : `Everything is in, though ${nearlyReady.preference.because.toLowerCase()}`,
  };
}

/**
 * What a change to the day does to the meals planned for it (10-005).
 *
 * Replanning preserves what the family chose. An explicit preference and
 * protected family time are not inputs the planner may overrule to make the
 * arithmetic work — the criterion says as much, and a planner that quietly
 * moves the one dinner everybody agreed on has made itself untrustworthy.
 */
export type Replan =
  | { kind: "keep"; because: string }
  | { kind: "move"; readyBy: Date; because: string }
  | { kind: "reassign"; because: string }
  | { kind: "ask"; because: string };

export function replanMeal(
  meal: Meal,
  change: {
    cookUnavailable?: boolean;
    readyByMovedTo?: Date | null;
    protectedTime?: boolean;
  },
): Replan {
  if (change.protectedTime) {
    return {
      kind: "ask",
      because:
        "This is protected family time, so WonderHome will not move it on its own.",
    };
  }

  if (change.readyByMovedTo) {
    return {
      kind: "move",
      readyBy: change.readyByMovedTo,
      because: "The family is eating at a different time.",
    };
  }

  if (change.cookUnavailable) {
    return {
      kind: "reassign",
      because: meal.cookMemberId
        ? "The person who was going to cook is not available."
        : "Nobody is assigned to cook this.",
    };
  }

  return { kind: "keep", because: "Nothing about this meal has changed." };
}
