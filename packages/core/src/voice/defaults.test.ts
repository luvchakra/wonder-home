import { describe, expect, it } from "vitest";

import { DEFAULT_DATA_USE, NO_PROVIDER_DATA_USE, dataUseFromRule } from "../ai/privacy";
import { PLATFORM_SETTINGS, settingDefinition } from "../platform/settings/registry";
import { STORE_ONLY_KEYS } from "../platform/settings/runtime-env";
import { geminiLiveAvailability } from "../voicelink/gemini-live";
import {
  BUILT_IN_VOICE_DEFAULTS,
  platformGeminiVoiceKey,
  platformVoiceDefaults,
  resolveGeminiVoiceKey,
  resolveGoogleVoiceSharing,
  resolveVoiceEngine,
  resolveVoiceProvider,
  voiceKeyHolder,
} from "./defaults";

const GOOGLE_HOME = { provider: "google" as const, key: "household-google-voice-key-0001" };
const GOOGLE_PLATFORM = { provider: "google" as const, key: "platform-google-voice-key-0001" };
const ANTHROPIC_HOME = { provider: "anthropic" as const, key: "household-anthropic-key-00001" };
const ANTHROPIC_PLATFORM = { provider: "anthropic" as const, key: "platform-anthropic-key-000001" };

describe("voice resolution order: member > household > platform > fallback", () => {
  it("the engine", () => {
    expect(resolveVoiceEngine({ member: "wonderhome", household: "gemini_live", platform: "gemini_live" })).toEqual({ value: "wonderhome", origin: "member" });
    expect(resolveVoiceEngine({ member: null, household: "gemini_live", platform: "wonderhome" })).toEqual({ value: "gemini_live", origin: "household" });
    expect(resolveVoiceEngine({ member: null, household: null, platform: "gemini_live" })).toEqual({ value: "gemini_live", origin: "platform" });
    expect(resolveVoiceEngine({ member: null, household: null, platform: null })).toEqual({ value: "wonderhome", origin: "fallback" });
  });

  it("the speech provider", () => {
    expect(resolveVoiceProvider({ household: "browser", platform: "google" })).toEqual({ value: "browser", origin: "household" });
    expect(resolveVoiceProvider({ household: null, platform: "google" })).toEqual({ value: "google", origin: "platform" });
    expect(resolveVoiceProvider({ household: null, platform: null })).toEqual({ value: "browser", origin: "fallback" });
  });

  it("sharing with Google: an explicit household off beats a platform on", () => {
    expect(resolveGoogleVoiceSharing({ household: false, platform: true })).toEqual({ value: false, origin: "household" });
    expect(resolveGoogleVoiceSharing({ household: true, platform: false })).toEqual({ value: true, origin: "household" });
    expect(resolveGoogleVoiceSharing({ household: undefined, platform: true })).toEqual({ value: true, origin: "platform" });
    expect(resolveGoogleVoiceSharing({ household: null, platform: null })).toEqual({ value: false, origin: "fallback" });
  });

  it("the Gemini voice key", () => {
    const all = { householdVoice: GOOGLE_HOME, householdAssistant: ANTHROPIC_HOME, platformVoice: GOOGLE_PLATFORM, platformAssistant: ANTHROPIC_PLATFORM };
    expect(resolveGeminiVoiceKey(all)).toMatchObject({ source: "household", key: GOOGLE_HOME.key });
    // The household's assistant key on another provider no longer hides WonderHome's voice key.
    expect(resolveGeminiVoiceKey({ ...all, householdVoice: null })).toMatchObject({ source: "platform", provider: "google", key: GOOGLE_PLATFORM.key });
    // A household assistant key on Google still serves voice before WonderHome's.
    expect(resolveGeminiVoiceKey({ ...all, householdVoice: null, householdAssistant: GOOGLE_HOME })).toMatchObject({ source: "household", key: GOOGLE_HOME.key });
    // WonderHome's assistant key on Google, when no voice key is saved.
    expect(resolveGeminiVoiceKey({ householdVoice: null, householdAssistant: null, platformVoice: null, platformAssistant: { provider: "google", key: "platform-assistant-google-001" } })).toMatchObject({ source: "platform", provider: "google" });
    // No Google key anywhere: the non-Google key is kept so the gate can say why voice is off.
    expect(resolveGeminiVoiceKey({ ...all, householdVoice: null, platformVoice: null })).toMatchObject({ provider: "anthropic" });
    expect(resolveGeminiVoiceKey({ householdVoice: null, householdAssistant: null, platformVoice: null, platformAssistant: null })).toMatchObject({ source: "none" });
  });

  it("says whose key it is in words Settings uses", () => {
    expect(voiceKeyHolder({ source: "household", provider: "google" })).toBe("own");
    expect(voiceKeyHolder({ source: "platform", provider: "google" })).toBe("platform");
    expect(voiceKeyHolder({ source: "household", provider: "anthropic" })).toBe("none");
    expect(voiceKeyHolder({ source: "none", provider: null })).toBe("none");
  });
});

