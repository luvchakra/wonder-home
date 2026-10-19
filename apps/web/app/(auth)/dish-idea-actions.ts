"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { readHouseholdKey } from "@wonderhome/core/ai/credentials";
import { createDishIdeaModel } from "@wonderhome/core/ai/dish-idea-model";
import { platformKey, resolveModelKey } from "@wonderhome/core/ai/model-key";
import { routeToProvider } from "@wonderhome/core/ai/privacy";
import { loadDataUse } from "@wonderhome/core/ai/privacy-repository";
import { consume, may } from "@wonderhome/core/billing/repository";
import { publicEnv } from "@wonderhome/core/config/env";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";
import { suggestDishIdeas } from "@wonderhome/core/meals/dish-idea-service";
import type { DishIdea } from "@wonderhome/core/meals/dish-ideas";
import type { IngredientLine } from "@wonderhome/core/meals/ingredient-lines";
import { linkIngredients } from "@wonderhome/core/meals/ingredient-links";
import { nutritionPerServing } from "@wonderhome/core/meals/ingredient-nutrition";
import { MEAL_SLOTS } from "@wonderhome/core/meals/meals";
import { addMealIngredients, attachIngredients, createMeal, createRecipe } from "@wonderhome/core/meals/repository";
import { atLocal } from "@wonderhome/core/notifications/timing";

import type { ActionState } from "./actions";

/**
 * Ideas for a meal from what is at home (story 25-018): the screen half of
 * `meals/dish-ideas.ts`. The model only proposes; the rules check every idea
 * against the record before anyone sees it.
 */
export type DishIdeasReply =
  | { ok: true; ideas: DishIdea[] }
  | { ok: false; reason: "no_provider" | "not_allowed" | "nothing_at_home" | "none" | "limit" | "failed"; message: string };

const ideasSchema = z.object({ householdId: z.uuid(), slot: z.enum(MEAL_SLOTS), serves: z.number().int().min(1).max(20) });

export async function suggestDishIdeasAction(input: { householdId: string; slot: string; serves: number }): Promise<DishIdeasReply> {
  const parsed = ideasSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "failed", message: "Please try again." };
  const { householdId, slot, serves } = parsed.data;
  try {
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const planning = await may(supabase, householdId, "meals.planning");
    if (!planning.allowed) return { ok: false, reason: "not_allowed", message: planning.reason };

    const key = resolveModelKey(await readHouseholdKey(householdId).catch(() => null), platformKey());
    const policy = await loadDataUse(supabase, householdId);
    // What is at home is ordinary household content; the gate decides whether any of it may leave.
    const route = routeToProvider({ provider: key.provider, keySource: key.source, policy, hasContent: true });
    if (!route.ok || !key.provider || !key.key) {
      return route.ok || route.code === "no_provider_configured"
        ? { ok: false, reason: "no_provider", message: "Ideas need the AI assistant, which isn't set up for this household yet. An Admin can set it up in Settings → AI Assistant." }
        : { ok: false, reason: "not_allowed", message: route.reason };
    }

    // A model call is spent from the same allowance a HomeTalk message is.
    const spent = await consume(supabase, householdId, "conversation.text").catch(() => may(supabase, householdId, "conversation.text"));
    if (!spent.allowed) return { ok: false, reason: "limit", message: spent.reason };

    const result = await suggestDishIdeas(supabase, {
      householdId,
      slot,
      serves,
      model: createDishIdeaModel(key.provider, key.key),
      healthMayLeave: policy.allowedClasses.includes("health"),
    });
    if (result.status === "nothing_at_home") {
      return { ok: false, reason: "nothing_at_home", message: "Nothing is on record as being at home yet. Add what you have in Groceries, and ideas can start from it." };
    }
    if (result.status === "none") {
      return { ok: false, reason: "none", message: "No idea fitted what is at home and what the family avoids. Try another meal, or add more of what you have in Groceries." };
    }
    return { ok: true, ideas: result.ideas };
  } catch (thrown) {
    return { ok: false, reason: "failed", message: toErrorBody(thrown, "meals").body.error.message };
  }
}

