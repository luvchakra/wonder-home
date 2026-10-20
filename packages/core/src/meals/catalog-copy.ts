import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { linkIngredients } from "./ingredient-links";
import type { IngredientLine } from "./ingredient-lines";
import { getCatalogRecipe, methodFromSteps } from "./recipe-catalog";
import { createRecipe } from "./repository";

/**
 * "Save my version" (backlog 25-022): a catalog dish copied into the
 * household's own recipes, where they can change anything about it. The copy
 * remembers the dish it came from (`catalog_recipe_id`), its ingredients are
 * linked to the household's own grocery items exactly as a recipe written by
 * hand is (`linkIngredients`), and frying oil and garnishes come over as
 * nice-to-haves. Saving the same dish twice finds the copy already there.
 */
export async function saveCatalogRecipe(
  supabase: SupabaseClient,
  input: { householdId: string; slug: string; supabaseUrl: string },
): Promise<{ recipeId: string; name: string; created: boolean }> {
  const dish = await getCatalogRecipe(supabase, input.slug, input.supabaseUrl);
  if (!dish) throw ApiError.notFound("That recipe is not in the catalog.");

  const [fromDish, sameName] = await Promise.all([
    supabase.from("recipes").select("id, name").eq("household_id", input.householdId).eq("active", true).eq("catalog_recipe_id", dish.id).limit(1).maybeSingle(),
    supabase.from("recipes").select("id, name").eq("household_id", input.householdId).eq("active", true).ilike("name", dish.name.replace(/[%_\\]/g, "")).limit(1).maybeSingle(),
  ]);
  const existing = fromDish.data ?? sameName.data;
  if (existing) return { recipeId: existing.id as string, name: existing.name as string, created: false };

  const essentials: IngredientLine[] = dish.ingredients
    .filter((line) => !line.optional)
    .map((line) => ({ name: line.name, quantity: line.quantity, unit: line.unit, ...(line.groceryCatalogId ? { ref: `catalog:${line.groceryCatalogId}` } : {}) }));
  const extras: IngredientLine[] = dish.ingredients
    .filter((line) => line.optional)
    .map((line) => ({ name: line.name, quantity: 1, unit: "unit", ...(line.groceryCatalogId ? { ref: `catalog:${line.groceryCatalogId}` } : {}) }));
  const [{ lines: linked }, { lines: linkedExtras }] = await Promise.all([
    linkIngredients(supabase, { householdId: input.householdId, lines: essentials, supabaseUrl: input.supabaseUrl }),
    linkIngredients(supabase, { householdId: input.householdId, lines: extras, supabaseUrl: input.supabaseUrl }),
  ]);

  const created = await createRecipe(supabase, {
    householdId: input.householdId,
    name: dish.name,
    cuisine: dish.region,
    activeMinutes: Math.max(1, dish.cookMinutes),
    totalMinutes: Math.max(1, dish.prepMinutes + dish.cookMinutes, dish.cookMinutes),
    serves: dish.serves,
    method: methodFromSteps(dish.steps),
    source: "WonderHome recipe catalog",
    caloriesPerServing: dish.caloriesPerServing,
    proteinGrams: dish.proteinGrams,
    carbsGrams: dish.carbsGrams,
    fatGrams: dish.fatGrams,
    essentialIngredients: linked,
    optionalIngredients: linkedExtras.map((line) => ({ name: line.name, consumableId: line.consumableId ?? null })),
    catalogRecipeId: dish.id,
  });
  return { recipeId: created.id, name: dish.name, created: true };
}
