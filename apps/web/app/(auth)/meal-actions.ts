"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";
import {
  MEAL_SLOTS,
  PREFERENCE_KINDS,
  type PlanChoice,
} from "@wonderhome/core/meals/meals";
import { adjustListEntry, listGroceries } from "@wonderhome/core/commerce/inventory";
import { searchCatalog } from "@wonderhome/core/commerce/catalog";
import type { IngredientChoice } from "@wonderhome/core/ui/ingredient-rows";
import { catalogItemFor } from "@wonderhome/core/commerce/catalog";
import { createConsumable } from "@wonderhome/core/commerce/repository";
import { compatible } from "@wonderhome/core/commerce/units";
import { ingredientLinesFrom, ingredientRowsOf, MAX_INGREDIENT_ROWS, type IngredientRowsInput } from "@wonderhome/core/meals/ingredient-lines";
import { mealShortfalls, servingScale } from "@wonderhome/core/meals/shortfall";
import { linkIngredients } from "@wonderhome/core/meals/ingredient-links";
import { nutritionPerServing, type ServingNutrition } from "@wonderhome/core/meals/ingredient-nutrition";
import { publicEnv } from "@wonderhome/core/config/env";
import {
  listMeals,
  markNeedsOnList,
  setMealServings,
  attachIngredients,
  addMealIngredients,
  attachRecipeToMeal,
  createFoodPreference,
  createMeal,
  createRecipe,
  removeMeal,
  replaceRecipeEssentials,
  setMealEssentials,
  suggestMeal,
  updateMeal,
} from "@wonderhome/core/meals/repository";
import { atLocal } from "@wonderhome/core/notifications/timing";

import type { ActionState } from "./actions";

/**
 * Planning a meal by hand — the manual half of "Plan with AI", which had no
 * form behind it even though `createMeal` already existed. A recipe is
 * optional: picking one links the meal and copies its ingredients onto it
 * (`attachIngredients`), exactly as the API route already did for a
 * provider-driven plan. Since 25-019 the ingredients written in the form
 * go where the person chose (`ingredientsFor`): this meal only, the
 * picked recipe too, or a new recipe the meal is then planned from.
 */
const schema = z.object({
  householdId: z.uuid(),
  name: z.string().trim().min(1, { error: "What's for this slot?" }).max(120),
  slot: z.enum(MEAL_SLOTS),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Choose a date." }),
  readyByTime: z.string().regex(/^\d{2}:\d{2}$/, { error: "Choose a time." }),
  cookMemberId: z.union([z.uuid(), z.literal("")]).optional(),
  recipeId: z.union([z.uuid(), z.literal("")]).optional(),
  ingredientsFor: z.enum(["meal", "recipe", "new"]).default("meal"),
  newRecipeName: z.string().trim().max(120).optional(),
});

export async function createMealAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = schema.safeParse({
    householdId: formData.get("householdId"),
    name: formData.get("name"),
    slot: formData.get("slot"),
    onDate: formData.get("onDate"),
    readyByTime: formData.get("readyByTime"),
    cookMemberId: formData.get("cookMemberId") || undefined,
    recipeId: formData.get("recipeId") || undefined,
    ingredientsFor: formData.get("ingredientsFor") || undefined,
    newRecipeName: formData.get("newRecipeName") || undefined,
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Please check the details above.",
    };
  }
  const typed = ingredientLinesFrom(ingredientRowsOf(formData, "essential"));
  const scope = parsed.data.ingredientsFor === "recipe" && !parsed.data.recipeId ? "meal" : parsed.data.ingredientsFor;
  if (scope === "new" && !parsed.data.newRecipeName) {
    return { error: "Name the new recipe." };
  }

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    // Each row is the household's own grocery item where it was picked (25-017).
    const { lines, entries } = await linkIngredients(supabase, { householdId: parsed.data.householdId, lines: typed, supabaseUrl: publicEnv().NEXT_PUBLIC_SUPABASE_URL });

    // The meal first, so a slot that is already taken changes no recipe.
    const created = await createMeal(supabase, {
      householdId: parsed.data.householdId,
      name: parsed.data.name,
      slot: parsed.data.slot,
      onDate: parsed.data.onDate,
      readyBy: readyByOn(parsed.data.onDate, parsed.data.readyByTime, membership.household.timezone),
      cookMemberId: parsed.data.cookMemberId || null,
      recipeId: scope === "new" ? null : parsed.data.recipeId || null,
    });

    // 25-019: what was written for the ingredients goes where the person
    // chose — a new recipe, the picked recipe too, or this meal only.
    const householdId = parsed.data.householdId;
    if (scope === "new") {
      const recipe = await createRecipe(supabase, {
        householdId,
        name: parsed.data.newRecipeName!,
        activeMinutes: 20,
        totalMinutes: 40,
        serves: 4,
        essentialIngredients: lines,
        optionalIngredients: [],
        // Worked out from what it is made of, where the catalog knows (25-017).
        ...nutritionFields(nutritionPerServing(lines, entries, 4)),
      });
      await attachRecipeToMeal(supabase, householdId, created.id, recipe.id);
    } else if (parsed.data.recipeId) {
      if (scope === "recipe") await replaceRecipeEssentials(supabase, { householdId, recipeId: parsed.data.recipeId, lines });
      await attachIngredients(supabase, householdId, created.id, parsed.data.recipeId);
      // "Just for this meal": the meal needs exactly what was written, the recipe stays as it was.
      if (scope === "meal") await setMealEssentials(supabase, { householdId, mealId: created.id, lines });
    } else if (lines.length > 0) {
      await addMealIngredients(supabase, { householdId, mealId: created.id, lines });
    }

    revalidatePath("/meals");
    return {
      notice:
        scope === "new"
          ? "Planned, and saved as a new recipe to pick next time."
          : scope === "recipe"
            ? "Planned, and the recipe now uses these ingredients."
            : "Planned. WonderHome will check the ingredients against it.",
    };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "meals").body.error.message };
  }
}

