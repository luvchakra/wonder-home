import { z } from "zod";

import { requireUser } from "@wonderhome/core/api/auth";
import { ApiError } from "@wonderhome/core/api/errors";
import { defineRoute } from "@wonderhome/core/api/route";
import { may } from "@wonderhome/core/billing/repository";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";
import { MEAL_SLOTS } from "@wonderhome/core/meals/meals";
import { attachIngredients, createMeal, mealAgenda } from "@wonderhome/core/meals/repository";

/**
 * Meals: what is planned, and what is about to go wrong with it.
 *
 * Planning a meal with a recipe copies that recipe's ingredients onto the meal,
 * so a later edit to the recipe cannot silently rewrite a dinner the household
 * already committed to.
 */
const createMealSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slot: z.enum(MEAL_SLOTS),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  readyBy: z.iso.datetime({ offset: true }),
  recipeId: z.uuid().nullish(),
  cookMemberId: z.uuid().nullish(),
});

type Params = { params: Promise<{ householdId: string }> };

export async function GET(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({}, async () => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "meals.planning");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    return await mealAgenda(supabase, householdId);
  })(request);
}

export async function POST(request: Request, { params }: Params) {
  const { householdId } = await params;

  return defineRoute({ input: createMealSchema }, async ({ body }) => {
    await requireUser();
    const supabase = await createClient();
    await requireMembership(supabase, householdId);

    const entitlement = await may(supabase, householdId, "meals.planning");
    if (!entitlement.allowed) throw ApiError.forbidden(entitlement.reason);

    const created = await createMeal(supabase, { householdId, ...body });
    if (body.recipeId) {
      await attachIngredients(supabase, householdId, created.id, body.recipeId);
    }

    return new Response(JSON.stringify(created), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  })(request);
}

export const dynamic = "force-dynamic";
