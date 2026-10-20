"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { publicEnv } from "@wonderhome/core/config/env";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";
import { saveCatalogRecipe } from "@wonderhome/core/meals/catalog-copy";
import { MEAL_SLOTS } from "@wonderhome/core/meals/meals";
import { attachIngredients, createMeal } from "@wonderhome/core/meals/repository";
import { atLocal } from "@wonderhome/core/notifications/timing";

import type { ActionState } from "./actions";

/**
 * WonderHome's recipe catalog (25-022): "Save my version" copies a dish into
 * the household's own recipes; "Plan this" plans it for a day, saving the
 * copy first so the meal knows what it needs, through the same `createMeal`
 * and `attachIngredients` as any planned meal.
 */
const slug = z.string().regex(/^[a-z0-9-]{2,60}$/);

export async function saveCatalogRecipeAction(input: { householdId: string; slug: string }): Promise<{ ok: true; recipeId: string; created: boolean } | { ok: false; error: string }> {
  const parsed = z.object({ householdId: z.uuid(), slug }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    const saved = await saveCatalogRecipe(supabase, { householdId: parsed.data.householdId, slug: parsed.data.slug, supabaseUrl: publicEnv().NEXT_PUBLIC_SUPABASE_URL });
    revalidatePath("/meals");
    return { ok: true, recipeId: saved.recipeId, created: saved.created };
  } catch (thrown) {
    return { ok: false, error: toErrorBody(thrown, "meals").body.error.message };
  }
}

const planSchema = z.object({
  householdId: z.uuid(),
  slug,
  slot: z.enum(MEAL_SLOTS),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Choose a date." }),
  readyByTime: z.string().regex(/^\d{2}:\d{2}$/, { error: "Choose a time." }),
});

export async function planCatalogRecipeAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = planSchema.safeParse({
    householdId: formData.get("householdId"),
    slug: formData.get("slug"),
    slot: formData.get("slot"),
    onDate: formData.get("onDate"),
    readyByTime: formData.get("readyByTime"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    const saved = await saveCatalogRecipe(supabase, { householdId: parsed.data.householdId, slug: parsed.data.slug, supabaseUrl: publicEnv().NEXT_PUBLIC_SUPABASE_URL });
    const [hours, minutes] = parsed.data.readyByTime.split(":").map(Number);
    const meal = await createMeal(supabase, {
      householdId: parsed.data.householdId,
      name: saved.name,
      slot: parsed.data.slot,
      onDate: parsed.data.onDate,
      readyBy: atLocal(parsed.data.onDate, (hours ?? 0) * 60 + (minutes ?? 0), membership.household.timezone).toISOString(),
      recipeId: saved.recipeId,
    });
    await attachIngredients(supabase, parsed.data.householdId, meal.id, saved.recipeId);
    revalidatePath("/meals");
    return { notice: saved.created ? "Planned, and saved under your recipes so you can change it." : "Planned." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "meals").body.error.message };
  }
}