/** A worked-out nutrition, as the fields a recipe keeps. */
function nutritionFields(worked: ServingNutrition | null) {
  return worked ? { caloriesPerServing: worked.caloriesPerServing, proteinGrams: worked.proteinGrams, carbsGrams: worked.carbsGrams, fatGrams: worked.fatGrams } : {};
}

/**
 * "Ready by 20:00" on a date, on the household's own clock. Read on the
 * server's clock instead, an 8 pm dinner in India was saved as 1:30 am.
 */
function readyByOn(onDate: string, time: string, timezone: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return atLocal(onDate, (hours ?? 0) * 60 + (minutes ?? 0), timezone).toISOString();
}

/** "Change meal" on a meal's card: the same fields as planning one, changed in place. */
export async function updateMealAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = schema.extend({ mealId: z.uuid() }).safeParse({
    householdId: formData.get("householdId"),
    mealId: formData.get("mealId"),
    name: formData.get("name"),
    slot: formData.get("slot"),
    onDate: formData.get("onDate"),
    readyByTime: formData.get("readyByTime"),
    cookMemberId: formData.get("cookMemberId") || undefined,
    recipeId: formData.get("recipeId") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);
    await updateMeal(supabase, {
      householdId: parsed.data.householdId,
      mealId: parsed.data.mealId,
      name: parsed.data.name,
      slot: parsed.data.slot,
      onDate: parsed.data.onDate,
      readyBy: readyByOn(parsed.data.onDate, parsed.data.readyByTime, membership.household.timezone),
      cookMemberId: parsed.data.cookMemberId || null,
      recipeId: parsed.data.recipeId || null,
    });
    revalidatePath("/meals");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "meals").body.error.message };
  }
}

/** "Remove from the plan" in the same sheet. */
export async function removeMealAction(input: { householdId: string; mealId: string }): Promise<ActionState> {
  const parsed = z.object({ householdId: z.uuid(), mealId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await removeMeal(supabase, parsed.data);
    revalidatePath("/meals");
    return { notice: "Removed from the plan." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "meals").body.error.message };
  }
}

/**
 * What a meal without a recipe needs, written in its Ingredients sheet: one
 * line each, read the way HomeTalk reads an amount ("500 g rajma", "2
 * onions", "rice").
 */
export async function addMealIngredientsAction(input: { householdId: string; mealId: string; rows: IngredientRowsInput }): Promise<ActionState> {
  const list = z.array(z.string().max(120)).max(MAX_INGREDIENT_ROWS);
  const parsed = z
    .object({ householdId: z.uuid(), mealId: z.uuid(), rows: z.object({ names: list, quantities: list, units: list, refs: list.optional() }) })
    .safeParse(input);
  if (!parsed.success) return { error: "Please try again." };
  const typed = ingredientLinesFrom(parsed.data.rows);
  if (typed.length === 0) return { error: "Name at least one ingredient." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    // Each row is the household's own grocery item where it was picked (25-017).
    const { lines } = await linkIngredients(supabase, { householdId: parsed.data.householdId, lines: typed, supabaseUrl: publicEnv().NEXT_PUBLIC_SUPABASE_URL });
    await addMealIngredients(supabase, { householdId: parsed.data.householdId, mealId: parsed.data.mealId, lines });
    revalidatePath("/meals");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "meals").body.error.message };
  }
}

