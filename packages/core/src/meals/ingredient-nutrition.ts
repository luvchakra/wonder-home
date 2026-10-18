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
 */

export type ServingNutrition = {
  caloriesPerServing: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  /** How many ingredients the sum is made of, out of how many the recipe has. */
  counted: number;
  total: number;
};

export function nutritionPerServing(lines: readonly IngredientLine[], entries: ReadonlyMap<string, CatalogEntry>, serves: number): ServingNutrition | null {
  if (!(serves > 0)) return null;
  const sum = { energy_kcal: 0, protein_g: 0, carbohydrate_g: 0, fat_g: 0 };
  const seen = { energy_kcal: false, protein_g: false, carbohydrate_g: false, fat_g: false };
  let counted = 0;
  for (const line of lines) {
    const entry = line.consumableId ? entries.get(line.consumableId) : undefined;
    if (!entry) continue;
    const nutrients: Nutrients = entry.ifct?.nutrients && Object.keys(entry.ifct.nutrients).length > 0 ? entry.ifct.nutrients : entry.nutrients;
    const basis = entry.ifct ? "100g" : entry.nutrientBasis;
    if (!basis || line.unit === "unit") continue;
    const base = toBase(line.quantity, line.unit);
    if ((basis === "100g" && base.unit !== "g") || (basis === "100ml" && base.unit !== "ml")) continue;
    let any = false;
    for (const key of Object.keys(sum) as (keyof typeof sum)[]) {
      const per100 = nutrients[key];
      if (typeof per100 !== "number") continue;
      sum[key] += (per100 * base.quantity) / 100;
      seen[key] = true;
      any = true;
    }
    if (any) counted += 1;
  }
  if (counted === 0) return null;
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
  };
}
