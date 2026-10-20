import { describe, expect, it } from "vitest";

import type { CatalogRecipeSummary } from "./recipe-catalog";
import { dietNotes, filterDishes, NO_FILTER, pickerDishes } from "./recipe-picker";
import type { RecipeChoice } from "./repository";

const dish = (over: Partial<CatalogRecipeSummary>): CatalogRecipeSummary => ({
  id: "c-idli",
  slug: "idli",
  name: "Idli",
  region: null,
  course: "breakfast",
  diet: "veg",
  prepMinutes: 10,
  cookMinutes: 15,
  serves: 4,
  description: null,
  imageUrl: "https://x/idli.jpg",
  tags: [],
  caloriesPerServing: 180,
  proteinGrams: 6,
  carbsGrams: null,
  fatGrams: null,
  nutritionCounted: null,
  nutritionTotal: null,
  ingredientNames: ["rice", "urad dal"],
  ...over,
});

const recipe = (over: Partial<RecipeChoice>): RecipeChoice => ({
  id: "r1",
  name: "Rajma",
  totalMinutes: 40,
  serves: 4,
  available: true,
  ingredients: [],
  caloriesPerServing: 420,
  proteinGrams: 18,
  catalogRecipeId: null,
  ingredientNames: ["rajma", "onion", "ghee"],
  ...over,
});

describe("one list of recipes", () => {
  const catalog = [dish({}), dish({ id: "c-chicken", slug: "butter-chicken", name: "Butter chicken", diet: "non_veg", caloriesPerServing: 520, proteinGrams: 32, ingredientNames: ["chicken", "butter"] })];
  const own = [recipe({}), recipe({ id: "r2", name: "Idli", available: false, catalogRecipeId: "c-idli", caloriesPerServing: null, proteinGrams: null, ingredientNames: ["rice"] })];
  const dishes = pickerDishes(own, catalog);

  it("is yours, then WonderHome's not saved yet; a saved dish keeps its picture and counts", () => {
    expect(dishes.map((entry) => entry.key)).toEqual(["recipe:r1", "recipe:r2", "catalog:butter-chicken"]);
    expect(dishes[1]).toMatchObject({ imageUrl: "https://x/idli.jpg", caloriesPerServing: 180, diet: "veg" });
    expect(dishes[2]).toMatchObject({ mine: false, ready: null, minutes: 25, diet: "non_veg" });
  });

  it("filters by calories, protein, label and the family's diet, leaving out what was never counted", () => {
    expect(filterDishes(dishes, { ...NO_FILTER, maxCalories: 300 }).map((entry) => entry.name)).toEqual(["Idli"]);
    expect(filterDishes(dishes, { ...NO_FILTER, minProtein: 15 }).map((entry) => entry.name)).toEqual(["Rajma", "Butter chicken"]);
    expect(filterDishes(dishes, { ...NO_FILTER, fits: "vegetarian" }).map((entry) => entry.name)).toEqual(["Rajma", "Idli"]);
    expect(filterDishes(dishes, { ...NO_FILTER, fits: "jain" }).map((entry) => entry.name)).toEqual(["Idli"]);
    expect(filterDishes(dishes, { ...NO_FILTER, dishDiet: "non_veg" }).map((entry) => entry.name)).toEqual(["Butter chicken"]);
    expect(filterDishes(dishes, { ...NO_FILTER, query: "raj" }).map((entry) => entry.name)).toEqual(["Rajma"]);
  });

  it("sorts by most protein or fewest calories when asked", () => {
    expect(filterDishes(dishes, { ...NO_FILTER, sort: "protein" }).map((entry) => entry.name)).toEqual(["Butter chicken", "Rajma", "Idli"]);
    expect(filterDishes(dishes, { ...NO_FILTER, sort: "calories" }).map((entry) => entry.name)).toEqual(["Idli", "Rajma", "Butter chicken"]);
  });

  it("says who a dish does not suit, by their own diet", () => {
    expect(dietNotes(dishes[0]!, [{ name: "Asmi", diet: "vegan" }, { name: "Kunal", diet: "non_vegetarian" }])).toEqual([{ name: "Asmi", diet: "vegan", clash: "dairy" }]);
  });
});
