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
      "id, name, slot, on_date, ready_by, cook_member_id, status, ready_at, recipes(id, name, active_minutes, total_minutes, serves, calories_per_serving, protein_grams, carbs_grams, fat_grams), meal_ingredient_needs(name, consumable_id, quantity, unit, essential, status, substitute_name)",
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
    };
  });
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
  /** One name per ingredient. Quantity defaults to 1 unit each — a household can refine amounts later by editing the recipe. */
  essentialIngredients: string[];
  optionalIngredients: string[];
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

  const ingredientRows = [
    ...input.essentialIngredients.map((name) => ({ name, essential: true })),
    ...input.optionalIngredients.map((name) => ({ name, essential: false })),
  ].map((ingredient) => ({
    household_id: input.householdId,
    recipe_id: recipeId,
    name: ingredient.name,
    quantity: 1,
    unit: "unit",
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
  }[];
};

async function recipesWithIngredients(
  supabase: SupabaseClient,
  householdId: string,
): Promise<RecipeWithIngredients[]> {
  const { data, error } = await supabase
    .from("recipes")
    .select(
      "id, name, active_minutes, total_minutes, serves, recipe_ingredients(name, consumable_id, essential)",
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
    };
  });

  return choices.sort((a, b) =>
    a.available === b.available ? a.name.localeCompare(b.name) : a.available ? -1 : 1,
  );
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

export type MealAgenda = { meals: HomeAssessment[]; checked: number };

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
  };
}

// Every write forgets the household's cached context once it succeeds, so
// the next HomeTalk answer sees the change (Wave 1 §14).
export const createMeal = invalidatesContext(createMealImpl, (_supabase, input) => input.householdId);
export const createRecipe = invalidatesContext(createRecipeImpl, (_supabase, input) => input.householdId);
export const createFoodPreference = invalidatesContext(createFoodPreferenceImpl, (_supabase, input) => input.householdId);
export const attachIngredients = invalidatesContext(attachIngredientsImpl, (_supabase, householdId) => householdId);
export const attachRecipeToMeal = invalidatesContext(attachRecipeToMealImpl, (_supabase, householdId) => householdId);
export const bridgeToShopping = invalidatesContext(bridgeToShoppingImpl, (_supabase, householdId) => householdId);
