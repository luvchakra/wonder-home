import type { GroceryItem } from "../commerce/inventory";
import { compatible, normalizeUnit, roundQuantity, stepInBase, subtractAmounts, toBase, type Amount } from "../commerce/units";
import type { IngredientNeed } from "./meals";

/**
 * What a planned meal is short of (HomeFood 25-003a, design
 * GROCERIES-PANTRY-HOMETALK-PHASE0.md §3.5).
 *
 * For each ingredient: what the meal needs, scaled to the servings planned,
 * minus what is at home, minus what is already on the list. Only the gap is
 * offered, so nothing is ever bought twice. All of it is arithmetic someone
 * can follow (rule 9), done in `units.ts`, and it never claims stock it does
 * not know:
 *
 * - **Measured** — the recipe gives an amount that converts to the item's
 *   unit ("200 g" of an item kept in kg). The gap is exact.
 * - **Estimate** — nobody has said how much is at home. Only the list is
 *   subtracted, and the line says it is an estimate.
 * - **Not measured** — the recipe names the ingredient but gives no amount
 *   it can be measured in ("1 unit" of rice). Some at home, or some already on
 *   the list, counts as covered; none (or none known) offers one usual step
 *   of the item ("1 packet"), never a made-up quantity.
 *
 * An ingredient the household said it has, or swapped for something else, is
 * not counted. Pure: the screen shows it as the person changes the servings,
 * and the server works it out again before anything is written.
 */

export type ShortfallBasis = "measured" | "estimate" | "unmeasured";

export type ShortfallLine = {
  /** The ingredient as the recipe names it. */
  name: string;
  /** The grocery item it is, when the household tracks one. */
  itemId: string | null;
  /** What the meal needs, scaled; null when the recipe gives no measurable amount. */
  need: Amount | null;
  /** What is at home; null when nobody has said. */
  have: Amount | null;
  /** What is already on the list. */
  onList: Amount | null;
  /** What to add to the list; null when nothing is needed. */
  short: Amount | null;
  basis: ShortfallBasis;
};

export type MealShortfalls = {
  /** Lines with something to add, in the recipe's order. */
  short: ShortfallLine[];
  /** Lines the home or the list already covers. */
  covered: ShortfallLine[];
  /** The factor the recipe's amounts were multiplied by. */
  scale: number;
};

/** How many servings the recipe's amounts are for, and how many are planned → the factor. */
export function servingScale(planned: number | null | undefined, recipeServes: number | null | undefined): number {
  if (!planned || !recipeServes || planned <= 0 || recipeServes <= 0) return 1;
  return planned / recipeServes;
}

/** The household's item for an ingredient: by its link, else by name or alias, exactly. */
export function itemFor(need: Pick<IngredientNeed, "name" | "consumableId">, groceries: readonly GroceryItem[]): GroceryItem | null {
  if (need.consumableId) {
    const linked = groceries.find((item) => item.id === need.consumableId);
    if (linked) return linked;
  }
  const word = need.name.trim().toLocaleLowerCase();
  const named = groceries.filter((item) => item.name.toLocaleLowerCase() === word || item.aliases.some((alias) => alias.toLocaleLowerCase() === word));
  // Two items answering to one name is a question, not a pick.
  return named.length === 1 ? named[0]! : null;
}

/** A recipe amount someone can measure: a real unit, not the default "unit" placeholder. */
function measured(need: Pick<IngredientNeed, "quantity" | "unit">): Amount | null {
  // Checked before normalizing: `normalizeUnit` reads "unit" as pieces, which made every unmeasured line "1 pc".
  if (need.unit.trim().toLowerCase() === "unit") return null;
  const unit = normalizeUnit(need.unit);
  if (!unit || !(need.quantity > 0)) return null;
  return { quantity: need.quantity, unit };
}

export function mealShortfalls(input: { ingredients: readonly IngredientNeed[]; scale: number; groceries: readonly GroceryItem[] }): MealShortfalls {
  const short: ShortfallLine[] = [];
  const covered: ShortfallLine[] = [];
  for (const need of input.ingredients) {
    if (need.status === "have" || need.status === "substituted") continue;
    const line = lineFor(need, input.scale, input.groceries);
    (line.short ? short : covered).push(line);
  }
  return { short, covered, scale: input.scale };
}

function lineFor(need: IngredientNeed, scale: number, groceries: readonly GroceryItem[]): ShortfallLine {
  const item = itemFor(need, groceries);
  const amount = measured(need);
  const scaled = amount ? { quantity: roundQuantity(amount.quantity * scale), unit: amount.unit } : null;
  const have = item?.stock ? { quantity: item.stock.quantity, unit: item.stock.unit } : null;
  const onList = item?.toBuy ? { quantity: item.toBuy.quantity, unit: item.toBuy.unit } : null;
  const base = { name: need.name, itemId: item?.id ?? null, have, onList };

  // A measured amount that converts to the item (or any amount, when nothing is tracked yet).
  if (scaled && (!item || compatible(scaled.unit, item.unit))) {
    const needed = toBase(scaled.quantity, scaled.unit);
    let gap: Amount | null = needed;
    if (have) gap = subtractAmounts(gap, have);
    if (gap && onList) gap = subtractAmounts(gap, onList);
    const left = gap && gap.quantity > 0 ? { quantity: gap.quantity, unit: gap.unit } : null;
    return { ...base, need: needed, short: left, basis: have ? "measured" : "estimate" };
  }

  // No amount to measure: some at home or on the list covers it; none adds one usual step.
  const some = (have && have.quantity > 0) || (onList && onList.quantity > 0);
  const step = item ? stepInBase(item.unit, item.step) : { quantity: 1, unit: "pcs" };
  return { ...base, need: null, short: some ? null : step, basis: have ? "unmeasured" : "estimate" };
}
