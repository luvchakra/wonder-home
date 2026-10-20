import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { listConsumables } from "../commerce/repository";
import { suggestPurchase } from "../commerce/consumables";
import type { HomeAssessment } from "../home/assessment";
import {
  assessMeal,
  checkPreferences,
  choosePlan,
  type IngredientNeed,
  type Meal,
  type MealSlot,
  type MealStatus,
  type PlanCandidate,
  type PlanChoice,
  type Preference,
  type Recipe,
} from "./meals";
import { invalidatesContext } from "../context/invalidation";
import type { IngredientLine } from "./ingredient-lines";

/**
 * Reading and writing meals (module 10).
 *
 * The important function here is `bridgeToShopping`. The acceptance criterion
 * says a missing ingredient must become a shopping dependency and must not be
 * "treated as a generic informational insight", so a shortage writes a real row
 * into the shopping domain — one the household can see, defer or remove like
 * any other suggestion — and the meal keeps a pointer to it.
 */

type Row = Record<string, unknown>;

export async function listMeals(
  supabase: SupabaseClient,
  householdId: string,
  options: { from?: string; to?: string } = {},
): Promise<Meal[]> {
  let query = supabase
    .from("meals")
    .select(
      "id, name, slot, on_date, ready_by, cook_member_id, status, ready_at, servings, recipes(id, name, active_minutes, total_minutes, serves, calories_per_serving, protein_grams, carbs_grams, fat_grams), meal_ingredient_needs(name, consumable_id, quantity, unit, essential, status, substitute_name)",
    )
    .eq("household_id", householdId)
    .order("ready_by", { ascending: true });

  if (options.from) query = query.gte("on_date", options.from);
  if (options.to) query = query.lte("on_date", options.to);

  const { data, error } = await query;
  if (error) throw new Error(`listMeals failed: ${error.code ?? "unknown"}`);

  return (data ?? []).map((row: Row) => {
    // PostgREST types a to-one embed as an array; normalising here keeps the
    // domain shape clean rather than leaking the client's quirk outwards.
    const embedded = row.recipes as Row | Row[] | null;
    const recipeRow =
      (Array.isArray(embedded) ? embedded[0] : embedded) ?? null;

    const recipe: Recipe | null = recipeRow
      ? {
          id: recipeRow.id as string,
          name: recipeRow.name as string,
          activeMinutes: Number(recipeRow.active_minutes),
          totalMinutes: Number(recipeRow.total_minutes),
          serves: Number(recipeRow.serves),
          caloriesPerServing:
            recipeRow.calories_per_serving === null ||
            recipeRow.calories_per_serving === undefined
              ? null
              : Number(recipeRow.calories_per_serving),
          proteinGrams:
            recipeRow.protein_grams === null ||
            recipeRow.protein_grams === undefined
              ? null
              : Number(recipeRow.protein_grams),
          carbsGrams:
            recipeRow.carbs_grams === null ||
            recipeRow.carbs_grams === undefined
              ? null
              : Number(recipeRow.carbs_grams),
          fatGrams:
            recipeRow.fat_grams === null || recipeRow.fat_grams === undefined
              ? null
              : Number(recipeRow.fat_grams),
        }
      : null;

    const ingredients: IngredientNeed[] = (
      (row.meal_ingredient_needs as Row[] | null) ?? []
    ).map((need) => ({
      name: need.name as string,
      consumableId: (need.consumable_id as string | null) ?? null,
      quantity: Number(need.quantity),
      unit: need.unit as string,
      essential: need.essential as boolean,
      status: need.status as IngredientNeed["status"],
      substituteName: (need.substitute_name as string | null) ?? null,
    }));

    return {
      id: row.id as string,
      name: row.name as string,
      slot: row.slot as MealSlot,
      onDate: row.on_date as string,
      readyBy: new Date(row.ready_by as string),
      cookMemberId: (row.cook_member_id as string | null) ?? null,
      status: row.status as MealStatus,
      readyAt: row.ready_at ? new Date(row.ready_at as string) : null,
      recipe,
      ingredients,
      servings: row.servings === null || row.servings === undefined ? null : Number(row.servings),
    };
  });
}

