import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "../api/errors";
import { invalidatesContext } from "../context/invalidation";
import { atLocal } from "../notifications/timing";
import { checkPreferences, type MealSlot, type Preference } from "./meals";
import { attachIngredients, createMeal, listMeals } from "./repository";
import { shiftDay, SLOT_READY_BY, weekDays, weekStartOf } from "./week";
import { proposeWeek, type TemplateOption, type Weekday } from "./week-template";

/**
 * Reading and writing the week template, and filling a week from it (see
 * `week-template.ts` for the picking). Every write goes through the
 * member's own session, so RLS decides who may change the template (adults)
 * and the meals are planned with the same `createMeal` a person uses.
 */

type Row = Record<string, unknown>;

/** A table this database does not have yet: the owner has still to run the migration. */
const MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204"]);

/** The template's options, each with its recipe's name; a retired recipe is no longer offered. Empty before the migration runs. */
export async function listTemplateOptions(supabase: SupabaseClient, householdId: string): Promise<TemplateOption[]> {
  const { data, error } = await supabase
    .from("meal_week_template_options")
    .select("id, weekday, slot, recipe_id, position, recipes(name, active)")
    .eq("household_id", householdId)
    .order("position")
    .limit(500);
  if (error) {
    if (MISSING.has(error.code ?? "")) return [];
    throw new Error(`listTemplateOptions failed: ${error.code ?? "unknown"}`);
  }
  return ((data ?? []) as Row[]).flatMap((row) => {
    const embedded = row.recipes as Row | Row[] | null;
    const recipe = (Array.isArray(embedded) ? embedded[0] : embedded) ?? null;
    if (!recipe || recipe.active === false) return [];
    return [{ id: row.id as string, weekday: Number(row.weekday) as Weekday, slot: row.slot as MealSlot, recipeId: row.recipe_id as string, name: recipe.name as string, position: Number(row.position) }];
  });
}

/** Has WonderHome filled this week already? Null when the database cannot say yet. */
export async function weekPlanned(supabase: SupabaseClient, householdId: string, weekStart: string): Promise<{ planned: number } | null | false> {
  const { data, error } = await supabase.from("meal_week_plans").select("planned").eq("household_id", householdId).eq("week_start", weekStart).maybeSingle();
  if (error) return null;
  return data ? { planned: Number((data as Row).planned) } : false;
}