const attachRecipeSchema = z.object({
  householdId: z.uuid(),
  mealId: z.uuid(),
  recipeId: z.uuid({ error: "Pick a recipe." }),
});

/** Attaching an existing recipe to a meal that was planned without one. */
export async function attachRecipeToMealAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = attachRecipeSchema.safeParse({
    householdId: formData.get("householdId"),
    mealId: formData.get("mealId"),
    recipeId: formData.get("recipeId"),
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Please check the details above.",
    };
  }

  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await attachRecipeToMeal(
      supabase,
      parsed.data.householdId,
      parsed.data.mealId,
      parsed.data.recipeId,
    );
    revalidatePath("/meals");
    return { notice: "Recipe attached." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "meals").body.error.message };
  }
}

const recipeSchema = z.object({
  householdId: z.uuid(),
  name: z
    .string()
    .trim()
    .min(1, { error: "What's the recipe called?" })
    .max(160),
  cuisine: z.string().trim().max(60).optional(),
  activeMinutes: z.coerce.number().int().min(1).max(600),
  totalMinutes: z.coerce.number().int().min(1).max(1440),
  serves: z.coerce.number().int().min(1).max(50),
  method: z.string().trim().max(4000).optional(),
  source: z.string().trim().max(200).optional(),
  caloriesPerServing: z
    .union([z.coerce.number().int().min(0).max(5000), z.literal("")])
    .optional(),
  proteinGrams: z
    .union([z.coerce.number().int().min(0).max(500), z.literal("")])
    .optional(),
  carbsGrams: z
    .union([z.coerce.number().int().min(0).max(500), z.literal("")])
    .optional(),
  fatGrams: z
    .union([z.coerce.number().int().min(0).max(500), z.literal("")])
    .optional(),
});

/**
 * A recipe typed in by hand, so it appears the next time a meal is planned.
 */
/** A recipe's add form also learns the new recipe, so a meal's sheet can pick it straight away. */
export type RecipeActionState = ActionState & { recipeId?: string; recipeName?: string };

export async function createRecipeAction(
  _previous: RecipeActionState,
  formData: FormData,
): Promise<RecipeActionState> {
  const parsed = recipeSchema.safeParse({
    householdId: formData.get("householdId"),
    name: formData.get("name"),
    cuisine: formData.get("cuisine") || undefined,
    activeMinutes: formData.get("activeMinutes"),
    totalMinutes: formData.get("totalMinutes"),
    serves: formData.get("serves"),
    method: formData.get("method") || undefined,
    source: formData.get("source") || undefined,
    caloriesPerServing: formData.get("caloriesPerServing") || undefined,
    proteinGrams: formData.get("proteinGrams") || undefined,
    carbsGrams: formData.get("carbsGrams") || undefined,
    fatGrams: formData.get("fatGrams") || undefined,
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Please check the details above.",
    };
  }
  if (parsed.data.totalMinutes < parsed.data.activeMinutes) {
    return { error: "Total time can't be less than active cooking time." };
  }

  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);

    // Each ingredient is the household's own grocery item where it was picked,
    // and what was left empty of the nutrients is worked out from them (25-017).
    const { lines: essentials, entries } = await linkIngredients(supabase, {
      householdId: parsed.data.householdId,
      lines: ingredientLinesFrom(ingredientRowsOf(formData, "essential")),
      supabaseUrl: publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    });
    // Nice-to-haves are picked the same way, and named only.
    const { lines: optional } = await linkIngredients(supabase, {
      householdId: parsed.data.householdId,
      lines: ingredientLinesFrom(ingredientRowsOf(formData, "optional")),
      supabaseUrl: publicEnv().NEXT_PUBLIC_SUPABASE_URL,
    });
    const worked = nutritionPerServing(essentials, entries, parsed.data.serves);
    const given = (value: number | "" | undefined) => (value === "" || value === undefined ? null : value);

    const created = await createRecipe(supabase, {
      householdId: parsed.data.householdId,
      name: parsed.data.name,
      cuisine: parsed.data.cuisine || null,
      activeMinutes: parsed.data.activeMinutes,
      totalMinutes: parsed.data.totalMinutes,
      serves: parsed.data.serves,
      method: parsed.data.method || null,
      source: parsed.data.source || null,
      // What the person typed stands; only what they left empty is worked out.
      caloriesPerServing: given(parsed.data.caloriesPerServing) ?? worked?.caloriesPerServing ?? null,
      proteinGrams: given(parsed.data.proteinGrams) ?? worked?.proteinGrams ?? null,
      carbsGrams: given(parsed.data.carbsGrams) ?? worked?.carbsGrams ?? null,
      fatGrams: given(parsed.data.fatGrams) ?? worked?.fatGrams ?? null,
      essentialIngredients: essentials,
      optionalIngredients: optional.map((line) => ({ name: line.name, consumableId: line.consumableId ?? null })),
    });

    revalidatePath("/meals");
    return {
      notice: worked
        ? `Added, with nutrients worked out from ${worked.counted} of ${worked.total} ingredients. It'll be there to pick next time you plan a meal.`
        : "Added. It'll be there to pick next time you plan a meal.",
      recipeId: created.id,
      recipeName: parsed.data.name,
    };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "meals").body.error.message };
  }
}