/** How many a meal is for (25-003a): 1–50, or null for as many as the recipe serves. */
async function setMealServingsImpl(supabase: SupabaseClient, input: { householdId: string; mealId: string; servings: number | null }): Promise<void> {
  const servings = input.servings === null ? null : Math.round(input.servings);
  if (servings !== null && (servings < 1 || servings > 50)) throw ApiError.badRequest("Servings are between 1 and 50.");
  const { error } = await supabase.from("meals").update({ servings }).eq("household_id", input.householdId).eq("id", input.mealId);
  if (error) throw new Error(`setMealServings failed: ${error.code ?? "unknown"}`);
}

export type CreateMealInput = {
  householdId: string;
  name: string;
  slot: MealSlot;
  onDate: string;
  readyBy: string;
  recipeId?: string | null;
  cookMemberId?: string | null;
};

async function createMealImpl(
  supabase: SupabaseClient,
  input: CreateMealInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("meals")
    .insert({
      household_id: input.householdId,
      name: input.name,
      slot: input.slot,
      on_date: input.onDate,
      ready_by: input.readyBy,
      recipe_id: input.recipeId ?? null,
      cook_member_id: input.cookMemberId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw ApiError.conflict("That slot already has a meal planned.");
    }
    if (error.code === "42501")
      throw ApiError.forbidden("You cannot plan meals for this household.");
    if (error.code === "23503")
      throw ApiError.badRequest(
        "That recipe or cook is not part of this household.",
      );
    throw new Error(`createMeal failed: ${error.code ?? "unknown"}`);
  }

  return { id: (data as Row).id as string };
}

export type UpdateMealInput = CreateMealInput & { mealId: string };

/**
 * Changing a planned meal in place (the meal card's "Change meal"): what it
 * is, when, who cooks and which recipe. A new recipe brings its ingredients
 * with it; what this meal already put on the shopping list stays as it is,
 * and the old recipe's needs that were only waiting are replaced.
 */
async function updateMealImpl(supabase: SupabaseClient, input: UpdateMealInput): Promise<void> {
  const { data: before, error: readError } = await supabase
    .from("meals")
    .select("recipe_id, status")
    .eq("household_id", input.householdId)
    .eq("id", input.mealId)
    .maybeSingle();
  if (readError) throw new Error(`updateMeal failed: ${readError.code ?? "unknown"}`);
  if (!before) throw ApiError.notFound("That meal is no longer on the plan.");
  const { error } = await supabase
    .from("meals")
    .update({
      name: input.name,
      slot: input.slot,
      on_date: input.onDate,
      ready_by: input.readyBy,
      recipe_id: input.recipeId ?? null,
      cook_member_id: input.cookMemberId ?? null,
    })
    .eq("household_id", input.householdId)
    .eq("id", input.mealId);
  if (error) {
    if (error.code === "23505") throw ApiError.conflict("That slot already has a meal planned. Change or remove that one first.");
    if (error.code === "42501") throw ApiError.forbidden("You cannot change this meal.");
    if (error.code === "23503") throw ApiError.badRequest("That recipe or cook is not part of this household.");
    throw new Error(`updateMeal failed: ${error.code ?? "unknown"}`);
  }
  const recipeId = input.recipeId ?? null;
  if (recipeId !== ((before as Row).recipe_id ?? null)) {
    const { error: clearError } = await supabase
      .from("meal_ingredient_needs")
      .delete()
      .eq("household_id", input.householdId)
      .eq("meal_id", input.mealId)
      .in("status", ["needed", "missing", "have"]);
    if (clearError) throw new Error(`updateMeal failed: ${clearError.code ?? "unknown"}`);
    if (recipeId) await attachIngredientsImpl(supabase, input.householdId, input.mealId, recipeId);
  }
}

/**
 * Taking a meal off the plan. Only a meal still to come can go; one that was
 * cooked or eaten is the household's record. Anything it already put on the
 * shopping list stays there, no longer tied to the meal.
 */
async function removeMealImpl(supabase: SupabaseClient, input: { householdId: string; mealId: string }): Promise<void> {
  const { data, error } = await supabase
    .from("meals")
    .delete()
    .eq("household_id", input.householdId)
    .eq("id", input.mealId)
    .in("status", ["planned", "at_risk", "replanned"])
    .select("id");
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You cannot change this meal.");
    throw new Error(`removeMeal failed: ${error.code ?? "unknown"}`);
  }
  if (!data || data.length === 0) throw ApiError.conflict("Only a meal still to come can be taken off the plan.");
}

