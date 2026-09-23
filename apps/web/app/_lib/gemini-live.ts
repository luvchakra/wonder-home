import { readHouseholdKey } from "@wonderhome/core/ai/credentials";
import { platformKey, resolveModelKey, type ModelKey } from "@wonderhome/core/ai/model-key";
import type { DataUsePolicy } from "@wonderhome/core/ai/privacy";
import { loadDataUse } from "@wonderhome/core/ai/privacy-repository";
import { may } from "@wonderhome/core/billing/repository";
import { flags } from "@wonderhome/core/config/flags";
import { geminiLiveAvailability, type GeminiLiveAvailability } from "@wonderhome/core/voicelink/gemini-live";

import type { Supabase } from "@/app/_lib/hometalk-turn";

/**
 * Whether this household may use Gemini voice right now, and with what: its
 * rollout flag, its plan, its key and its data-use agreement, each read
 * fresh — on opening a session and again on every tool call, so a change
 * made in another tab takes effect on the very next thing said.
 */
export async function geminiLiveGate(supabase: Supabase, householdId: string): Promise<{ availability: GeminiLiveAvailability; key: ModelKey; policy: DataUsePolicy }> {
  const [entitlement, policy, householdKey] = await Promise.all([
    may(supabase, householdId, "conversation.voice"),
    loadDataUse(supabase, householdId),
    readHouseholdKey(householdId).catch(() => null),
  ]);
  const key = resolveModelKey(householdKey, platformKey());
  const availability = geminiLiveAvailability({ voiceEnabled: flags().voice_conversation, entitled: entitlement.allowed, key, policy });
  return { availability, key, policy };
}
