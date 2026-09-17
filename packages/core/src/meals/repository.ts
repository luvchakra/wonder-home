import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import type { HomeAssessment } from "../home/assessment";
import { assessMeal, type IngredientNeed, type Meal, type MealSlot, type MealStatus, type Recipe } from "./meals";

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
      "id, name, slot, on_date, ready_by, cook_member_id, status, ready_at, recipes(id, name, active_minutes, total_minutes, serves), meal_ingredient_needs(name, consumable_id, quantity, unit, essential, status, substitute_name)",
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
    const recipeRow = (Array.isArray(embedded) ? embedded[0] : embedded) ?? null;

    const recipe: Recipe | null = recipeRow
      ? {
          id: recipeRow.id as string,
          name: recipeRow.name as string,
          activeMinutes: Number(recipeRow.active_minutes),
          totalMinutes: Number(recipeRow.total_minutes),
          serves: Number(recipeRow.serves),
        }
      : null;

    const ingredients: IngredientNeed[] = ((row.meal_ingredient_needs as Row[] | null) ?? []).map(
      (need) => ({
        name: need.name as string,
        consumableId: (need.consumable_id as string | null) ?? null,
        quantity: Number(need.quantity),
        unit: need.unit as string,
        essential: need.essential as boolean,
        status: need.status as IngredientNeed["status"],
        substituteName: (need.substitute_name as string | null) ?? null,
      }),
    );

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

export async function createMeal(
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
    if (error.code === "42501") throw ApiError.forbidden("You cannot plan meals for this household.");
    if (error.code === "23503") throw ApiError.badRequest("That recipe or cook is not part of this household.");
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
export async function attachIngredients(
  supabase: SupabaseClient,
  householdId: string,
  mealId: string,
  recipeId: string,
): Promise<{ attached: number }> {
  const { data, error } = await supabase
    .from("recipe_ingredients")
    .select("name, consumable_id, quantity, unit, essential")
    .eq("recipe_id", recipeId);

  if (error) throw new Error(`attachIngredients failed: ${error.code ?? "unknown"}`);

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

    if (insertError) throw new Error(`attachIngredients failed: ${insertError.code ?? "unknown"}`);
  }

  return { attached: rows.length };
}

/**
 * Turns a meal's shortages into real shopping suggestions (story 10-003).
 *
 * This is the criterion that says missing ingredients "create shopping
 * dependencies and are not treated as a generic informational insight". Each
 * shortage becomes a row the household can act on, and the meal records which
 * suggestion covers it so the two stay connected as either one changes.
 */
export async function bridgeToShopping(
  supabase: SupabaseClient,
  householdId: string,
  meal: Meal,
): Promise<{ raised: number }> {
  const shortages = meal.ingredients.filter(
    (ingredient) => ingredient.essential && ingredient.status === "needed" && ingredient.consumableId,
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
      if (error.code === "42501") throw ApiError.forbidden("You cannot add to this household's list.");
      throw new Error(`bridgeToShopping failed: ${error.code ?? "unknown"}`);
    }

    const { error: linkError } = await supabase
      .from("meal_ingredient_needs")
      .update({ status: "shopping", cart_suggestion_id: (data as Row).id as string })
      .eq("meal_id", meal.id)
      .eq("name", shortage.name);

    if (linkError) throw new Error(`bridgeToShopping failed: ${linkError.code ?? "unknown"}`);
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
