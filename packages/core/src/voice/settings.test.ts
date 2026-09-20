import { describe, expect, it } from "vitest";

import {
  DEFAULT_VOICE_SETTINGS,
  describeVoice,
  languageLabel,
  listeningLanguage,
  voiceSettingsSchema,
} from "./settings";

describe("what a household starts with", () => {
  it("speaks Indian English in a male voice, and listens in the same language", () => {
    expect(DEFAULT_VOICE_SETTINGS.language).toBe("en-IN");
    expect(DEFAULT_VOICE_SETTINGS.gender).toBe("male");
    expect(listeningLanguage(DEFAULT_VOICE_SETTINGS)).toBe("en-IN");
  });

  it("uses the speech service included with the plan, with nothing to set up", () => {
    // The deployment holds a key, so a household is understood properly
    // without creating a Google account. Where no key exists anywhere,
    // `resolveProvider` hands back the browser — so this default can never
    // become a control that does nothing, and never reaches a provider
    // that would bill somebody who configured nothing.
    expect(DEFAULT_VOICE_SETTINGS.provider).toBe("google");
  });
});

describe("what the household is allowed to ask for", () => {
  it("refuses a speaking rate outside what Google honours", () => {
    expect(voiceSettingsSchema.safeParse({ speakingRate: 0.1 }).success).toBe(false);
    expect(voiceSettingsSchema.safeParse({ speakingRate: 5 }).success).toBe(false);
    expect(voiceSettingsSchema.safeParse({ speakingRate: 2 }).success).toBe(true);
  });

  it("refuses a pitch outside the twenty semitones either way that exist", () => {
    expect(voiceSettingsSchema.safeParse({ pitch: -21 }).success).toBe(false);
    expect(voiceSettingsSchema.safeParse({ pitch: 20 }).success).toBe(true);
  });

  it("accepts a language we never listed, because Google speaks more than we do", () => {
    const parsed = voiceSettingsSchema.safeParse({ language: "cy-GB" });
    expect(parsed.success).toBe(true);
  });

  it("refuses something that is not a language code at all", () => {
    expect(voiceSettingsSchema.safeParse({ language: "the one my mum speaks" }).success).toBe(false);
  });

  it("caps the alternatives at what Google itself accepts", () => {
    expect(
      voiceSettingsSchema.safeParse({ alternativeLanguages: ["hi-IN", "ta-IN", "te-IN", "bn-IN"] }).success,
    ).toBe(false);
  });

  it("lets a household listen in a different language from the one it is answered in", () => {
    const settings = voiceSettingsSchema.parse({ language: "en-IN", recognitionLanguage: "hi-IN" });
    expect(listeningLanguage(settings)).toBe("hi-IN");
  });
});

describe("saying what the voice is, in a sentence", () => {
  it("says plainly that the browser's own voice is whatever the device has", () => {
    expect(describeVoice(voiceSettingsSchema.parse({ provider: "browser" }))).toContain("browser");
  });

  it("names the family, the language and anything moved off its default", () => {
    const settings = voiceSettingsSchema.parse({
      provider: "google",
      tier: "studio",
      language: "en-IN",
      gender: "male",
      speakingRate: 1.15,
      pitch: -2,
    });

    const sentence = describeVoice(settings);
    expect(sentence).toContain("Studio");
    expect(sentence).toContain("English (India)");
    expect(sentence).toContain("male");
    expect(sentence).toContain("1.15× speed");
    expect(sentence).toContain("-2 semitones");
  });

  it("stays quiet about anything left at its default", () => {
    const settings = voiceSettingsSchema.parse({ provider: "google", speakingRate: 1, pitch: 0 });
    expect(describeVoice(settings)).not.toContain("speed");
    expect(describeVoice(settings)).not.toContain("semitones");
  });

  it("falls back to the code itself for a language we have no name for", () => {
    expect(languageLabel("cy-GB")).toBe("cy-GB");
    expect(languageLabel("hi-IN")).toBe("Hindi");
  });
});
