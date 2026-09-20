"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { MEAL_SLOTS } from "@wonderhome/core/meals/meals";
import { createMeal } from "@wonderhome/core/meals/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";

/**
 * Planning a meal by hand — the manual half of "Plan with AI", which had no
 * form behind it even though `createMeal` already existed.
 */
const schema = z.object({
  householdId: z.uuid(),
  name: z.string().trim().min(1, { error: "What's for this slot?" }).max(120),
  slot: z.enum(MEAL_SLOTS),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Choose a date." }),
  readyByTime: z.string().regex(/^\d{2}:\d{2}$/, { error: "Choose a time." }),
  cookMemberId: z.union([z.uuid(), z.literal("")]).optional(),
});

export async function createMealAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({
    householdId: formData.get("householdId"),
    name: formData.get("name"),
    slot: formData.get("slot"),
    onDate: formData.get("onDate"),
    readyByTime: formData.get("readyByTime"),
    cookMemberId: formData.get("cookMemberId") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);

    await createMeal(supabase, {
      householdId: parsed.data.householdId,
      name: parsed.data.name,
      slot: parsed.data.slot,
      onDate: parsed.data.onDate,
      readyBy: new Date(`${parsed.data.onDate}T${parsed.data.readyByTime}:00`).toISOString(),
      cookMemberId: parsed.data.cookMemberId || null,
    });

    revalidatePath("/meals");
    return { notice: "Planned. WonderHome will check the ingredients against it." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "meals").body.error.message };
  }
}
