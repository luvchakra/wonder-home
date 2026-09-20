"use server";

import { revalidatePath } from "next/cache";

import { toErrorBody } from "@wonderhome/core/api/errors";
import { createClient } from "@wonderhome/core/db/server";
import { requireHouseholdAdmin } from "@wonderhome/core/identity/households";
import { clearVoiceKey, saveVoiceSettings, setVoiceKey } from "@wonderhome/core/voice/repository";
import { voiceSettingsSchema } from "@wonderhome/core/voice/settings";

import type { ActionState } from "./actions";

/**
 * Changing how WonderHome sounds (story 04-009).
 *
 * The form posts every field at once and this parses the lot through the
 * same Zod schema the API and the database agree on, so a value that would
 * be refused by Google is refused here, in words, before anybody hears the
 * difference.
 *
 * Speech runs on the deployment's key by default. A household may set
 * their own instead, and that key takes the `ai-key-actions.ts` path
 * exactly: straight to the database, never echoed back, never re-rendered
 * into the field, because it cannot be read out again at all.
 */

function readSettings(formData: FormData) {
  const number = (name: string) => {
    const raw = formData.get(name);
    return raw === null || raw === "" ? undefined : Number(raw);
  };
  const checkbox = (name: string) => formData.get(name) === "on";
  const text = (name: string) => {
    const raw = formData.get(name);
    const value = typeof raw === "string" ? raw.trim() : "";
    return value === "" ? undefined : value;
  };

  return voiceSettingsSchema.safeParse({
    provider: text("provider"),
    language: text("language"),
    // "Choose for me" posts an empty value, which means no named voice.
    voiceName: text("voiceName") ?? null,
    gender: text("gender"),
    tier: text("tier"),
    speakingRate: number("speakingRate"),
    pitch: number("pitch"),
    volumeGainDb: number("volumeGainDb"),
    listeningDevice: text("listeningDevice"),
    speakReplies: checkbox("speakReplies"),
    recognitionLanguage: text("recognitionLanguage") ?? null,
    alternativeLanguages: formData
      .getAll("alternativeLanguages")
      .map(String)
      .map((value) => value.trim())
      .filter(Boolean),
    recognitionModel: text("recognitionModel"),
    automaticPunctuation: checkbox("automaticPunctuation"),
    profanityFilter: checkbox("profanityFilter"),
    // One per line is how somebody actually types a list of names.
    phraseHints: (text("phraseHints") ?? "")
      .split(/[\n,]/)
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 50),
    enhancedRecognition: checkbox("enhancedRecognition"),
  });
}

export async function saveVoice(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = readSettings(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check those settings and try again." };
  }

  try {
    const supabase = await createClient();
    const householdId = String(formData.get("householdId") ?? "");
    const membership = await requireHouseholdAdmin(supabase, householdId);

    await saveVoiceSettings(supabase, {
      householdId,
      memberId: membership.memberId,
      settings: parsed.data,
    });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "voice").body.error.message };
  }

  revalidatePath("/settings/voice");
  return { notice: "Saved. That is how WonderHome sounds from now on." };
}


export async function saveVoiceKeyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  if (apiKey.length < 20) return { error: "That does not look like a Google API key." };

  try {
    const supabase = await createClient();
    const householdId = String(formData.get("householdId") ?? "");
    const membership = await requireHouseholdAdmin(supabase, householdId);
    await setVoiceKey(supabase, { householdId, memberId: membership.memberId, apiKey });
  } catch (thrown) {
    return { error: toErrorBody(thrown, "voice").body.error.message };
  }

  revalidatePath("/settings/voice");
  return { notice: "Saved. Speech runs on your household's own Google key from now on." };
}

export async function removeVoiceKeyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const supabase = await createClient();
    const householdId = String(formData.get("householdId") ?? "");
    const membership = await requireHouseholdAdmin(supabase, householdId);
    await clearVoiceKey(supabase, householdId, membership.memberId);
  } catch (thrown) {
    return { error: toErrorBody(thrown, "voice").body.error.message };
  }

  revalidatePath("/settings/voice");
  return { notice: "Removed. WonderHome's own speech service takes over again." };
}