describe("platform voice defaults (Platform admin)", () => {
  it("are on by default, and each can be turned off", () => {
    expect(platformVoiceDefaults({})).toEqual({ engine: "gemini_live", provider: "google", shareWithGoogle: true });
    expect(platformVoiceDefaults({ WONDERHOME_VOICE_ENGINE_DEFAULT: "wonderhome", WONDERHOME_VOICE_PROVIDER_DEFAULT: "browser", WONDERHOME_VOICE_SHARE_GOOGLE_DEFAULT: "off" })).toEqual({
      engine: "wonderhome",
      provider: "browser",
      shareWithGoogle: false,
    });
    expect(platformVoiceDefaults({ WONDERHOME_VOICE_ENGINE_DEFAULT: "nonsense" }).engine).toBe(BUILT_IN_VOICE_DEFAULTS.engine);
  });

  it("match the registry's defaults, the flag included, and the key is a store-only owner secret", () => {
    expect(settingDefinition("WONDERHOME_VOICE_ENGINE_DEFAULT")?.defaultValue).toBe(BUILT_IN_VOICE_DEFAULTS.engine);
    expect(settingDefinition("WONDERHOME_VOICE_PROVIDER_DEFAULT")?.defaultValue).toBe(BUILT_IN_VOICE_DEFAULTS.provider);
    expect(settingDefinition("WONDERHOME_VOICE_SHARE_GOOGLE_DEFAULT")?.defaultValue).toBe("on");
    expect(settingDefinition("WONDERHOME_FLAG_VOICE_CONVERSATION")?.defaultValue).toBe("on");
    const key = PLATFORM_SETTINGS.find((entry) => entry.key === "WONDERHOME_GEMINI_VOICE_KEY")!;
    expect(key).toMatchObject({ kind: "secret", editableBy: "owner", group: "voice" });
    expect(STORE_ONLY_KEYS).toContain("WONDERHOME_GEMINI_VOICE_KEY");
  });

  it("reads WonderHome's Gemini voice key as a Google key", () => {
    expect(platformGeminiVoiceKey({})).toBeNull();
    expect(platformGeminiVoiceKey({ WONDERHOME_GEMINI_VOICE_KEY: `  ${GOOGLE_PLATFORM.key} ` })).toEqual(GOOGLE_PLATFORM);
  });
});

describe("the household's own answer about voice to Google", () => {
  it("is absent until an Admin gives one, and kept either way", () => {
    expect(dataUseFromRule({}).googleVoice).toBeUndefined();
    expect(dataUseFromRule({ googleVoice: false }).googleVoice).toBe(false);
    expect(dataUseFromRule({ googleVoice: true }).googleVoice).toBe(true);
    expect(dataUseFromRule({ googleVoice: "yes" }).googleVoice).toBeUndefined();
  });
});

describe("the Gemini Live gate", () => {
  const live = (over: Partial<Parameters<typeof geminiLiveAvailability>[0]> = {}) =>
    geminiLiveAvailability({ voiceEnabled: true, entitled: true, key: { source: "none", provider: null }, policy: DEFAULT_DATA_USE, ...over });

  it("opens with WonderHome's platform key only", () => {
    const key = resolveGeminiVoiceKey({ householdVoice: null, householdAssistant: null, platformVoice: GOOGLE_PLATFORM, platformAssistant: ANTHROPIC_PLATFORM });
    expect(live({ key, shareWithGoogle: resolveGoogleVoiceSharing({ household: DEFAULT_DATA_USE.googleVoice, platform: true }).value })).toEqual({ available: true });
  });

  it("stays closed when the household said no, whatever the platform default", () => {
    const key = resolveGeminiVoiceKey({ householdVoice: null, householdAssistant: null, platformVoice: GOOGLE_PLATFORM, platformAssistant: null });
    const policy = { ...DEFAULT_DATA_USE, googleVoice: false };
    expect(live({ key, policy, shareWithGoogle: resolveGoogleVoiceSharing({ household: policy.googleVoice, platform: true }).value })).toMatchObject({ available: false, code: "no_consent" });
    expect(live({ key, policy })).toMatchObject({ available: false, code: "no_consent" });
    // A household that turned all sharing off is never switched back on by the voice default.
    expect(live({ key, policy: NO_PROVIDER_DATA_USE, shareWithGoogle: true })).toMatchObject({ available: false, code: "no_consent" });
  });

  it("stays closed when Platform admin turns the default off and the household never chose", () => {
    const key = resolveGeminiVoiceKey({ householdVoice: GOOGLE_HOME, householdAssistant: null, platformVoice: null, platformAssistant: null });
    expect(live({ key, shareWithGoogle: resolveGoogleVoiceSharing({ household: undefined, platform: false }).value })).toMatchObject({ available: false, code: "no_consent" });
  });

  it("stays closed when the rollout flag is off", () => {
    const key = resolveGeminiVoiceKey({ householdVoice: null, householdAssistant: null, platformVoice: GOOGLE_PLATFORM, platformAssistant: null });
    expect(live({ key, voiceEnabled: false, shareWithGoogle: true })).toMatchObject({ available: false, code: "voice_off" });
  });
});
