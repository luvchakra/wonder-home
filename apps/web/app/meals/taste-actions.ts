"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { requireMembership } from "@wonderhome/core/identity/households";
import { createFoodPreference, removeFoodPreference } from "@wonderhome/core/meals/repository";

/**
 * Like or dislike a dish, for yourself (the owner, 2026-10-21: "give like and
 * dislike feature in meals and recipes entries"). A taste is the person's own
 * food preference for that dish — "preference" for a like, "dislike" for a
 * dislike — so meal ideas, the week template and HomeBrain already read it.
 * Tapping the same one again takes it back (rule 12). A dish the person has an
 * allergy, a medical or an ethical reason about is never overwritten by a tap.
 */
const schema = z.object({ householdId: z.uuid(), dish: z.string().trim().min(1).max(120), taste: z.enum(["like", "dislike"]) });

export type TasteResult = { ok: true; taste: "like" | "dislike" | null } | { error: string };

export async function setDishTasteAction(input: z.input<typeof schema>): Promise<TasteResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "That dish could not be found." };
  const { householdId, dish, taste } = parsed.data;
  try {
    const supabase = await createClient();
    const membership = await requireMembership(supabase, householdId);
    const { data: rows, error } = await supabase
      .from("food_preferences")
      .select("id, kind, subject")
      .eq("household_id", householdId)
      .eq("member_id", membership.memberId)
      .ilike("subject", dish.replace(/[%_\\]/g, (char) => `\\${char}`))
      .limit(5);
    if (error) throw new Error(`taste read failed: ${error.code ?? "unknown"}`);
    const mine = (rows ?? []).find((row) => String(row.subject).trim().toLowerCase() === dish.toLowerCase()) as { id: string; kind: string; subject: string } | undefined;
    if (mine && !["preference", "dislike"].includes(mine.kind)) {
      return { error: "This dish is on record for another reason, such as an allergy. Change it under Preferences." };
    }
    const kind = taste === "like" ? "preference" : "dislike";
    if (mine?.kind === kind) {
      await removeFoodPreference(supabase, { householdId, id: mine.id });
      revalidatePath("/meals");
      return { ok: true, taste: null };
    }
    await createFoodPreference(supabase, { householdId, memberId: membership.memberId, kind, subject: mine?.subject ?? dish });
    revalidatePath("/meals");
    return { ok: true, taste };
  } catch (thrown) {
    return { error: toErrorBody(thrown, "meals").body.error.message };
  }
}