/**
 * Writing down what a meal needs when it has no recipe — "500 g rajma",
 * "rice", "2 onions". Each line is the meal's own ingredient; a recipe is
 * never invented for it.
 */
async function addMealIngredientsImpl(
  supabase: SupabaseClient,
  input: { householdId: string; mealId: string; lines: IngredientLine[] },
): Promise<{ added: number }> {
  const rows = input.lines
    .filter((line) => line.name.trim())
    .slice(0, 40)
    .map((line) => ({
      household_id: input.householdId,
      meal_id: input.mealId,
      consumable_id: line.consumableId ?? null,
      name: line.name.trim().slice(0, 120),
      quantity: line.quantity,
      unit: line.unit,
      essential: true,
      status: "needed",
    }));
  if (rows.length === 0) throw ApiError.badRequest("Write at least one ingredient.");
  const { error } = await supabase.from("meal_ingredient_needs").upsert(rows, { onConflict: "meal_id,name" });
  if (error) {
    if (error.code === "42501") throw ApiError.forbidden("You cannot change this meal.");
    throw new Error(`addMealIngredients failed: ${error.code ?? "unknown"}`);
  }
  return { added: rows.length };
}

/**
 * Copies a recipe's ingredients onto a planned meal.
 *
 * Done at planning time rather than read through the recipe, so that changing a
 * recipe afterwards does not silently rewrite what a meal already committed to
 * — and so a household can adjust one dinner without editing the recipe they
 * cook every month.
 */
async function attachIngredientsImpl(
  supabase: SupabaseClient,
  householdId: string,
  mealId: string,
  recipeId: string,
): Promise<{ attached: number }> {
  const { data, error } = await supabase
    .from("recipe_ingredients")
    .select("name, consumable_id, quantity, unit, essential")
    .eq("recipe_id", recipeId);

  if (error)
    throw new Error(`attachIngredients failed: ${error.code ?? "unknown"}`);

  const rows = (data ?? []).map((row: Row) => ({
    household_id: householdId,
    meal_id: mealId,
    consumable_id: (row.consumable_id as string | null) ?? null,
    name: row.name as string,
    quantity: Number(row.quantity),
    unit: row.unit as string,
    essential: row.essential as boolean,
    status: "needed",
  }));

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("meal_ingredient_needs")
      .upsert(rows, { onConflict: "meal_id,name" });

    if (insertError)
      throw new Error(
        `attachIngredients failed: ${insertError.code ?? "unknown"}`,
      );
  }

  return { attached: rows.length };
}

/**
 * Attaching an existing recipe to a meal that was planned without one — the
 * per-meal half of "add a recipe" (a household batch item). Copies the
 * recipe's ingredients onto the meal the same way planning with a recipe
 * from the start does, via `attachIngredients`.
 */
async function attachRecipeToMealImpl(
  supabase: SupabaseClient,
  householdId: string,
  mealId: string,
  recipeId: string,
): Promise<void> {
  const { error } = await supabase
    .from("meals")
    .update({ recipe_id: recipeId })
    .eq("id", mealId)
    .eq("household_id", householdId);

  if (error) {
    if (error.code === "42501")
      throw ApiError.forbidden("You cannot change this meal.");
    if (error.code === "23503")
      throw ApiError.badRequest("That recipe is not part of this household.");
    throw new Error(`attachRecipeToMeal failed: ${error.code ?? "unknown"}`);
  }

  await attachIngredients(supabase, householdId, mealId, recipeId);
}

export type CreateRecipeInput = {
  householdId: string;
  name: string;
  cuisine?: string | null;
  activeMinutes: number;
  totalMinutes: number;
  serves: number;
  method?: string | null;
  source?: string | null;
  caloriesPerServing?: number | null;
  proteinGrams?: number | null;
  carbsGrams?: number | null;
  fatGrams?: number | null;
  /** Each raw item with how much the recipe needs (`meals/ingredient-lines.ts`); "unit" where the amount is not known. */
  essentialIngredients: IngredientLine[];
  /** Nice to have, by name only: they never become a shopping need, so no amount is kept. Linked to the household's item where one was picked (25-017). */
  optionalIngredients: readonly (string | { name: string; consumableId?: string | null })[];
};

