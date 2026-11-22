import { readHouseholdKey, readGeminiVoiceKey } from "@wonderhome/core/ai/credentials";
import { platformKey, type ModelKey } from "@wonderhome/core/ai/model-key";
import { runtimeEnvForAi } from "@wonderhome/core/platform/settings/runtime-env";
import { platformGeminiVoiceKey, platformVoiceDefaults, resolveGeminiVoiceKey, resolveGoogleVoiceSharing, type Resolved } from "@wonderhome/core/voice/defaults";
import type { DataUsePolicy } from "@wonderhome/core/ai/privacy";
import { loadDataUse } from "@wonderhome/core/ai/privacy-repository";
import { may } from "@wonderhome/core/billing/repository";
import { flags } from "@wonderhome/core/config/flags";
import { geminiLiveAvailability, type GeminiLiveAvailability } from "@wonderhome/core/voicelink/gemini-live";

import type { Supabase } from "@/app/_lib/hometalk-turn";

import { withReturnTo } from "./return-to";

/**
 * Whether this household may use Gemini voice right now, and with what: its
 * rollout flag, its plan, its key and its data-use agreement, each read
 * fresh — on opening a session and again on every tool call, so a change
 * made in another tab takes effect on the very next thing said.
 */
export async function geminiLiveGate(supabase: Supabase, householdId: string): Promise<{ availability: GeminiLiveAvailability; key: ModelKey; policy: DataUsePolicy; sharing: Resolved<boolean> }> {
  const [entitlement, policy, householdVoice, householdAssistant, env] = await Promise.all([
    may(supabase, householdId, "conversation.voice"),
    loadDataUse(supabase, householdId),
    readGeminiVoiceKey(householdId).catch(() => null),
    readHouseholdKey(householdId).catch(() => null),
    // The saved Platform admin values, waited for (bounded) on a cold server.
    runtimeEnvForAi(),
  ]);
  // One order (voice/defaults.ts): the household's Gemini voice key, else its
  // assistant key when that is Google's; then WonderHome's Gemini voice key,
  // else WonderHome's assistant key when that is Google's.
  const key = resolveGeminiVoiceKey({ householdVoice, householdAssistant, platformVoice: platformGeminiVoiceKey(env), platformAssistant: platformKey(env) });
  // Voice to Google: the household's own answer, else WonderHome's default. An explicit "no" always wins.
  const sharing = resolveGoogleVoiceSharing({ household: policy.googleVoice, platform: platformVoiceDefaults(env).shareWithGoogle });
  const availability = geminiLiveAvailability({ voiceEnabled: flags().voice_conversation, entitled: entitlement.allowed, key, policy, shareWithGoogle: sharing.value });
  return { availability, key, policy, sharing };
}

/**
 * Where to go to make Gemini Live available, for someone who can change it:
 * the one settings page that holds the reason it is off, carrying where they
 * came from so it brings them back. Null when there is nothing they can do.
 */
export function geminiFix(
  availability: GeminiLiveAvailability,
  options: { canManage: boolean; returnTo: string; t: (key: GeminiFixKey) => string },
): { href: string; label: string } | null {
  // Voice being off is the deployment's rollout switch, not a household setting: nothing to link to.
  if (availability.available || !options.canManage || availability.code === "voice_off") return null;
  const target: Record<Exclude<typeof availability.code, "voice_off">, string> = {
    not_google: "/settings/ai#voice-key",
    no_consent: "/settings/ai#share",
    not_entitled: "/settings/plan",
  };
  return { href: withReturnTo(target[availability.code], options.returnTo), label: options.t(`settingsPage.geminiFix.${availability.code}`) };
}

export type GeminiFixKey = "settingsPage.geminiFix.not_google" | "settingsPage.geminiFix.no_consent" | "settingsPage.geminiFix.not_entitled";