const ideaSchema = z.object({
  name: z.string().trim().min(1).max(80),
  cuisine: z.string().trim().max(40).nullable(),
  totalMinutes: z.number().int().min(5).max(600),
  serves: z.number().int().min(1).max(20),
  method: z.string().trim().max(600).nullable(),
  ingredients: z
    .array(z.object({ name: z.string().trim().min(1).max(60), quantity: z.number().positive().max(10_000).nullable(), unit: z.string().trim().min(1).max(20), consumableId: z.uuid().nullable() }))
    .min(1)
    .max(20),
});

const useSchema = z.object({
  householdId: z.uuid(),
  use: z.enum(["plan", "recipe", "both"]),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  slot: z.enum(MEAL_SLOTS).optional(),
  readyByTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export type ApplyDishIdeaState = ActionState & { done?: "plan" | "recipe" | "both" };

/**
 * Plans an idea, saves it as a recipe, or both. The browser sends the idea as
 * the person saw it, the same as typing it into Plan a meal; every
 * ingredient's item is checked again here to be this household's
 * (`linkIngredients`), and a saved recipe's nutrients are worked out from
 * them, as Add a recipe does.
 */
export async function applyDishIdeaAction(_previous: ApplyDishIdeaState, formData: FormData): Promise<ApplyDishIdeaState> {
  const parsed = useSchema.safeParse({
    householdId: formData.get("householdId"),
    use: formData.get("use"),
    onDate: formData.get("onDate") || undefined,
    slot: formData.get("slot") || undefined,
    readyByTime: formData.get("readyByTime") || undefined,
  });
  let idea: z.infer<typeof ideaSchema> | null = null;
  try {
    const checked = ideaSchema.safeParse(JSON.parse(String(formData.get("idea") ?? "")));
    idea = checked.success ? checked.data : null;
  } catch {
    idea = null;
  }
  if (!parsed.success || !idea) return { error: "Something is missing. Please try again." };
  const { householdId, use } = parsed.data;
  const planning = use === "plan" || use === "both";
  if (planning && (!parsed.data.onDate || !parsed.data.slot || !parsed.data.readyByTime)) return { error: "Choose the day, the meal and when it should be ready." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);

    const typed: IngredientLine[] = idea.ingredients.map((ingredient) => ({
      name: ingredient.name,
      quantity: ingredient.quantity ?? 1,
      unit: ingredient.quantity === null ? "unit" : ingredient.unit,
      ref: ingredient.consumableId ? `item:${ingredient.consumableId}` : null,
    }));
    const { lines, entries } = await linkIngredients(supabase, { householdId, lines: typed, supabaseUrl: publicEnv().NEXT_PUBLIC_SUPABASE_URL });

    let recipeId: string | null = null;
    if (use === "recipe" || use === "both") {
      const worked = nutritionPerServing(lines, entries, idea.serves);
      const created = await createRecipe(supabase, {
        householdId,
        name: idea.name,
        cuisine: idea.cuisine,
        // Only the whole time is known; nobody has said how much of it is hands-on.
        activeMinutes: idea.totalMinutes,
        totalMinutes: idea.totalMinutes,
        serves: idea.serves,
        method: idea.method,
        source: "WonderHome idea",
        ...(worked ? { caloriesPerServing: worked.caloriesPerServing, proteinGrams: worked.proteinGrams, carbsGrams: worked.carbsGrams, fatGrams: worked.fatGrams } : {}),
        essentialIngredients: lines,
        optionalIngredients: [],
      });
      recipeId = created.id;
    }

    if (planning) {
      const [hours, minutes] = parsed.data.readyByTime!.split(":").map(Number);
      const meal = await createMeal(supabase, {
        householdId,
        name: idea.name,
        slot: parsed.data.slot!,
        onDate: parsed.data.onDate!,
        readyBy: atLocal(parsed.data.onDate!, (hours ?? 0) * 60 + (minutes ?? 0), membership.household.timezone).toISOString(),
        recipeId,
      });
      if (recipeId) await attachIngredients(supabase, householdId, meal.id, recipeId);
      else await addMealIngredients(supabase, { householdId, mealId: meal.id, lines });
    }

    revalidatePath("/meals");
    return {
      done: use,
      notice:
        use === "both"
          ? `Planned, and saved as the recipe "${idea.name}".`
          : use === "plan"
            ? "Added to the plan, with its ingredients."
            : `Saved as the recipe "${idea.name}". It'll be there to pick next time you plan a meal.`,
    };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "meals").body.error.message };
  }
}
