import { noteKeyOrigin } from "../ai/key-alerts";
import { resolveModelKey, type HouseholdKey, type ModelKey, type PlatformKey } from "../ai/model-key";
import { runtimeEnv } from "../platform/settings/runtime-env";
import type { LiveEngine, VoiceProvider } from "./settings-options";

/**
 * Voice works out of the box, and every layer can still say no (owner,
 * 2026-11-22: "these should be also configurable on platform level and should
 * be switched on by default. on user level, the keys should be allowed to be
 * changed, which can override platform admin values").
 *
 * One order, for every voice setting, resolved at read time:
 *
 *   1. the member's own choice (the live engine only, as before);
 *   2. the household's saved setting or key;
 *   3. WonderHome's platform default or key (Platform admin → AI & providers);
 *   4. the built-in fallback: the browser's own speech, WonderHome's own live loop,
 *      nothing sent to Google.
 *
 * A default fills only what was never chosen: a household's explicit "don't
 * share with Google" beats a platform "on", always. Nothing here writes a row.
 * Each answer carries where it came from, so Settings can say "Default (from
 * WonderHome)" or "Your own key" in words. Pure functions, so the order is
 * tested without a database (`defaults.test.ts`).
 */

export type VoiceOrigin = "member" | "household" | "platform" | "fallback";
export type Resolved<T> = { value: T; origin: VoiceOrigin };

export type VoicePlatformDefaults = {
  engine: LiveEngine;
  provider: VoiceProvider;
  shareWithGoogle: boolean;
};

/** The built-in fallback when Platform admin holds nothing readable. Matches each registry entry's `defaultValue`. */
export const BUILT_IN_VOICE_DEFAULTS: VoicePlatformDefaults = { engine: "gemini_live", provider: "google", shareWithGoogle: true };

/** WonderHome's platform voice defaults (Platform admin → Voice and Alexa). An unreadable value reads as the built-in default. */
export function platformVoiceDefaults(env: Record<string, string | undefined> = runtimeEnv()): VoicePlatformDefaults {
  const engine = env.WONDERHOME_VOICE_ENGINE_DEFAULT?.trim();
  const provider = env.WONDERHOME_VOICE_PROVIDER_DEFAULT?.trim();
  const share = env.WONDERHOME_VOICE_SHARE_GOOGLE_DEFAULT?.trim().toLowerCase();
  return {
    engine: engine === "wonderhome" || engine === "gemini_live" ? engine : BUILT_IN_VOICE_DEFAULTS.engine,
    provider: provider === "browser" || provider === "google" ? provider : BUILT_IN_VOICE_DEFAULTS.provider,
    shareWithGoogle: share === "off" ? false : share === "on" ? true : BUILT_IN_VOICE_DEFAULTS.shareWithGoogle,
  };
}

/** Which engine runs this member's live conversation. Availability is gated afterwards (`gateLiveEngine`). */
export function resolveVoiceEngine(input: { member: LiveEngine | null | undefined; household: LiveEngine | null | undefined; platform: LiveEngine | null | undefined }): Resolved<LiveEngine> {
  if (input.member) return { value: input.member, origin: "member" };
  if (input.household) return { value: input.household, origin: "household" };
  if (input.platform) return { value: input.platform, origin: "platform" };
  return { value: "wonderhome", origin: "fallback" };
}

/** Who listens and reads replies aloud for the household. Google with no key anywhere still falls back to the browser (`resolveProvider`). */
export function resolveVoiceProvider(input: { household: VoiceProvider | null | undefined; platform: VoiceProvider | null | undefined }): Resolved<VoiceProvider> {
  if (input.household) return { value: input.household, origin: "household" };
  if (input.platform) return { value: input.platform, origin: "platform" };
  return { value: "browser", origin: "fallback" };
}

/**
 * Whether what is said in a voice conversation may go to Google. An explicit
 * household answer, either way, is final; only silence takes the platform's.
 * The household's general data-use agreement still applies on top
 * (`routeToProvider`): a household that turned sharing off altogether is never
 * switched back on by this.
 */
export function resolveGoogleVoiceSharing(input: { household: boolean | null | undefined; platform: boolean | null | undefined }): Resolved<boolean> {
  if (typeof input.household === "boolean") return { value: input.household, origin: "household" };
  if (typeof input.platform === "boolean") return { value: input.platform, origin: "platform" };
  return { value: false, origin: "fallback" };
}

/** WonderHome's own Gemini voice key, saved in Platform admin only (`STORE_ONLY_KEYS`). Never shown, never sent to a browser. */
export function platformGeminiVoiceKey(env: Record<string, string | undefined> = runtimeEnv()): PlatformKey {
  const key = env.WONDERHOME_GEMINI_VOICE_KEY?.trim();
  if (!key) return null;
  noteKeyOrigin(key, "platform_saved");
  return { provider: "google", key };
}

/**
 * The key a Gemini Live session runs on, through the same `resolveModelKey`
 * the assistant uses:
 *
 *   household side: its own Gemini voice key, else its assistant key when that is Google's;
 *   platform side: WonderHome's Gemini voice key, else WonderHome's assistant key when that is Google's.
 *
 * A household assistant key on another provider no longer hides WonderHome's
 * voice key (it used to, and Gemini Live said "needs a Google key"). With no
 * Google key anywhere the answer keeps whichever non-Google key exists, so
 * the availability check can say why it is off.
 */
export function resolveGeminiVoiceKey(input: { householdVoice: HouseholdKey; householdAssistant: HouseholdKey; platformVoice: PlatformKey; platformAssistant: PlatformKey }): ModelKey {
  const google = (key: HouseholdKey | PlatformKey) => (key && key.provider === "google" && key.key.trim().length > 0 ? key : null);
  const household = google(input.householdVoice) ?? google(input.householdAssistant);
  const platform = google(input.platformVoice) ?? google(input.platformAssistant);
  const resolved = resolveModelKey(household, platform);
  if (resolved.source !== "none") return resolved;
  return resolveModelKey(input.householdAssistant, input.platformAssistant);
}

/** Settings words for a voice key: "Your own key" or "Using WonderHome's key". */
export type VoiceKeyHolder = "own" | "platform" | "none";
export function voiceKeyHolder(key: Pick<ModelKey, "source" | "provider">): VoiceKeyHolder {
  if (key.provider !== "google" || key.source === "none") return "none";
  return key.source === "household" ? "own" : "platform";
}
