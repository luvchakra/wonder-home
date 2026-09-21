import { addDays, daysBetween, isoDate, parseDate, silent, type HomeAssessment } from "../home/assessment";

/**
 * Consumables and depletion (stories 09-001, 09-002, 09-007).
 *
 * WonderHome does not keep a pantry inventory. Counting what is in the house
 * needs somebody to keep the count accurate, and that is the work this product
 * exists to remove. What it keeps is a rate — how long one of a thing lasts —
 * and the evidence behind that rate.
 *
 * The evidence requirement is the load-bearing part. A suggestion that cannot
 * answer "why do you think we need this?" is how a household learns to stop
 * reading the list, so a consumable with no basis produces no suggestion at
 * all rather than a guess with a confident tone.
 */

/** Quick-pick suggestions in the add/edit form's category field — not a closed set. A household may type its own ("baby", "stationery"); the database only requires 1-40 trimmed characters, "pet" is the one value with special meaning (pet-supply consumables must use it exactly). */
export const CONSUMABLE_CATEGORIES = ["grocery", "household", "pet", "personal", "medical"] as const;
export type ConsumableCategory = string;

export const EVIDENCE_BASES = ["purchase_history", "configured_inventory", "member_stated"] as const;
export type EvidenceBasis = (typeof EVIDENCE_BASES)[number];

export type Consumable = {
  id: string;
  name: string;
  category: ConsumableCategory;
  petId: string | null;
  unit: string;
  typicalQuantity: number;
  /** How long one typical quantity lasts. Null means WonderHome does not know. */
  daysPerUnit: number | null;
  evidenceBasis: EvidenceBasis | null;
  lastPurchasedOn: string | null;
  lastPurchasedQuantity: number | null;
};

export type Purchase = { purchasedOn: string; quantity: number };

/**
 * Works out a consumption rate from what the household actually bought.
 *
 * Two purchases is not evidence — it is one interval, and one interval of a
 * household's shopping says more about the weekend than about the milk. Three
 * is the smallest number from which a rate can be averaged at all, so below
 * that this returns nothing and the caller stays quiet.
 */
export const MIN_PURCHASES_FOR_RATE = 3;

export function inferRate(purchases: readonly Purchase[]): { daysPerUnit: number; basis: EvidenceBasis } | null {
  const ordered = [...purchases]
    .map((purchase) => ({ ...purchase, date: parseDate(purchase.purchasedOn) }))
    .filter((purchase): purchase is Purchase & { date: Date } => purchase.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  if (ordered.length < MIN_PURCHASES_FOR_RATE) return null;

  let totalDays = 0;
  let totalQuantity = 0;

  for (let i = 1; i < ordered.length; i += 1) {
    const gap = daysBetween(ordered[i - 1]!.date, ordered[i]!.date);
    // A same-day repeat is a correction or a split delivery, not a cycle.
    if (gap <= 0) continue;
    totalDays += gap;
    totalQuantity += ordered[i - 1]!.quantity;
  }

  if (totalQuantity <= 0 || totalDays <= 0) return null;

  return { daysPerUnit: Math.round((totalDays / totalQuantity) * 10) / 10, basis: "purchase_history" };
}

/** When this is expected to run out, or null when there is no basis to say. */
export function expectedDepletion(consumable: Consumable, now: Date = new Date()): Date | null {
  if (consumable.daysPerUnit === null || consumable.evidenceBasis === null) return null;

  const lastPurchase = parseDate(consumable.lastPurchasedOn);
  if (!lastPurchase) return null;

  const quantity = consumable.lastPurchasedQuantity ?? consumable.typicalQuantity;
  return addDays(lastPurchase, Math.round(consumable.daysPerUnit * quantity));
}

/**
 * How far ahead of running out the household needs to act, by category.
 *
 * Medication is not milk. Running out of one is an inconvenience and the other
 * is a health problem, so they get different amounts of warning.
 */
/** Keyed by the five suggested categories; a household's own custom category falls back to `DEFAULT_REORDER_LEAD_DAYS`. */
export const REORDER_LEAD_DAYS: Record<string, number> = {
  medical: 7,
  pet: 4,
  grocery: 3,
  household: 3,
  personal: 3,
};

/** Same lead time as the three ordinary defaults, for a category that isn't one of the five suggestions. */
export const DEFAULT_REORDER_LEAD_DAYS = 3;

export type Suggestion = {
  consumableId: string;
  name: string;
  quantity: number;
  /** Why this is on the list, in the household's words. */
  reason: string;
  evidenceBasis: EvidenceBasis;
  neededBy: string;
};

/**
 * What the household should buy, and why (story 09-002).
 *
 * Only things with a basis, and only when they are actually close to running
 * out. A list that reprints the whole pantry every week is a list nobody reads.
 */
export function suggestPurchase(consumable: Consumable, now: Date = new Date()): Suggestion | null {
  const depletion = expectedDepletion(consumable, now);
  if (!depletion || consumable.evidenceBasis === null) return null;

  const daysLeft = daysBetween(now, depletion);
  const lead = REORDER_LEAD_DAYS[consumable.category] ?? DEFAULT_REORDER_LEAD_DAYS;
  if (daysLeft > lead) return null;

  return {
    consumableId: consumable.id,
    name: consumable.name,
    quantity: consumable.typicalQuantity,
    reason:
      daysLeft <= 0
        ? `${consumable.name} has probably run out.`
        : `${consumable.name} should last about ${daysLeft} more ${daysLeft === 1 ? "day" : "days"}.`,
    evidenceBasis: consumable.evidenceBasis,
    neededBy: isoDate(depletion),
  };
}

/** The same judgement in the shape every other domain reports (module 13's). */
export function assessConsumable(consumable: Consumable, now: Date = new Date()): HomeAssessment {
  const subjectKey = `consumable.${consumable.id}`;
  const suggestion = suggestPurchase(consumable, now);

  if (!suggestion) {
    return silent(
      subjectKey,
      consumable.name,
      consumable.daysPerUnit === null
        ? `WonderHome does not know how fast ${consumable.name} goes yet.`
        : `${consumable.name} should last a while yet.`,
    );
  }

  const outOfStock = suggestion.reason.includes("run out");

  return {
    subjectKey,
    title: consumable.name,
    status: outOfStock ? "blocked" : "at_risk",
    riskLevel: outOfStock ? "high" : consumable.category === "medical" ? "high" : "medium",
    notable: true,
    reason: suggestion.reason,
    action: { action: "add_to_cart", target: consumable.id },
    dueOn: suggestion.neededBy,
  };
}

/**
 * Whether a prediction may become a shopping action at all.
 *
 * Stated separately from `suggestPurchase` so the rule is checkable on its own
 * and impossible to sidestep: this is the acceptance criterion that predictions
 * must carry an evidence basis "before creating a shopping action".
 */
export function mayCreateShoppingAction(consumable: Consumable): {
  allowed: boolean;
  reason: string;
} {
  if (consumable.evidenceBasis === null || consumable.daysPerUnit === null) {
    return {
      allowed: false,
      reason: "There is nothing behind this yet — no purchase history, no stated rate.",
    };
  }
  if (!consumable.lastPurchasedOn) {
    return { allowed: false, reason: "Nothing is known about when this was last bought." };
  }
  return { allowed: true, reason: `Based on ${describeBasis(consumable.evidenceBasis)}.` };
}

export function describeBasis(basis: EvidenceBasis): string {
  switch (basis) {
    case "purchase_history":
      return "what this household usually buys";
    case "configured_inventory":
      return "what the household recorded";
    case "member_stated":
      return "what somebody told WonderHome";
  }
}