const preferenceSchema = z.object({
  householdId: z.uuid(),
  memberId: z.union([z.uuid(), z.literal("")]).optional(),
  kind: z.enum(PREFERENCE_KINDS),
  subject: z.string().trim().min(1, { error: "Say what it's about." }).max(120),
});

/** A preference told to WonderHome by hand — member, timing or recipe preferences all fit the same shape (whom it's about, what kind, and the detail itself). */
export async function createPreferenceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = preferenceSchema.safeParse({
    householdId: formData.get("householdId"),
    memberId: formData.get("memberId") || undefined,
    kind: formData.get("kind"),
    subject: formData.get("subject"),
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ?? "Please check the details above.",
    };
  }

  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);

    await createFoodPreference(supabase, {
      householdId: parsed.data.householdId,
      memberId: parsed.data.memberId || null,
      kind: parsed.data.kind,
      subject: parsed.data.subject,
    });

    revalidatePath("/meals");
    return { notice: "Noted." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "meals").body.error.message };
  }
}

export type SuggestMealState = ActionState & {
  choice?: PlanChoice;
  lowStock?: string[];
  checkedOn?: string;
  /** No recipes to choose from yet: the ideas from what is at home are the way in (25-018). */
  noRecipes?: boolean;
};

const suggestSchema = z.object({
  householdId: z.uuid(),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * What to cook, checked against what the household has and everyone's
 * preferences — the "Suggest" button (a household batch item). Pure read:
 * nothing is planned until the household accepts the suggestion.
 */
export async function suggestMealAction(
  _previous: SuggestMealState,
  formData: FormData,
): Promise<SuggestMealState> {
  const parsed = suggestSchema.safeParse({
    householdId: formData.get("householdId"),
    onDate: formData.get("onDate"),
  });
  if (!parsed.success) return { error: "Please check the date." };

  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);

    const suggestion = await suggestMeal(supabase, parsed.data.householdId, {
      onDate: parsed.data.onDate,
    });
    if (!suggestion) return { noRecipes: true, checkedOn: parsed.data.onDate };

    return {
      choice: suggestion.choice,
      lowStock: suggestion.lowStock,
      checkedOn: parsed.data.onDate,
    };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "meals").body.error.message };
  }
}

const addSuggestedSchema = z.object({
  householdId: z.uuid(),
  recipeId: z.uuid(),
  name: z.string().trim().min(1).max(160),
  slot: z.enum(MEAL_SLOTS),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  readyByTime: z.string().regex(/^\d{2}:\d{2}$/),
});

/** One click to accept a suggestion — plans the meal with the suggested recipe already attached. */
export async function addSuggestedMealAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = addSuggestedSchema.safeParse({
    householdId: formData.get("householdId"),
    recipeId: formData.get("recipeId"),
    name: formData.get("name"),
    slot: formData.get("slot"),
    onDate: formData.get("onDate"),
    readyByTime: formData.get("readyByTime"),
  });
  if (!parsed.success) return { error: "Something is missing." };

  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, parsed.data.householdId);

    const created = await createMeal(supabase, {
      householdId: parsed.data.householdId,
      name: parsed.data.name,
      slot: parsed.data.slot,
      onDate: parsed.data.onDate,
      readyBy: readyByOn(parsed.data.onDate, parsed.data.readyByTime, membership.household.timezone),
      recipeId: parsed.data.recipeId,
    });
    await attachIngredients(
      supabase,
      parsed.data.householdId,
      created.id,
      parsed.data.recipeId,
    );

    revalidatePath("/meals");
    return { notice: "Added to the plan." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "meals").body.error.message };
  }
}

const shortfallSchema = z.object({
  householdId: z.uuid(),
  mealId: z.uuid(),
  servings: z.number().int().min(1).max(50).nullable(),
  key: z.string().regex(/^[A-Za-z0-9:_-]{8,120}$/),
});

