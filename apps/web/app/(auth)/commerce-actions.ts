"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createConsumable, retireConsumable, updateConsumable } from "@wonderhome/core/commerce/repository";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";

/**
 * Telling WonderHome about something to track by hand — the manual half of
 * "Add something", which only ever opened the AI chat. There was no
 * `createConsumable` before this: this domain's only writes were AI-facing
 * (pricing a basket, refreshing suggestions), so this is new, not a rewire —
 * unlike Responsibilities, Home & upkeep and School, which already had the
 * write function and just needed a form. `evidence_basis` becomes
 * "member_stated" the moment a household gives WonderHome a rate directly,
 * the same standing purchase history or configured inventory would earn.
 */
const schema = z.object({
  householdId: z.uuid(),
  name: z.string().trim().min(1, { error: "What is it?" }).max(120),
  category: z.string().trim().min(1, { error: "What kind of thing is it?" }).max(40),
  unit: z.string().trim().min(1, { error: "How is it counted? e.g. bottle, kg, pack." }).max(30),
  typicalQuantity: z.coerce.number().positive().max(1000),
  daysPerUnit: z.union([z.coerce.number().positive().max(3650), z.literal("")]).optional(),
});

export async function createConsumableAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse({
    householdId: formData.get("householdId"),
    name: formData.get("name"),
    category: formData.get("category"),
    unit: formData.get("unit"),
    typicalQuantity: formData.get("typicalQuantity"),
    daysPerUnit: formData.get("daysPerUnit") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);

    await createConsumable(supabase, {
      householdId: parsed.data.householdId,
      name: parsed.data.name,
      category: parsed.data.category,
      unit: parsed.data.unit,
      typicalQuantity: parsed.data.typicalQuantity,
      daysPerUnit: parsed.data.daysPerUnit === "" ? null : parsed.data.daysPerUnit,
    });

    revalidatePath("/groceries");
    return {
      notice: parsed.data.daysPerUnit
        ? "Added. WonderHome will suggest a reorder on that schedule."
        : "Added. Once WonderHome sees it purchased a few times, it will work out a schedule on its own.",
    };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "commerce").body.error.message };
  }
}

const updateSchema = schema.extend({ id: z.uuid() });

/** Changing what was told about something already tracked — the update half of "Add something". */
export async function updateConsumableAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    householdId: formData.get("householdId"),
    name: formData.get("name"),
    category: formData.get("category"),
    unit: formData.get("unit"),
    typicalQuantity: formData.get("typicalQuantity"),
    daysPerUnit: formData.get("daysPerUnit") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the details above." };
  }

  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);

    await updateConsumable(supabase, {
      id: parsed.data.id,
      householdId: parsed.data.householdId,
      name: parsed.data.name,
      category: parsed.data.category,
      unit: parsed.data.unit,
      typicalQuantity: parsed.data.typicalQuantity,
      daysPerUnit: parsed.data.daysPerUnit === "" ? null : parsed.data.daysPerUnit,
    });

    revalidatePath("/groceries");
    return { notice: "Saved." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "commerce").body.error.message };
  }
}

const retireSchema = z.object({ id: z.uuid(), householdId: z.uuid() });

/** "Stop tracking" — never a delete. Past purchases and orders stay exactly as they were. */
export async function retireConsumableAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = retireSchema.safeParse({ id: formData.get("id"), householdId: formData.get("householdId") });
  if (!parsed.success) return { error: "Please try again." };

  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await retireConsumable(supabase, { id: parsed.data.id, householdId: parsed.data.householdId });
    revalidatePath("/groceries");
    return { notice: "No longer tracked. Add it again any time." };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "commerce").body.error.message };
  }
}
