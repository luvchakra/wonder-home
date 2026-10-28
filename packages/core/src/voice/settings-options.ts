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
 *
 * The options and their labels, with no validation library: the voice settings
 * screen is a client component, and this file is what it ships (the schema in
 * `settings.ts` would pull all of zod into that page).
 */

/** Who does the speaking and listening. `browser` needs nothing configured. */
export const VOICE_PROVIDERS = ["browser", "google"] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];

/**
 * Which engine runs a live, hands-free conversation (voice phase 3).
 * WonderHome's own listens and speaks itself and sends each sentence to
 * HomeTalk; Gemini Live is Google's real-time voice, which can only reach
 * the household through HomeTalk's allowlisted tools. A preference, never a
 * permission: whether Gemini Live may run is re-checked on the server.
 */
export const LIVE_ENGINES = ["wonderhome", "gemini_live"] as const;
export type LiveEngine = (typeof LIVE_ENGINES)[number];

export const LIVE_ENGINE_LABELS: Record<LiveEngine, { name: string; detail: string }> = {
  wonderhome: { name: "WonderHome", detail: "WonderHome listens and answers with the voice set below." },
  gemini_live: { name: "Gemini Live", detail: "Google's real-time voice: quicker back-and-forth, and you can talk over it. It answers only through WonderHome." },
};

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
