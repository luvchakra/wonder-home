"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ApiError, toErrorBody } from "@wonderhome/core/api/errors";
import { publicEnv } from "@wonderhome/core/config/env";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";
import { saveCatalogRecipe } from "@wonderhome/core/meals/catalog-copy";
import { MEAL_SLOTS } from "@wonderhome/core/meals/meals";
import { listMeals, updateMeal } from "@wonderhome/core/meals/repository";
import { daysOf, nextOption, weekdayOf, type DayChoice, type Weekday } from "@wonderhome/core/meals/week-template";
import { addTemplateOptions, listTemplateOptions, planWeekFromTemplate, removeTemplateOption, updateTemplateOption } from "@wonderhome/core/meals/week-template-repository";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The week template's own writes (the owner, 2026-10-20): an adult adds a
 * dish as an option for a day's slot (or every day, weekdays, the weekend),
 * changes it or takes it out, and fills a week from it; anyone who may plan
 * meals can ask WonderHome to choose again for one of its picks.
 */

type Result = { ok: true; count?: number } | { ok: false; error: string };

const dayChoice = z.union([z.literal("every"), z.literal("weekdays"), z.literal("weekend"), z.coerce.number().int().min(1).max(7)]);
const dishKey = z.string().regex(/^(recipe:[0-9a-f-]{36}|catalog:[a-z0-9-]{1,80})$/);

async function adult(supabase: SupabaseClient, householdId: string) {
  const membership = await requireMembership(supabase, householdId);
  if (membership.memberType !== "adult") throw ApiError.forbidden("Only an adult can change the week template.");
  return membership;
}

/** A picked dish as the household's own recipe: a WonderHome dish is saved first, as Plan a meal does. */
async function recipeOf(supabase: SupabaseClient, householdId: string, key: string): Promise<string> {
  if (key.startsWith("recipe:")) return key.slice("recipe:".length);
  const saved = await saveCatalogRecipe(supabase, { householdId, slug: key.slice("catalog:".length), supabaseUrl: publicEnv().NEXT_PUBLIC_SUPABASE_URL });
  return saved.recipeId;
}

function failed(thrown: unknown): Result {
  return { ok: false, error: toErrorBody(thrown, "meals").body.error.message };
}

export async function addTemplateOptionAction(input: { householdId: string; days: string; slot: string; dish: string }): Promise<Result> {
  const parsed = z.object({ householdId: z.uuid(), days: dayChoice, slot: z.enum(MEAL_SLOTS), dish: dishKey }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a dish, a day and a meal." };
  try {
    const supabase = await createClient();
    const membership = await adult(supabase, parsed.data.householdId);
    const recipeId = await recipeOf(supabase, parsed.data.householdId, parsed.data.dish);
    const { added } = await addTemplateOptions(supabase, {
      householdId: parsed.data.householdId,
      days: daysOf(parsed.data.days as DayChoice),
      slot: parsed.data.slot,
      recipeId,
      createdBy: membership.memberId,
    });
    revalidatePath("/meals");
    return { ok: true, count: added };
  } catch (thrown) {
    return failed(thrown);
  }
}

export async function updateTemplateOptionAction(input: { householdId: string; optionId: string; weekday: number; slot: string; dish: string }): Promise<Result> {
  const parsed = z.object({ householdId: z.uuid(), optionId: z.uuid(), weekday: z.number().int().min(1).max(7), slot: z.enum(MEAL_SLOTS), dish: dishKey }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a dish, a day and a meal." };
  try {
    const supabase = await createClient();
    await adult(supabase, parsed.data.householdId);
    const recipeId = await recipeOf(supabase, parsed.data.householdId, parsed.data.dish);
    await updateTemplateOption(supabase, { householdId: parsed.data.householdId, optionId: parsed.data.optionId, weekday: parsed.data.weekday as Weekday, slot: parsed.data.slot, recipeId });
    revalidatePath("/meals");
    return { ok: true };
  } catch (thrown) {
    return failed(thrown);
  }
}

export async function removeTemplateOptionAction(input: { householdId: string; optionId: string }): Promise<Result> {
  const parsed = z.object({ householdId: z.uuid(), optionId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please try again." };
  try {
    const supabase = await createClient();
    await adult(supabase, parsed.data.householdId);
    await removeTemplateOption(supabase, parsed.data);
    revalidatePath("/meals");
    return { ok: true };
  } catch (thrown) {
    return failed(thrown);
  }
}

/** "Plan this week from the template": fills the week's empty slots, never a planned one. */
export async function planWeekFromTemplateAction(input: { householdId: string; week: string }): Promise<Result> {
  const parsed = z.object({ householdId: z.uuid(), week: z.iso.date() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await adult(supabase, parsed.data.householdId);
    const timezone = membership.household.timezone;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
    const result = await planWeekFromTemplate(supabase, { householdId: parsed.data.householdId, week: parsed.data.week, today, timezone, memberId: membership.memberId, once: false });
    revalidatePath("/meals");
    return { ok: true, count: result?.planned ?? 0 };
  } catch (thrown) {
    return failed(thrown);
  }
}

/** "Choose again" on a meal WonderHome picked: the slot's next option, same day, time and cook. */
export async function chooseAgainAction(input: { householdId: string; mealId: string; onDate: string }): Promise<Result> {
  const parsed = z.object({ householdId: z.uuid(), mealId: z.uuid(), onDate: z.iso.date() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    const [meals, options] = await Promise.all([
      listMeals(supabase, parsed.data.householdId, { from: parsed.data.onDate, to: parsed.data.onDate }),
      listTemplateOptions(supabase, parsed.data.householdId),
    ]);
    const meal = meals.find((entry) => entry.id === parsed.data.mealId);
    if (!meal) return { ok: false, error: "That meal is no longer on the plan." };
    const next = nextOption({ options, weekday: weekdayOf(meal.onDate), slot: meal.slot, current: meal.recipe?.id ?? null });
    if (!next) return { ok: false, error: "The week template has no other dish for this meal." };
    await updateMeal(supabase, {
      householdId: parsed.data.householdId,
      mealId: meal.id,
      name: next.name,
      slot: meal.slot,
      onDate: meal.onDate,
      readyBy: meal.readyBy.toISOString(),
      cookMemberId: meal.cookMemberId,
      recipeId: next.recipeId,
      origin: "week_template",
    });
    revalidatePath("/meals");
    return { ok: true };
  } catch (thrown) {
    return failed(thrown);
  }
}
