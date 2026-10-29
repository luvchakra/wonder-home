"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { clearHouseholdKey, clearGeminiVoiceKey, setHouseholdKey, setGeminiVoiceKey } from "@wonderhome/core/ai/credentials";
import { MODEL_PROVIDERS } from "@wonderhome/core/ai/model-key";
import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";

import { safeReturnTo } from "../_lib/return-to";
import type { ActionState } from "./actions";
import { formUuid } from "../_lib/form-input";

/**
 * Setting and clearing a household's own model key.
 *
 * The key arrives in a form post and goes straight to the database. It is
 * never echoed back into the response, never logged, and never re-rendered
 * into the field — the screen shows "configured" and a date, and that is all
 * anybody can get out of it afterwards.
 */
const keySchema = z.object({
  provider: z.enum(MODEL_PROVIDERS),
  apiKey: z.string().trim().min(20, { error: "That does not look like a model key." }).max(300),
});

export async function saveAiKey(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = keySchema.safeParse({
    provider: formData.get("provider"),
    apiKey: formData.get("apiKey"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the key and try again." };
  }

  try {
    const supabase = await createClient();
    const householdId = String(formData.get("householdId") ?? "");
    const membership = await requireHouseholdAdmin(supabase, householdId);

    await setHouseholdKey(supabase, {
      householdId,
      memberId: membership.memberId,
      provider: parsed.data.provider,
      apiKey: parsed.data.apiKey,
    });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "ai-key").body.error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/settings/ai");
  // Sent here to fix something (HomeTalk's Gemini Live, say): back where they were.
  const back = safeReturnTo(formData.get("returnTo"));
  if (back) redirect(back);
  return { notice: "Saved. Your household's own key is in use from now on." };
}

export async function removeAiKey(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const householdId = String(formData.get("householdId") ?? "");
    const membership = await requireHouseholdAdmin(supabase, householdId);
    await clearHouseholdKey(supabase, householdId, membership.memberId);
  } catch (thrown) {
    return { error: toErrorBody(thrown, "ai-key").body.error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/settings/ai");
  return { notice: "Removed. WonderHome's own key takes over again." };
}

/**
 * The Gemini voice key: a Google key for Gemini Live voice only, so the
 * assistant can think with Anthropic or OpenAI while voice runs on Gemini.
 * Same handling as the assistant key: never echoed, never logged.
 */
const voiceKeySchema = z.object({ apiKey: z.string().trim().min(20, { error: "That does not look like a Google AI key." }).max(300) });

export async function saveGeminiVoiceKey(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = voiceKeySchema.safeParse({ apiKey: formData.get("apiKey") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the key and try again." };

  try {
    const supabase = await createClient();
    const householdId = String(formData.get("householdId") ?? "");
    const membership = await requireHouseholdAdmin(supabase, householdId);
    await setGeminiVoiceKey(supabase, { householdId, memberId: membership.memberId, apiKey: parsed.data.apiKey });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "ai-key").body.error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/settings/ai");
  revalidatePath("/settings/voice");
  revalidatePath("/ai");
  const back = safeReturnTo(formData.get("returnTo"));
  if (back) redirect(back);
  return { notice: "Saved. Gemini voice uses this key from now on." };
}

export async function removeGeminiVoiceKey(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const householdId = formUuid(formData, "householdId");
    if (!householdId) return { error: "Please try again." };
    const membership = await requireHouseholdAdmin(supabase, householdId);
    await clearGeminiVoiceKey(supabase, householdId, membership.memberId);
  } catch (thrown) {
    return { error: toErrorBody(thrown, "ai-key").body.error.message };
  }

  revalidatePath("/settings");
  revalidatePath("/settings/ai");
  revalidatePath("/settings/voice");
  revalidatePath("/ai");
  return { notice: "Removed. Gemini voice now uses the assistant's key, if that key is Google's." };
}
