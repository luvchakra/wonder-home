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
import {
  attachIngredients,
  attachRecipeToMeal,
  createFoodPreference,
  createMeal,
  createRecipe,
  suggestMeal,
} from "@wonderhome/core/meals/repository";

import type { ActionState } from "./actions";

/**
 * Planning a meal by hand — the manual half of "Plan with AI", which had no
 * form behind it even though `createMeal` already existed. A recipe is
 * optional: picking one links the meal and copies its ingredients onto it
 * (`attachIngredients`), exactly as the API route already did for a
 * provider-driven plan.
 */
const schema = z.object({
  householdId: z.uuid(),
  name: z.string().trim().min(1, { error: "What's for this slot?" }).max(120),
  slot: z.enum(MEAL_SLOTS),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Choose a date." }),
  readyByTime: z.string().regex(/^\d{2}:\d{2}$/, { error: "Choose a time." }),
  cookMemberId: z.union([z.uuid(), z.literal("")]).optional(),
  recipeId: z.union([z.uuid(), z.literal("")]).optional(),
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

    const created = await createMeal(supabase, {
      householdId: parsed.data.householdId,
      name: parsed.data.name,
      slot: parsed.data.slot,
      onDate: parsed.data.onDate,
      readyBy: new Date(
        `${parsed.data.onDate}T${parsed.data.readyByTime}:00`,
      ).toISOString(),
      cookMemberId: parsed.data.cookMemberId || null,
      recipeId: parsed.data.recipeId || null,
    });

    if (parsed.data.recipeId) {
      await attachIngredients(
        supabase,
        parsed.data.householdId,
        created.id,
        parsed.data.recipeId,
      );
    }

    revalidatePath("/meals");
    return {
      notice: "Planned. WonderHome will check the ingredients against it.",
    };
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

const listField = z.string().transform((value) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean),
);

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
  essentialIngredients: listField,
  optionalIngredients: listField,
});

/**
 * A recipe typed in by hand, so it appears the next time a meal is planned.
 */
export async function createRecipeAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
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
    essentialIngredients: formData.get("essentialIngredients") ?? "",
    optionalIngredients: formData.get("optionalIngredients") ?? "",
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

    await createRecipe(supabase, {
      householdId: parsed.data.householdId,
      name: parsed.data.name,
      cuisine: parsed.data.cuisine || null,
      activeMinutes: parsed.data.activeMinutes,
      totalMinutes: parsed.data.totalMinutes,
      serves: parsed.data.serves,
      method: parsed.data.method || null,
      source: parsed.data.source || null,
      caloriesPerServing:
        parsed.data.caloriesPerServing === "" ||
        parsed.data.caloriesPerServing === undefined
          ? null
          : parsed.data.caloriesPerServing,
      proteinGrams:
        parsed.data.proteinGrams === "" ||
        parsed.data.proteinGrams === undefined
          ? null
          : parsed.data.proteinGrams,
      carbsGrams:
        parsed.data.carbsGrams === "" || parsed.data.carbsGrams === undefined
          ? null
          : parsed.data.carbsGrams,
      fatGrams:
        parsed.data.fatGrams === "" || parsed.data.fatGrams === undefined
          ? null
          : parsed.data.fatGrams,
      essentialIngredients: parsed.data.essentialIngredients,
      optionalIngredients: parsed.data.optionalIngredients,
    });

    revalidatePath("/meals");
    return {
      notice: "Added. It'll be there to pick next time you plan a meal.",
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
    if (!suggestion) {
      return {
        error:
          "Add a recipe first — WonderHome has nothing to suggest from yet.",
      };
    }

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
    await requireMembership(supabase, parsed.data.householdId);

    const created = await createMeal(supabase, {
      householdId: parsed.data.householdId,
      name: parsed.data.name,
      slot: parsed.data.slot,
      onDate: parsed.data.onDate,
      readyBy: new Date(
        `${parsed.data.onDate}T${parsed.data.readyByTime}:00`,
      ).toISOString(),
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
