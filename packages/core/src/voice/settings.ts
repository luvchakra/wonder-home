import { z } from "zod";

/**
 * What a household's voice sounds like, and how it listens (story 04-009).
 *
 * Every knob Google Cloud Speech actually honours is here, named in the
 * household's own words rather than the API's: "how fast it talks" instead
 * of `speakingRate`, "where you listen" instead of `effectsProfileId`. The
 * mapping to the wire format lives in `google.ts` and nowhere else, so
 * adding a second provider later means writing one adapter, not rewriting
 * this file or the screen that edits it.
 *
 * Nothing here is authorization. A household may set any of it; whether
 * voice runs at all is the `conversation.voice` entitlement and the
 * `voice_conversation` flag, checked server-side on every request.
 */

/** Who does the speaking and listening. `browser` needs nothing configured. */
export const VOICE_PROVIDERS = ["browser", "google"] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];

/**
 * Google's voice families, cheapest and plainest first.
 *
 * The tier decides both how human it sounds and what it costs, and those
 * pull in opposite directions — so the household picks, rather than us
 * picking an expensive default on their behalf. Each tier has its own free
 * monthly allowance on Google's side; `docs/` carries the current figures
 * rather than this file, because they change and a stale number in code is
 * worse than none.
 */
export const VOICE_TIERS = ["standard", "wavenet", "neural2", "studio", "chirp3-hd"] as const;
export type VoiceTier = (typeof VOICE_TIERS)[number];

export const TIER_LABELS: Record<VoiceTier, { name: string; detail: string }> = {
  standard: { name: "Standard", detail: "Plainest, and the largest free allowance." },
  wavenet: { name: "WaveNet", detail: "Noticeably more natural. A good middle." },
  neural2: { name: "Neural2", detail: "Natural, with steadier intonation." },
  studio: { name: "Studio", detail: "Closest to a person reading aloud. Costs the most." },
  "chirp3-hd": { name: "Chirp 3 HD", detail: "Google's newest, most lifelike family." },
};

export const VOICE_GENDERS = ["male", "female", "any"] as const;
export type VoiceGender = (typeof VOICE_GENDERS)[number];

/**
 * Where the household actually listens, which changes the mastering.
 *
 * Google applies a real audio profile for each of these; a reply tuned for
 * a phone earpiece sounds thin on a kitchen speaker and vice versa.
 */
export const LISTENING_DEVICES = [
  "none",
  "handset",
  "headphones",
  "small-speaker",
  "smart-speaker",
  "car",
  "wearable",
] as const;
export type ListeningDevice = (typeof LISTENING_DEVICES)[number];

export const DEVICE_LABELS: Record<ListeningDevice, string> = {
  none: "No adjustment",
  handset: "Phone, held to the ear",
  headphones: "Headphones or earbuds",
  "small-speaker": "Phone speaker",
  "smart-speaker": "Smart speaker at home",
  car: "Car speakers",
  wearable: "Watch or wearable",
};

/** How Google should listen: short commands, long speech, or its newest model. */
export const RECOGNITION_MODELS = ["latest_long", "latest_short", "command_and_search", "chirp"] as const;
export type RecognitionModel = (typeof RECOGNITION_MODELS)[number];

export const RECOGNITION_MODEL_LABELS: Record<RecognitionModel, { name: string; detail: string }> = {
  latest_short: { name: "Short phrases", detail: "Best for a sentence at a time. The usual choice." },
  latest_long: { name: "Longer speech", detail: "Better when somebody talks for a while." },
  command_and_search: { name: "Commands", detail: "Tuned for short instructions and names." },
  chirp: { name: "Chirp", detail: "Google's newest recogniser. Strongest on Indian languages." },
};

/**
 * Languages worth offering, India first because that is where the households
 * are. Each is a BCP-47 tag Google accepts for both speaking and listening.
 */
export const VOICE_LANGUAGES = [
  { code: "en-IN", label: "English (India)" },
  { code: "en-US", label: "English (United States)" },
  { code: "en-GB", label: "English (United Kingdom)" },
  { code: "en-AU", label: "English (Australia)" },
  { code: "hi-IN", label: "Hindi" },
  { code: "bn-IN", label: "Bengali" },
  { code: "ta-IN", label: "Tamil" },
  { code: "te-IN", label: "Telugu" },
  { code: "mr-IN", label: "Marathi" },
  { code: "gu-IN", label: "Gujarati" },
  { code: "kn-IN", label: "Kannada" },
  { code: "ml-IN", label: "Malayalam" },
  { code: "pa-IN", label: "Punjabi" },
  { code: "ur-IN", label: "Urdu" },
  { code: "ar-XA", label: "Arabic" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "zh-CN", label: "Chinese (Mandarin)" },
] as const;

export const LANGUAGE_CODES = VOICE_LANGUAGES.map((language) => language.code);

export function languageLabel(code: string): string {
  return VOICE_LANGUAGES.find((language) => language.code === code)?.label ?? code;
}

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
  provider: z.enum(VOICE_PROVIDERS).default("browser"),

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
