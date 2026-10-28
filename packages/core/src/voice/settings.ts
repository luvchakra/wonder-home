import { z } from "zod";

import {
  VOICE_PROVIDERS,
  LIVE_ENGINES,
  VOICE_TIERS,
  TIER_LABELS,
  VOICE_GENDERS,
  LISTENING_DEVICES,
  RECOGNITION_MODELS,
  languageLabel,
} from "./settings-options";

/** The options themselves live in `settings-options.ts`, which a client screen can import without zod. */
export * from "./settings-options";

/**
 * A BCP-47 tag we did not put in the list above.
 *
 * Google speaks far more languages than any list we hand-maintain, and a
 * household that knows the tag for theirs should not be told their language
 * does not exist. Anything shaped like a tag is allowed through; Google
 * refuses the ones it genuinely cannot do, and that refusal is shown.
 */
const languageTag = z
  .string()
  .trim()
  .regex(/^[a-z]{2,3}(-[A-Za-z]{2,8})*$/, { error: "That does not look like a language code." })
  .max(20);

export const voiceSettingsSchema = z.object({
  /**
   * Google by default: the deployment has a key, so a household gets a
   * voice that understands them without configuring anything. Resolution
   * falls back to the browser where no key exists anywhere, so this
   * default can never be a control that does nothing.
   */
  provider: z.enum(VOICE_PROVIDERS).default("google"),
  /** Which engine runs live conversation. */
  liveEngine: z.enum(LIVE_ENGINES).default("wonderhome"),

  // What it sounds like.
  /** Spoken language and accent. */
  language: languageTag.default("en-IN"),
  /** A specific Google voice, or null to let the tier and gender decide. */
  voiceName: z.string().trim().max(80).nullable().default(null),
  gender: z.enum(VOICE_GENDERS).default("male"),
  tier: z.enum(VOICE_TIERS).default("wavenet"),
  /** 0.25 is very slow, 4 is very fast, 1 is the voice's own pace. */
  speakingRate: z.number().min(0.25).max(4).default(1),
  /** Semitones away from the voice's own pitch. */
  pitch: z.number().min(-20).max(20).default(0),
  /** Decibels, where 0 is the voice's own level. Above about 10 it distorts. */
  volumeGainDb: z.number().min(-96).max(16).default(0),
  listeningDevice: z.enum(LISTENING_DEVICES).default("none"),
  /** Whether replies are read aloud at all, separate from listening. */
  speakReplies: z.boolean().default(true),

  // How it listens.
  /** Null follows `language`, which is what almost every household wants. */
  recognitionLanguage: languageTag.nullable().default(null),
  /**
   * Other languages the same sentence might be in. A household that moves
   * between Hindi and English mid-sentence is the normal case here, not an
   * edge one, and Google will pick per utterance.
   */
  alternativeLanguages: z.array(languageTag).max(3).default([]),
  recognitionModel: z.enum(RECOGNITION_MODELS).default("latest_short"),
  automaticPunctuation: z.boolean().default(true),
  profanityFilter: z.boolean().default(false),
  /**
   * Words to expect: family names, a school, a dish, the dog. Recognition
   * of a proper noun improves sharply when it is hinted, which is most of
   * why a household assistant mishears anything. The household's own member
   * names are added automatically at request time; these are the extras.
   */
  phraseHints: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  /** Ask Google for its enhanced models where the chosen one has them. */
  enhancedRecognition: z.boolean().default(true),
});

export type VoiceSettings = z.infer<typeof voiceSettingsSchema>;

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = voiceSettingsSchema.parse({});

/** The language actually used for listening, once the "follow speaking" default is resolved. */
export function listeningLanguage(settings: VoiceSettings): string {
  return settings.recognitionLanguage ?? settings.language;
}

/**
 * A sentence a household can check at a glance, for the settings screen and
 * for the progress note that follows a change.
 */
export function describeVoice(settings: VoiceSettings): string {
  if (settings.provider === "browser") {
    return "Your browser's own voice, which varies by device and is free.";
  }

  const parts = [TIER_LABELS[settings.tier].name, languageLabel(settings.language)];
  if (settings.gender !== "any") parts.push(settings.gender === "male" ? "male" : "female");
  if (settings.speakingRate !== 1) parts.push(`${settings.speakingRate.toFixed(2)}× speed`);
  if (settings.pitch !== 0) parts.push(`${settings.pitch > 0 ? "+" : ""}${settings.pitch} semitones`);
  return parts.join(", ");
}