export type MealShortfallResult = { added: number } | { error: "failed" };

/**
 * Adds what a meal is short of to the list (HomeFood 25-003a).
 *
 * The browser sends the meal, the servings picked and an idempotency key —
 * never an amount. The meal, its recipe, what is at home and what is on the
 * list are read again here and the shortfall worked out again
 * (`meal/shortfall.ts`), so only the real gap is added, through the same list
 * service every screen and HomeTalk use, with the meal as its source. A second
 * tap finds the list already covering it and adds nothing. An ingredient the
 * household does not track yet becomes a grocery item first.
 */
export async function addMealShortfallsAction(input: z.input<typeof shortfallSchema>): Promise<MealShortfallResult> {
  const parsed = shortfallSchema.safeParse(input);
  if (!parsed.success) return { error: "failed" };
  const { householdId, mealId, servings, key } = parsed.data;
  try {
    const supabase = await createClient();
    await requireMembership(supabase, householdId);
    const meal = (await listMeals(supabase, householdId)).find((entry) => entry.id === mealId);
    if (!meal) return { error: "failed" };
    if (meal.recipe && servings !== (meal.servings ?? null)) await setMealServings(supabase, { householdId, mealId, servings });

    const groceries = await listGroceries(supabase, householdId);
    const plan = mealShortfalls({ ingredients: meal.ingredients, scale: servingScale(servings ?? meal.servings, meal.recipe?.serves), groceries });
    let added = 0;
    for (const [index, line] of plan.short.entries()) {
      if (!line.short) continue;
      // A new item takes the catalog's link and category when the name is one (25-012); the recipe's own unit stays.
      const named = line.itemId ? null : await catalogItemFor(supabase, line.name).catch(() => null);
      const itemId =
        line.itemId ??
        (
          await createConsumable(supabase, {
            householdId,
            name: line.name,
            category: named?.category ?? "grocery",
            unit: line.short.unit,
            typicalQuantity: 1,
            catalogId: named?.catalogId && compatible(named.unit, line.short.unit) ? named.catalogId : null,
          })
        ).id;
      await adjustListEntry(supabase, { householdId, itemId, kind: "add", amount: line.short, source: "meal", mealId, idempotencyKey: `${key}:${index}` });
      added += 1;
    }
    if (added > 0) await markNeedsOnList(supabase, { householdId, mealId, names: plan.short.map((line) => line.name) });
    revalidatePath("/meals");
    revalidatePath("/groceries");
    return { added };
  } catch {
    return { error: "failed" };
  }
}

/** One choice for an ingredient row's item (25-017): the household's own item, or a catalog entry. */
export type IngredientChoiceResult = { ok: true; choices: IngredientChoice[] } | { ok: false };

/**
 * What an ingredient row offers as the person types (25-017): the household's
 * own grocery items first — what the pantry already tracks — then the shared
 * grocery catalog that Groceries' Add item searches, never the same entry
 * twice. The row submits only the choice's ref; the server resolves it again.
 */
export async function searchIngredientChoicesAction(householdId: string, query: string): Promise<IngredientChoiceResult> {
  const parsed = z.object({ householdId: z.uuid(), query: z.string().trim().min(2).max(60) }).safeParse({ householdId, query });
  if (!parsed.success) return { ok: true, choices: [] };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    const needle = parsed.data.query.toLowerCase();
    const [own, catalog] = await Promise.all([
      listGroceries(supabase, parsed.data.householdId).catch(() => []),
      searchCatalog(supabase, parsed.data.query, { supabaseUrl: publicEnv().NEXT_PUBLIC_SUPABASE_URL }).catch(() => []),
    ]);
    const mine = own.filter((item) => [item.name, ...item.aliases].some((name) => name.toLowerCase().includes(needle))).slice(0, 4);
    const tracked = new Set(own.map((item) => item.catalog?.id).filter(Boolean));
    const choices: IngredientChoice[] = [
      ...mine.map((item) => ({ ref: `item:${item.id}`, name: item.name, detail: null, unit: item.unit, imageUrl: item.imageUrl ?? item.catalog?.imageUrl ?? null, own: true })),
      ...catalog
        .filter((entry) => !tracked.has(entry.id))
        .slice(0, 6)
        .map((entry) => ({ ref: `catalog:${entry.id}`, name: entry.name, detail: entry.brand, unit: entry.unit, imageUrl: entry.imageUrl, own: false })),
    ];
    return { ok: true, choices };
  } catch {
    return { ok: false };
  }
}
