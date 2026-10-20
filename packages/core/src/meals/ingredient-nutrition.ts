import type { CatalogEntry, Nutrients } from "../commerce/catalog";
import { toBase } from "../commerce/units";
import type { IngredientLine } from "./ingredient-lines";

/**
 * Nutrients per serving, added up from a recipe's own ingredients (25-017,
 * the owner 2026-10-18: "auto populate nutrition value based on ingredients
 * used").
 *
 * Arithmetic somebody can explain (rule 9), and nothing else:
 *   per serving = Σ (the ingredient's nutrient per 100 g or 100 ml ×
 *                     its amount in g or ml ÷ 100) ÷ servings.
 *
 * Only an ingredient linked to a catalog entry with a per-100 basis, and an
 * amount in grams or millilitres (a kilo or a litre is converted), counts. An
 * ingredient counted in pieces or with no amount cannot be weighed, so it is
 * left out and said so — `counted` of `total` — rather than guessed at. The
 * Indian Food Composition Tables (IFCT 2017) are preferred where a curated
 * item has them, as the item page already does; a label's own values
 * otherwise. Null when no ingredient could be counted.
 *
 * A liquid whose figures are per 100 g (IFCT keeps oils, ghee and milk that
 * way) is weighed at a stated density — oils and ghee 0.92 g/ml, anything
 * else 1 g/ml — never skipped for being in millilitres. And because a sum
 * made from a small part of the dish says little, the figures are given only
 * when what was counted is at least `MIN_COVERAGE` of everything that could
 * be weighed, and no rich ingredient (a fat, sugar or nuts) was left out;
 * otherwise there are none. The ingredients left out are named.
 */

export type ServingNutrition = {
  caloriesPerServing: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  /** How many ingredients the sum is made of, out of how many the recipe has. */
  counted: number;
  total: number;
  /** Ingredients that could not be counted (no figures on record, or no weight), by name. */
  missing?: string[];
};

/** Below this share of the dish's weighable amount, no per-serving figures are given. */
export const MIN_COVERAGE = 0.8;

/**
 * Ingredients so rich that a sum without them would mislead: when one of
 * these cannot be counted, no figures are given at all.
 */
const DENSE_CATEGORIES = new Set(["Oils & ghee", "Sugar & sweeteners", "Dry fruits, nuts & seeds"]);
const DENSE_NAME = /\b(butter|cream|ghee|condensed|sugar|jaggery|oil|cashew|almond|peanut|coconut)\b/i;
function isDense(name: string, entry: CatalogEntry | undefined): boolean {
  return (entry ? DENSE_CATEGORIES.has(entry.category) : false) || DENSE_NAME.test(name);
}

/** g per ml for a liquid whose figures are per 100 g. */
function densityOf(entry: CatalogEntry): number {
  return entry.category === "Oils & ghee" ? 0.92 : 1;
}

export function nutritionPerServing(lines: readonly IngredientLine[], entries: ReadonlyMap<string, CatalogEntry>, serves: number): ServingNutrition | null {
  if (!(serves > 0)) return null;
  const sum = { energy_kcal: 0, protein_g: 0, carbohydrate_g: 0, fat_g: 0 };
  const seen = { energy_kcal: false, protein_g: false, carbohydrate_g: false, fat_g: false };
  let counted = 0;
  let weighed = 0;
  let weighable = 0;
  const missing: string[] = [];
  let denseMissing = false;
  const leaveOut = (name: string, entry: CatalogEntry | undefined) => {
    missing.push(name);
    if (isDense(name, entry)) denseMissing = true;
  };
  for (const line of lines) {
    const entry = line.consumableId ? entries.get(line.consumableId) : undefined;
    const base = line.unit === "unit" ? null : toBase(line.quantity, line.unit);
    const amount = base && (base.unit === "g" || base.unit === "ml") ? base.quantity : null;
    if (amount !== null) weighable += amount;
    if (!entry || amount === null || !base) {
      leaveOut(line.name, entry);
      continue;
    }
    const nutrients: Nutrients = entry.ifct?.nutrients && Object.keys(entry.ifct.nutrients).length > 0 ? entry.ifct.nutrients : entry.nutrients;
    const basis = entry.ifct ? "100g" : entry.nutrientBasis;
    if (!basis) {
      leaveOut(line.name, entry);
      continue;
    }
    const grams = basis === "100g" ? (base.unit === "g" ? base.quantity : base.quantity * densityOf(entry)) : base.unit === "ml" ? base.quantity : null;
    if (grams === null) {
      leaveOut(line.name, entry);
      continue;
    }
    let any = false;
    for (const key of Object.keys(sum) as (keyof typeof sum)[]) {
      const per100 = nutrients[key];
      if (typeof per100 !== "number") continue;
      sum[key] += (per100 * grams) / 100;
      seen[key] = true;
      any = true;
    }
    if (any) {
      counted += 1;
      weighed += amount;
    } else leaveOut(line.name, entry);
  }
  if (counted === 0 || weighable === 0 || weighed / weighable < MIN_COVERAGE || denseMissing) return null;
  // Whole numbers, as a recipe keeps them and as a person types them: "rough
  // nutrients per serving" is never more precise than the amounts it is from.
  const per = (key: keyof typeof sum) => (seen[key] ? Math.round(sum[key] / serves) : null);
  return {
    caloriesPerServing: per("energy_kcal"),
    proteinGrams: per("protein_g"),
    carbsGrams: per("carbohydrate_g"),
    fatGrams: per("fat_g"),
    counted,
    total: lines.length,
    ...(missing.length > 0 ? { missing } : {}),
  };
}