async function addTemplateOptionsImpl(
  supabase: SupabaseClient,
  input: { householdId: string; days: Weekday[]; slot: MealSlot; recipeId: string; createdBy: string },
): Promise<{ added: number }> {
  const { data: last } = await supabase
    .from("meal_week_template_options")
    .select("position")
    .eq("household_id", input.householdId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = Number((last as Row | null)?.position ?? -1) + 1;
  const { data, error } = await supabase
    .from("meal_week_template_options")
    .upsert(
      input.days.map((weekday) => ({ household_id: input.householdId, weekday, slot: input.slot, recipe_id: input.recipeId, position, created_by: input.createdBy })),
      { onConflict: "household_id,weekday,slot,recipe_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw templateError(error.code, "addTemplateOptions");
  return { added: data?.length ?? 0 };
}

async function updateTemplateOptionImpl(
  supabase: SupabaseClient,
  input: { householdId: string; optionId: string; weekday: Weekday; slot: MealSlot; recipeId: string },
): Promise<void> {
  const { data, error } = await supabase
    .from("meal_week_template_options")
    .update({ weekday: input.weekday, slot: input.slot, recipe_id: input.recipeId })
    .eq("household_id", input.householdId)
    .eq("id", input.optionId)
    .select("id");
  if (error) throw templateError(error.code, "updateTemplateOption");
  if (!data || data.length === 0) throw ApiError.notFound("That option is no longer in the week template.");
}

async function removeTemplateOptionImpl(supabase: SupabaseClient, input: { householdId: string; optionId: string }): Promise<void> {
  const { data, error } = await supabase.from("meal_week_template_options").delete().eq("household_id", input.householdId).eq("id", input.optionId).select("id");
  if (error) throw templateError(error.code, "removeTemplateOption");
  if (!data || data.length === 0) throw ApiError.forbidden("Only an adult can change the week template.");
}

function templateError(code: string | undefined, where: string): Error {
  if (code === "23505") return ApiError.conflict("That dish is already an option there.");
  if (code === "42501") return ApiError.forbidden("Only an adult can change the week template.");
  if (code === "23503") return ApiError.badRequest("That recipe is not part of this household.");
  if (MISSING.has(code ?? "")) return ApiError.conflict("The week template is not set up on this database yet.");
  return new Error(`${where} failed: ${code ?? "unknown"}`);
}

/** Recipes the household's own rules rule out (an allergy, a diet, an ethical rule) — a dislike only steers, never blocks. */
async function ruledOut(supabase: SupabaseClient, householdId: string, recipeIds: string[]): Promise<Set<string>> {
  if (recipeIds.length === 0) return new Set();
  const [preferences, ingredients] = await Promise.all([
    supabase.from("food_preferences").select("member_id, kind, subject, source").eq("household_id", householdId).limit(500),
    supabase.from("recipe_ingredients").select("recipe_id, name").eq("household_id", householdId).in("recipe_id", recipeIds).limit(5000),
  ]);
  const rules: Preference[] = ((preferences.data as Row[] | null) ?? []).map((row) => ({
    memberId: (row.member_id as string | null) ?? null,
    kind: row.kind as Preference["kind"],
    subject: row.subject as string,
    source: row.source as Preference["source"],
  }));
  if (rules.length === 0) return new Set();
  const eating = [...new Set(rules.flatMap((rule) => (rule.memberId ? [rule.memberId] : [])))];
  const blocked = new Set<string>();
  for (const recipeId of recipeIds) {
    const names = ((ingredients.data as Row[] | null) ?? []).filter((row) => row.recipe_id === recipeId).map((row) => ({ name: row.name as string }));
    const verdict = checkPreferences(names, rules, eating);
    if (!verdict.allowed && verdict.severity !== "disliked") blocked.add(recipeId);
  }
  return blocked;
}

/**
 * WonderHome's plan for a week, from the template, planned at once —
 * accepted by default. `once` (opening the Plan tab) claims the week first,
 * so a week is filled one time only and a meal a person removed is not put
 * back; "Plan this week from the template" fills what is still empty again.
 * Returns how many meals were planned, or null when the week was filled
 * before (or the database is not ready for it).
 */
export async function planWeekFromTemplate(
  supabase: SupabaseClient,
  input: { householdId: string; week: string; today: string; timezone: string; memberId: string; once: boolean },
): Promise<{ planned: number } | null> {
  const weekStart = weekStartOf(input.week);
  const days = weekDays(weekStart);
  if (days[6]! < input.today) return null;
  const options = await listTemplateOptions(supabase, input.householdId);
  if (options.length === 0) return null;

  const claim = { household_id: input.householdId, week_start: weekStart, planned: 0, generated_by: input.memberId };
  if (input.once) {
    const { data, error } = await supabase.from("meal_week_plans").upsert(claim, { onConflict: "household_id,week_start", ignoreDuplicates: true }).select("week_start");
    if (error || !data || data.length === 0) return null;
  } else {
    const { error } = await supabase.from("meal_week_plans").upsert(claim, { onConflict: "household_id,week_start", ignoreDuplicates: true });
    if (error && MISSING.has(error.code ?? "")) throw ApiError.conflict("The week template is not set up on this database yet.");
    if (error?.code === "42501") throw ApiError.forbidden("Only an adult can plan the week from the template.");
  }

  const [current, previous, blocked] = await Promise.all([
    listMeals(supabase, input.householdId, { from: days[0], to: days[6] }),
    listMeals(supabase, input.householdId, { from: shiftDay(weekStart, -7), to: shiftDay(weekStart, -1) }),
    ruledOut(supabase, input.householdId, [...new Set(options.map((option) => option.recipeId))]),
  ]);
  const picks = proposeWeek({
    weekStart,
    options,
    taken: current,
    lastWeek: previous.map((meal) => ({ onDate: meal.onDate, slot: meal.slot, recipeId: meal.recipe?.id ?? null })),
    today: input.today,
    blocked,
  });

  let planned = 0;
  for (const pick of picks) {
    const [hours, minutes] = SLOT_READY_BY[pick.slot].split(":").map(Number);
    const created = await createMeal(supabase, {
      householdId: input.householdId,
      name: pick.name,
      slot: pick.slot,
      onDate: pick.onDate,
      readyBy: atLocal(pick.onDate, (hours ?? 0) * 60 + (minutes ?? 0), input.timezone).toISOString(),
      recipeId: pick.recipeId,
      origin: "week_template",
    }).catch(() => null);
    if (!created) continue;
    planned += 1;
    await attachIngredients(supabase, input.householdId, created.id, pick.recipeId).catch(() => undefined);
  }
  const { data: record } = await supabase.from("meal_week_plans").select("planned").eq("household_id", input.householdId).eq("week_start", weekStart).maybeSingle();
  await supabase
    .from("meal_week_plans")
    .update({ planned: Number((record as Row | null)?.planned ?? 0) + planned, generated_at: new Date().toISOString() })
    .eq("household_id", input.householdId)
    .eq("week_start", weekStart);
  return { planned };
}

export const addTemplateOptions = invalidatesContext(addTemplateOptionsImpl, (_supabase, input) => input.householdId);
export const updateTemplateOption = invalidatesContext(updateTemplateOptionImpl, (_supabase, input) => input.householdId);
export const removeTemplateOption = invalidatesContext(removeTemplateOptionImpl, (_supabase, input) => input.householdId);