/**
 * A recipe typed in by hand, so it can be selected the next time a meal is
 * planned (a household batch item: "add a new recipe... available for
 * selection in plan a meal section"). Every ingredient becomes a real
 * `recipe_ingredients` row so `attachIngredients` has something to copy.
 */
async function createRecipeImpl(
  supabase: SupabaseClient,
  input: CreateRecipeInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("recipes")
    .insert({
      household_id: input.householdId,
      name: input.name,
      cuisine: input.cuisine ?? null,
      active_minutes: input.activeMinutes,
      total_minutes: input.totalMinutes,
      serves: input.serves,
      method: input.method ?? null,
      source: input.source ?? null,
      calories_per_serving: input.caloriesPerServing ?? null,
      protein_grams: input.proteinGrams ?? null,
      carbs_grams: input.carbsGrams ?? null,
      fat_grams: input.fatGrams ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505")
      throw ApiError.conflict("A recipe with that name already exists.");
    if (error.code === "42501")
      throw ApiError.forbidden("You cannot add a recipe for this household.");
    throw new Error(`createRecipe failed: ${error.code ?? "unknown"}`);
  }

  const recipeId = (data as Row).id as string;

  const essentialNames = new Set(input.essentialIngredients.map((line) => line.name.toLowerCase()));
  const ingredientRows = [
    ...input.essentialIngredients.map((line) => ({ name: line.name, quantity: line.quantity, unit: line.unit, consumableId: line.consumableId ?? null, essential: true })),
    // An optional item already listed as essential is the same row (unique per recipe and name).
    ...input.optionalIngredients
      .map((entry) => (typeof entry === "string" ? { name: entry, consumableId: null } : entry))
      .filter((entry) => !essentialNames.has(entry.name.toLowerCase()))
      .map((entry) => ({ name: entry.name, quantity: 1, unit: "unit", consumableId: entry.consumableId ?? null, essential: false })),
  ].map((ingredient) => ({
    household_id: input.householdId,
    recipe_id: recipeId,
    consumable_id: ingredient.consumableId,
    name: ingredient.name,
    quantity: ingredient.quantity,
    unit: ingredient.unit,
    essential: ingredient.essential,
  }));

  if (ingredientRows.length > 0) {
    const { error: ingredientError } = await supabase
      .from("recipe_ingredients")
      .insert(ingredientRows);
    if (ingredientError)
      throw new Error(
        `createRecipe (ingredients) failed: ${ingredientError.code ?? "unknown"}`,
      );
  }

  return { id: recipeId };
}

/**
 * A recipe's essentials, replaced with what was written when planning a meal
 * from it and choosing "Save to the recipe" (25-019). An item keeps its
 * grocery link when it is still there by name; nice-to-have items stay as
 * they were, unless one is now an essential.
 */
async function replaceRecipeEssentialsImpl(
  supabase: SupabaseClient,
  input: { householdId: string; recipeId: string; lines: IngredientLine[] },
): Promise<void> {
  const { data, error } = await supabase.from("recipe_ingredients").select("name, consumable_id, essential").eq("household_id", input.householdId).eq("recipe_id", input.recipeId);
  if (error) throw new Error(`replaceRecipeEssentials failed: ${error.code ?? "unknown"}`);
  const before = (data ?? []) as Row[];
  const linkOf = new Map(before.map((row) => [String(row.name).toLowerCase(), (row.consumable_id as string | null) ?? null]));
  const keep = new Set(input.lines.map((line) => line.name.toLowerCase()));
  const drop = before.filter((row) => row.essential === true || keep.has(String(row.name).toLowerCase())).map((row) => row.name as string);
  if (drop.length > 0) {
    const { error: deleteError } = await supabase.from("recipe_ingredients").delete().eq("household_id", input.householdId).eq("recipe_id", input.recipeId).in("name", drop);
    if (deleteError) throw new Error(`replaceRecipeEssentials failed: ${deleteError.code ?? "unknown"}`);
  }
  if (input.lines.length === 0) return;
  const { error: insertError } = await supabase.from("recipe_ingredients").insert(
    input.lines.map((line) => ({
      household_id: input.householdId,
      recipe_id: input.recipeId,
      consumable_id: line.consumableId ?? linkOf.get(line.name.toLowerCase()) ?? null,
      name: line.name,
      quantity: line.quantity,
      unit: line.unit,
      essential: true,
    })),
  );
  if (insertError) throw new Error(`replaceRecipeEssentials failed: ${insertError.code ?? "unknown"}`);
}

/**
 * A planned meal's essentials, made exactly what was written for it (25-019:
 * "just for this meal"): an item no longer listed is dropped from what the
 * meal needs, a changed amount is the new amount, and a new item is added.
 * An item that was already on its way (on the list, substituted) keeps that
 * state; nice-to-have items are left alone. The recipe is not touched.
 */
async function setMealEssentialsImpl(
  supabase: SupabaseClient,
  input: { householdId: string; mealId: string; lines: IngredientLine[] },
): Promise<void> {
  const { data, error } = await supabase.from("meal_ingredient_needs").select("name, consumable_id, essential, status").eq("household_id", input.householdId).eq("meal_id", input.mealId);
  if (error) throw new Error(`setMealEssentials failed: ${error.code ?? "unknown"}`);
  const before = (data ?? []) as Row[];
  const keep = new Set(input.lines.map((line) => line.name.toLowerCase()));
  const gone = before.filter((row) => row.essential === true && !keep.has(String(row.name).toLowerCase())).map((row) => row.name as string);
  if (gone.length > 0) {
    const { error: deleteError } = await supabase.from("meal_ingredient_needs").delete().eq("household_id", input.householdId).eq("meal_id", input.mealId).in("name", gone);
    if (deleteError) throw new Error(`setMealEssentials failed: ${deleteError.code ?? "unknown"}`);
  }
  if (input.lines.length === 0) return;
  const existing = new Map(before.map((row) => [String(row.name).toLowerCase(), row]));
  const rows = input.lines.slice(0, 40).map((line) => {
    const was = existing.get(line.name.toLowerCase());
    return {
      household_id: input.householdId,
      meal_id: input.mealId,
      consumable_id: line.consumableId ?? (was?.consumable_id as string | null | undefined) ?? null,
      name: (was?.name as string | undefined) ?? line.name,
      quantity: line.quantity,
      unit: line.unit,
      essential: true,
      status: (was?.status as string | undefined) ?? "needed",
    };
  });
  const { error: upsertError } = await supabase.from("meal_ingredient_needs").upsert(rows, { onConflict: "meal_id,name" });
  if (upsertError) throw new Error(`setMealEssentials failed: ${upsertError.code ?? "unknown"}`);
}

export type CreatePreferenceInput = {
  householdId: string;
  memberId: string | null;
  kind: Preference["kind"];
  subject: string;
};

/**
 * A preference told to WonderHome by hand, rather than through conversation —
 * the manual half of the "Tell WonderHome" chat link. Member scope and
 * source stay exactly as `food_preferences_write_own`'s RLS already treats
 * them: null (whole household), the caller's own member, or, for an admin,
 * anybody's.
 */
async function createFoodPreferenceImpl(
  supabase: SupabaseClient,
  input: CreatePreferenceInput,
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from("food_preferences")
    .upsert(
      {
        household_id: input.householdId,
        member_id: input.memberId,
        kind: input.kind,
        subject: input.subject,
        source: "member_stated",
      },
      { onConflict: "household_id,member_id,subject" },
    )
    .select("id")
    .single();

  if (error) {
    if (error.code === "42501")
      throw ApiError.forbidden(
        "You can only state a preference for yourself or the whole household.",
      );
    if (error.code === "23503")
      throw ApiError.badRequest("That member is not part of this household.");
    throw new Error(`createFoodPreference failed: ${error.code ?? "unknown"}`);
  }

  return { id: (data as Row).id as string };
}

/** One recipe with its ingredient list, for building `PlanCandidate`s. */
type RecipeWithIngredients = {
  recipe: Recipe;
  ingredients: {
    name: string;
    consumableId: string | null;
    essential: boolean;
    quantity: number;
    unit: string;
  }[];
};

async function recipesWithIngredients(
  supabase: SupabaseClient,
  householdId: string,
): Promise<RecipeWithIngredients[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select(
      "id, name, active_minutes, total_minutes, serves, recipe_ingredients(name, consumable_id, essential, quantity, unit)",
    )
    .eq("household_id", householdId);

  if (error)
    throw new Error(
      `recipesWithIngredients failed: ${error.code ?? "unknown"}`,
    );

  return (data ?? []).map((row: Row) => ({
    recipe: {
      id: row.id as string,
      name: row.name as string,
      activeMinutes: Number(row.active_minutes),
      totalMinutes: Number(row.total_minutes),
      serves: Number(row.serves),
    },
    ingredients: ((row.recipe_ingredients as Row[] | null) ?? []).map(
      (ingredient) => ({
        name: ingredient.name as string,
        consumableId: (ingredient.consumable_id as string | null) ?? null,
        essential: ingredient.essential as boolean,
        quantity: Number(ingredient.quantity ?? 1),
        unit: (ingredient.unit as string | null) ?? "unit",
      }),
    ),
  }));
}

export type RecipeChoice = {
  id: string;
  name: string;
  totalMinutes: number;
  serves: number;
  /** Every essential ingredient that's linked to a consumable is in stock. */
  available: boolean;
  /** What it needs, essentials only, with amounts: what "Plan a meal" fills in when the recipe is picked (25-019). */
  ingredients: IngredientLine[];
};

/**
 * Every recipe the household has, each flagged with whether it's cookable
 * right now — the same essential-ingredient-in-stock check `suggestMeal`
 * already runs, reused here so "Plan a meal" can offer what's actually
 * available first instead of a flat alphabetical list. Nothing is filtered
 * out: a recipe short an ingredient still needs to be pickable, since
 * planning it is exactly what turns that shortage into a real shopping item.
 */
export async function listRecipeChoices(
  supabase: SupabaseClient,
  householdId: string,
): Promise<RecipeChoice[]> {
  const [recipes, consumables] = await Promise.all([
    recipesWithIngredients(supabase, householdId),
    listConsumables(supabase, householdId),
  ]);

  const consumableIds = new Set(consumables.map((consumable) => consumable.id));

  const choices: RecipeChoice[] = recipes.map(({ recipe, ingredients }) => {
    const missingEssential = ingredients.some(
      (ingredient) => ingredient.essential && ingredient.consumableId && !consumableIds.has(ingredient.consumableId),
    );
    return {
      id: recipe.id,
      name: recipe.name,
      totalMinutes: recipe.totalMinutes,
      serves: recipe.serves,
      available: !missingEssential,
      ingredients: ingredients.filter((ingredient) => ingredient.essential).map((ingredient) => ({ name: ingredient.name, quantity: ingredient.quantity, unit: ingredient.unit })),
    };
  });

  return choices.sort((a, b) =>
    a.available === b.available ? a.name.localeCompare(b.name) : a.available ? -1 : 1,
  );
}

/** The household's recipes by name — what "plan pasta" can mean (Wave 4 §11). */
export async function listRecipeNames(supabase: SupabaseClient, householdId: string): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from("recipes").select("id, name").eq("household_id", householdId);
  if (error) throw new Error(`listRecipeNames failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => ({ id: row.id as string, name: row.name as string }));
}

/**
 * What a planned meal needs — or, before it is planned, its recipe — by
 * ingredient name: what "make sure we have everything" is checked against.
 */
export async function ingredientNames(
  supabase: SupabaseClient,
  householdId: string,
  of: { mealId?: string | null; recipeId?: string | null },
): Promise<string[]> {
  // The meal's own needs first; the recipe it is named after when the meal carries none.
  if (of.mealId) {
    const { data, error } = await supabase.from("meal_ingredient_needs").select("name").eq("household_id", householdId).eq("meal_id", of.mealId);
    if (error) throw new Error(`ingredientNames failed: ${error.code ?? "unknown"}`);
    const names = ((data as Row[] | null) ?? []).map((row) => row.name as string);
    if (names.length > 0 || !of.recipeId) return names;
  }
  if (!of.recipeId) return [];
  const { data, error } = await supabase.from("recipe_ingredients").select("name").eq("household_id", householdId).eq("recipe_id", of.recipeId);
  if (error) throw new Error(`ingredientNames failed: ${error.code ?? "unknown"}`);
  return ((data as Row[] | null) ?? []).map((row) => row.name as string);
}

export type MealSuggestion = {
  choice: PlanChoice;
  /** Essential ingredients of the chosen recipe that are running low — surfaced immediately, not buried in a shopping list. */
  lowStock: string[];
};

/**
 * What to cook next, checked against what the household actually has (a
 * household batch item: "check the available raw materials, previous
 * meals etc to suggest something... if any ingredient is running low then
 * point it out immediately").
 *
 * Built entirely on `choosePlan` and `suggestPurchase` — both already
 * existed, unit-tested, and unused by any route until this. "Previous
 * meals" is not weighed: there is no record of how often a recipe has been
 * cooked to weigh it against, and inventing one would be exactly the kind
 * of unsourced figure design principle 9 forbids.
 */
export async function suggestMeal(
  supabase: SupabaseClient,
  householdId: string,
  options: { onDate: string; now?: Date },
): Promise<MealSuggestion | null> {
  const now = options.now ?? new Date();
  const today = now.toISOString().slice(0, 10);

  const [recipes, consumables, preferenceRows, memberRows] = await Promise.all([
    recipesWithIngredients(supabase, householdId),
    listConsumables(supabase, householdId),
    supabase
      .from("food_preferences")
      .select("member_id, kind, subject, source")
      .eq("household_id", householdId),
    supabase
      .from("household_members")
      .select("id")
      .eq("household_id", householdId)
      .eq("status", "active"),
  ]);

  if (recipes.length === 0) return null;

  const preferences: Preference[] = (
    (preferenceRows.data as Row[] | null) ?? []
  ).map((row) => ({
    memberId: (row.member_id as string | null) ?? null,
    kind: row.kind as Preference["kind"],
    subject: row.subject as string,
    source: row.source as Preference["source"],
  }));
  const eating = ((memberRows.data as Row[] | null) ?? []).map(
    (row) => row.id as string,
  );

  const consumableById = new Map(
    consumables.map((consumable) => [consumable.id, consumable]),
  );
  const lowStockNames = new Set(
    consumables
      .filter((consumable) => suggestPurchase(consumable, now) !== null)
      .map((consumable) => consumable.name),
  );

  const candidates: PlanCandidate[] = recipes.map(({ recipe, ingredients }) => {
    const missingEssential = ingredients
      .filter(
        (ingredient) =>
          ingredient.essential &&
          ingredient.consumableId &&
          !consumableById.has(ingredient.consumableId),
      )
      .map((ingredient) => ingredient.name);

    return {
      recipe,
      missingEssential,
      preference: checkPreferences(ingredients, preferences, eating),
    };
  });

  const choice = choosePlan(candidates, {
    minutesAvailable: 240,
    canShopBefore: options.onDate > today,
  });

  const chosenRecipeId = choice.kind === "defer" ? null : choice.recipe.id;
  const chosenIngredients =
    recipes.find((entry) => entry.recipe.id === chosenRecipeId)?.ingredients ??
    [];
  const lowStock = chosenIngredients
    .filter(
      (ingredient) =>
        ingredient.essential && lowStockNames.has(ingredient.name),
    )
    .map((ingredient) => ingredient.name);

  return { choice, lowStock };
}

/**
 * Turns a meal's shortages into real shopping suggestions (story 10-003).
 *
 * This is the criterion that says missing ingredients "create shopping
 * dependencies and are not treated as a generic informational insight". Each
 * shortage becomes a row the household can act on, and the meal records which
 * suggestion covers it so the two stay connected as either one changes.
 */
async function bridgeToShoppingImpl(
  supabase: SupabaseClient,
  householdId: string,
  meal: Meal,
): Promise<{ raised: number }> {
  const shortages = meal.ingredients.filter(
    (ingredient) =>
      ingredient.essential &&
      ingredient.status === "needed" &&
      ingredient.consumableId,
  );

  let raised = 0;

  for (const shortage of shortages) {
    const { data, error } = await supabase
      .from("cart_suggestions")
      .upsert(
        {
          household_id: householdId,
          consumable_id: shortage.consumableId,
          quantity: shortage.quantity,
          reason: `Needed for ${meal.name} on ${meal.onDate}.`,
          // The household said it wanted this meal, which is why this is here.
          evidence_basis: "member_stated",
          needed_by: meal.onDate,
          status: "suggested",
        },
        { onConflict: "household_id,consumable_id,status" },
      )
      .select("id")
      .single();

    if (error) {
      if (error.code === "42501")
        throw ApiError.forbidden("You cannot add to this household's list.");
      throw new Error(`bridgeToShopping failed: ${error.code ?? "unknown"}`);
    }

    const { error: linkError } = await supabase
      .from("meal_ingredient_needs")
      .update({
        status: "shopping",
        cart_suggestion_id: (data as Row).id as string,
      })
      .eq("meal_id", meal.id)
      .eq("name", shortage.name);

    if (linkError)
      throw new Error(
        `bridgeToShopping failed: ${linkError.code ?? "unknown"}`,
      );
    raised += 1;
  }

  return { raised };
}

export type MealAgenda = {
  meals: HomeAssessment[];
  checked: number;
  /** The meals it was assessed from (today onwards), so a screen that lists them needs no second read. */
  rows: Meal[];
};

export async function mealAgenda(
  supabase: SupabaseClient,
  householdId: string,
  options: { now?: Date } = {},
): Promise<MealAgenda> {
  const now = options.now ?? new Date();
  const today = now.toISOString().slice(0, 10);

  const meals = await listMeals(supabase, householdId, { from: today });

  return {
    meals: meals
      // Availability comes from module 12's calendar once it exists. Until then
      // the cook is assumed available, which overstates rather than understates
      // — nothing is called at risk purely because WonderHome cannot see a diary.
      .map((meal) => assessMeal(meal, { now, cookAvailable: true }))
      .filter((assessment) => assessment.notable),
    checked: meals.length,
    rows: meals,
  };
}

// Every write forgets the household's cached context once it succeeds, so
// the next HomeTalk answer sees the change (Wave 1 §14).
export const createMeal = invalidatesContext(createMealImpl, (_supabase, input) => input.householdId);
export const createRecipe = invalidatesContext(createRecipeImpl, (_supabase, input) => input.householdId);
export const createFoodPreference = invalidatesContext(createFoodPreferenceImpl, (_supabase, input) => input.householdId);
export const attachIngredients = invalidatesContext(attachIngredientsImpl, (_supabase, householdId) => householdId);
export const attachRecipeToMeal = invalidatesContext(attachRecipeToMealImpl, (_supabase, householdId) => householdId);
export const updateMeal = invalidatesContext(updateMealImpl, (_supabase, input) => input.householdId);
export const removeMeal = invalidatesContext(removeMealImpl, (_supabase, input) => input.householdId);
export const replaceRecipeEssentials = invalidatesContext(replaceRecipeEssentialsImpl, (_supabase, input) => input.householdId);
export const setMealEssentials = invalidatesContext(setMealEssentialsImpl, (_supabase, input) => input.householdId);
export const addMealIngredients = invalidatesContext(addMealIngredientsImpl, (_supabase, input) => input.householdId);
/** The ingredients just put on the list for a meal are "shopping" — on the list, not yet bought. */
async function markNeedsOnListImpl(supabase: SupabaseClient, input: { householdId: string; mealId: string; names: string[] }): Promise<void> {
  if (input.names.length === 0) return;
  const { error } = await supabase
    .from("meal_ingredient_needs")
    .update({ status: "shopping" })
    .eq("household_id", input.householdId)
    .eq("meal_id", input.mealId)
    .in("name", input.names)
    .in("status", ["needed", "missing"]);
  if (error) throw new Error(`markNeedsOnList failed: ${error.code ?? "unknown"}`);
}

export const markNeedsOnList = invalidatesContext(markNeedsOnListImpl, (_supabase, input) => input.householdId);
export const setMealServings = invalidatesContext(setMealServingsImpl, (_supabase, input) => input.householdId);
export const bridgeToShopping = invalidatesContext(bridgeToShoppingImpl, (_supabase, householdId) => householdId);
