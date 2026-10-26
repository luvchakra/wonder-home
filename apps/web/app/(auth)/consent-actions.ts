"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { saveConfirmRequested } from "@wonderhome/core/conversation/consent-repository";
import { asAutoAddPercent, AUTO_ADD_PERCENTS } from "@wonderhome/core/homesend/auto-add";
import { saveAutoAddPercent } from "@wonderhome/core/homesend/auto-add-repository";
import { createClient } from "@wonderhome/core/db/server";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";

import type { ActionState } from "./actions";

/**
 * "Ask before acting on what I say" (HomeBrain 4.0 §3.9, story 14-025): an
 * Admin decides, for the whole household, whether a clear request in
 * HomeTalk is done at once (with an undo) or asked about first.
 */
const schema = z.object({ householdId: z.uuid(), confirm: z.enum(["on", "off"]) });

export async function saveConfirmRequestedAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await saveConfirmRequested(supabase, { householdId: parsed.data.householdId, actorMemberId: membership.memberId, confirm: parsed.data.confirm === "on" });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "privacy").body.error.message };
  }
  revalidatePath("/settings/ai");
  return { notice: "saved" };
}

/**
 * How sure HomeSend must be before it adds an entry on its own (the owner,
 * 2026-10-26): an Admin picks the bar from the ones WonderHome offers.
 */
const autoAddSchema = z.object({ householdId: z.uuid(), percent: z.enum(AUTO_ADD_PERCENTS.map(String) as [string, ...string[]]) });

export async function saveAutoAddPercentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = autoAddSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Please try again." };
  try {
    const supabase = await createClient();
    const membership = await requireHouseholdAdmin(supabase, parsed.data.householdId);
    await saveAutoAddPercent(supabase, { householdId: parsed.data.householdId, actorMemberId: membership.memberId, percent: asAutoAddPercent(parsed.data.percent) });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "privacy").body.error.message };
  }
  revalidatePath("/settings/ai");
  return { notice: "saved" };
}
