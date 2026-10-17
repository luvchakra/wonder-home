"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { forgetPlace, notePlace } from "@wonderhome/core/homeplaces/repository";
import { requireMembership } from "@wonderhome/core/identity/households";

/**
 * The place book's own changes: forget a place (a saved one stops coming
 * first, a turned-down one may be suggested again) or keep a note on it.
 * The browser names only the row; RLS decides who may write (an adult or
 * Admin), so a child's tap is refused there whatever the screen showed.
 */
const forgetSchema = z.object({ householdId: z.uuid(), id: z.uuid() });
const noteSchema = z.object({ householdId: z.uuid(), id: z.uuid(), note: z.string().max(300) });

export async function forgetPlaceAction(input: z.input<typeof forgetSchema>): Promise<{ ok: true } | { error: string }> {
  const parsed = forgetSchema.safeParse(input);
  if (!parsed.success) return { error: "That place could not be found." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await forgetPlace(supabase, parsed.data);
  } catch (thrown) {
    return { error: toErrorBody(thrown, "household").body.error.message };
  }
  revalidatePath("/places");
  return { ok: true };
}

export async function notePlaceAction(input: z.input<typeof noteSchema>): Promise<{ ok: true } | { error: string }> {
  const parsed = noteSchema.safeParse(input);
  if (!parsed.success) return { error: "Keep the note under 300 characters." };
  try {
    const supabase = await createClient();
    await requireMembership(supabase, parsed.data.householdId);
    await notePlace(supabase, { householdId: parsed.data.householdId, id: parsed.data.id, note: parsed.data.note.trim() || null });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "household").body.error.message };
  }
  revalidatePath("/places");
  return { ok: true };
}
