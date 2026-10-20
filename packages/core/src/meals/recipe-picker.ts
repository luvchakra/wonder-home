/**
 * The recipe picker in "Plan a meal" (the owner, 2026-10-20: "show all
 * recipes here, including from WonderHome, show the recipe pictures, along
 * with calorie and protein values, give option to filter recipe based on
 * calorie, protein etc.").
 *
 * One list: the household's own recipes first, then WonderHome's dishes it
 * has not saved yet. A recipe saved from a WonderHome dish keeps that dish's
 * picture and veg/egg/non-veg label. Calories and protein are per serving,
 * as recorded — never guessed; a filter on them leaves out what was never
 * counted. Whether a dish fits a diet is `diet.ts`'s rule. Pure.
 */

import { dietClash, dishDietOf, dishDietsFor, type Diet, type DietClash, type DishDiet } from "./diet";
import type { CatalogRecipeSummary } from "./recipe-catalog";
import type { RecipeChoice } from "./repository";

export type PickerDish = {
  /** `recipe:<id>` for the household's own, `catalog:<slug>` for a WonderHome dish not saved yet. */
  key: string;
  name: string;
  mine: boolean;
  /** Every essential ingredient at home (own recipes only); null for a WonderHome dish. */
  ready: boolean | null;
  imageUrl: string | null;
  caloriesPerServing: number | null;
  proteinGrams: number | null;
  minutes: number;
  serves: number;
  diet: DishDiet;
  ingredientNames: string[];
};

export function pickerDishes(own: readonly RecipeChoice[], catalog: readonly CatalogRecipeSummary[]): PickerDish[] {
  const byId = new Map(catalog.map((dish) => [dish.id, dish]));
  const saved = new Set(own.map((recipe) => recipe.catalogRecipeId).filter(Boolean));
  const mine = own.map((recipe): PickerDish => {
    const from = recipe.catalogRecipeId ? byId.get(recipe.catalogRecipeId) : undefined;
    return {
      key: `recipe:${recipe.id}`,
      name: recipe.name,
      mine: true,
      ready: recipe.available,
      imageUrl: from?.imageUrl ?? null,
      caloriesPerServing: recipe.caloriesPerServing ?? from?.caloriesPerServing ?? null,
      proteinGrams: recipe.proteinGrams ?? from?.proteinGrams ?? null,
      minutes: recipe.totalMinutes,
      serves: recipe.serves,
      diet: dishDietOf({ catalogDiet: from?.diet ?? null, ingredients: recipe.ingredientNames }),
      ingredientNames: recipe.ingredientNames,
    };
  });
  const ideas = catalog
    .filter((dish) => !saved.has(dish.id))
    .map((dish): PickerDish => ({
      key: `catalog:${dish.slug}`,
      name: dish.name,
      mine: false,
      ready: null,
      imageUrl: dish.imageUrl,
      caloriesPerServing: dish.caloriesPerServing,
      proteinGrams: dish.proteinGrams,
      minutes: dish.prepMinutes + dish.cookMinutes,
      serves: dish.serves,
      diet: dish.diet,
      ingredientNames: dish.ingredientNames,
    }));
  return [...mine, ...ideas];
}

export type PickerFilter = {
  query: string;
  /** A dish label to show only ("veg"), or "any". */
  dishDiet: DishDiet | "any";
  /** Only what fits this diet — the household's — or null for everything. */
  fits: Diet | null;
  maxCalories: number | null;
  minProtein: number | null;
  sort: "suggested" | "protein" | "calories";
};

export const NO_FILTER: PickerFilter = { query: "", dishDiet: "any", fits: null, maxCalories: null, minProtein: null, sort: "suggested" };

export function filterDishes(dishes: readonly PickerDish[], filter: PickerFilter): PickerDish[] {
  const needle = filter.query.trim().toLowerCase();
  const shown = dishes.filter(
    (dish) =>
      (!needle || dish.name.toLowerCase().includes(needle)) &&
      (filter.dishDiet === "any" || dish.diet === filter.dishDiet) &&
      (!filter.fits || (dishDietsFor(filter.fits).includes(dish.diet) && dietClash(filter.fits, { diet: dish.diet, ingredients: dish.ingredientNames }) === null)) &&
      (filter.maxCalories === null || (dish.caloriesPerServing !== null && dish.caloriesPerServing <= filter.maxCalories)) &&
      (filter.minProtein === null || (dish.proteinGrams !== null && dish.proteinGrams >= filter.minProtein)),
  );
  // Suggested: yours and ready to cook first, then yours, then WonderHome's, each by name.
  const rank = (dish: PickerDish) => (dish.mine ? (dish.ready ? 0 : 1) : 2);
  return [...shown].sort((a, b) => {
    if (filter.sort === "protein") return (b.proteinGrams ?? -1) - (a.proteinGrams ?? -1) || a.name.localeCompare(b.name);
    if (filter.sort === "calories") return (a.caloriesPerServing ?? Infinity) - (b.caloriesPerServing ?? Infinity) || a.name.localeCompare(b.name);
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });
}

/** Who a dish does not suit, by their own diet, and why — said beside the dish, never hidden. */
export function dietNotes(dish: PickerDish, people: readonly { name: string; diet: Diet }[]): { name: string; diet: Diet; clash: DietClash }[] {
  return people.flatMap((person) => {
    const clash = dietClash(person.diet, { diet: dish.diet, ingredients: dish.ingredientNames });
    return clash ? [{ name: person.name, diet: person.diet, clash }] : [];
  });
}
