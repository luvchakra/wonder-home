import { VoiceError, type AudioClip, type SpeechProvider, type SpokenReply, type Transcript, type VoiceOption } from "./provider";
import { listeningLanguage, type ListeningDevice, type VoiceGender, type VoiceSettings, type VoiceTier } from "./settings";

/**
 * Google Cloud Speech, behind the provider contract (story 04-009).
 *
 * Two REST endpoints, called with the household's own API key from the
 * server only: Text-to-Speech to say a reply, Speech-to-Text to hear one.
 * The key never reaches a browser — the page posts to our own route, which
 * reads the key with the service role the way `ai/credentials.ts` does.
 *
 * This file is the only place that knows Google's vocabulary. Everything
 * above it speaks in the household's terms ("male", "a bit slower", "phone
 * speaker") and this translates. Where Google refuses a combination —
 * Chirp voices ignore pitch, Studio voices ignore the device profile — the
 * adapter drops the parameter rather than sending a request it knows will
 * be rejected, because a 400 from a provider is a dead end a household
 * cannot act on.
 */

const TTS_ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const VOICES_ENDPOINT = "https://texttospeech.googleapis.com/v1/voices";
const STT_ENDPOINT = "https://speech.googleapis.com/v1/speech:recognize";

/** Google's own name for each tier, as it appears inside a voice's name. */
const TIER_TOKEN: Record<VoiceTier, string> = {
  standard: "Standard",
  wavenet: "Wavenet",
  neural2: "Neural2",
  studio: "Studio",
  "chirp3-hd": "Chirp3-HD",
};

const DEVICE_PROFILE: Record<ListeningDevice, string | null> = {
  none: null,
  handset: "handset-class-device",
  headphones: "headphone-class-device",
  "small-speaker": "small-bluetooth-speaker-class-device",
  "smart-speaker": "medium-bluetooth-speaker-class-device",
  car: "large-automotive-class-device",
  wearable: "wearable-class-device",
};

const GENDER: Record<VoiceGender, string | null> = {
  male: "MALE",
  female: "FEMALE",
  any: null,
};

/**
 * Tiers that accept only a reduced set of audio controls.
 *
 * Google's newest voices synthesise prosody themselves and reject the older
 * knobs outright. Sending `pitch` to a Chirp voice is a 400, not a no-op,
 * so this is correctness rather than tidiness.
 */
const IGNORES_PITCH = new Set<VoiceTier>(["chirp3-hd"]);
const IGNORES_DEVICE_PROFILE = new Set<VoiceTier>(["chirp3-hd"]);

export function googleProvider(apiKey: string, fetchImpl: typeof fetch = fetch): SpeechProvider {
  return {
    id: "google",
    live: true,

    async speak({ text, settings }): Promise<SpokenReply> {
      const trimmed = text.trim();
      if (!trimmed) throw new VoiceError("malformed", "There was nothing to say.");
      // Google's own limit for one synthesis request. A reply this long is a
      // bug upstream, and truncating it silently would hide that.
      if (trimmed.length > 5000) {
        throw new VoiceError("too_long", "That reply is too long to read aloud in one go.");
      }

      const audioConfig: Record<string, unknown> = {
        audioEncoding: "MP3",
        speakingRate: settings.speakingRate,
        volumeGainDb: settings.volumeGainDb,
      };
      if (!IGNORES_PITCH.has(settings.tier)) audioConfig.pitch = settings.pitch;

      const profile = DEVICE_PROFILE[settings.listeningDevice];
      if (profile && !IGNORES_DEVICE_PROFILE.has(settings.tier)) {
        audioConfig.effectsProfileId = [profile];
      }

      const voice: Record<string, unknown> = { languageCode: settings.language };
      if (settings.voiceName) {
        voice.name = settings.voiceName;
      } else {
        // No named voice: let Google choose within the language, nudged by
        // gender. The tier cannot be asked for without naming a voice, so
        // `resolveVoiceName` picks one up front wherever the tier matters.
        const gender = GENDER[settings.gender];
        if (gender) voice.ssmlGender = gender;
      }

      const payload = await call<{ audioContent?: string }>(
        fetchImpl,
        `${TTS_ENDPOINT}?key=${encodeURIComponent(apiKey)}`,
        { input: { text: trimmed }, voice, audioConfig },
      );

      if (!payload.audioContent) {
        throw new VoiceError("unavailable", "Google returned no audio for that reply.");
      }

      return {
        base64: payload.audioContent,
        mimeType: "audio/mpeg",
        voiceName: (voice.name as string | undefined) ?? `${settings.language} (chosen by Google)`,
        characters: trimmed.length,
      };
    },

    async listen({ clip, settings, hints }): Promise<Transcript> {
      const language = listeningLanguage(settings);
      const config: Record<string, unknown> = {
        encoding: encodingFor(clip.mimeType),
        languageCode: language,
        model: settings.recognitionModel,
        enableAutomaticPunctuation: settings.automaticPunctuation,
        profanityFilter: settings.profanityFilter,
        maxAlternatives: 1,
      };

      const sampleRate = sampleRateFor(clip.mimeType);
      if (sampleRate) config.sampleRateHertz = sampleRate;

      // Chirp is its own model family and refuses `useEnhanced`, which only
      // ever applied to the older ones.
      if (settings.enhancedRecognition && settings.recognitionModel !== "chirp") {
        config.useEnhanced = true;
      }

      if (settings.alternativeLanguages.length > 0) {
        config.alternativeLanguageCodes = settings.alternativeLanguages.filter((code) => code !== language);
      }

      // Names are what a household assistant mishears, so every hint we have
      // is worth sending. `boost` is Google's own weighting; 15 is firm
      // without drowning out what was actually said.
      const phrases = [...new Set([...(hints ?? []), ...settings.phraseHints])].filter(Boolean).slice(0, 500);
      if (phrases.length > 0) config.speechContexts = [{ phrases, boost: 15 }];

      const payload = await call<{
        results?: { alternatives?: { transcript?: string; confidence?: number }[]; languageCode?: string }[];
      }>(fetchImpl, `${STT_ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
        config,
        audio: { content: clip.base64 },
      });

      // Every result is one stretch of speech; a single utterance can come
      // back as several, so they are joined rather than the first one taken.
      const results = payload.results ?? [];
      const text = results
        .map((result) => result.alternatives?.[0]?.transcript ?? "")
        .join(" ")
        .trim();

      const confidences = results
        .map((result) => result.alternatives?.[0]?.confidence)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

      return {
        text,
        confidence: confidences.length > 0 ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : 0.5,
        language: results[0]?.languageCode ?? language,
      };
    },

    async voices(language): Promise<VoiceOption[]> {
      const payload = await call<{ voices?: { name?: string; languageCodes?: string[]; ssmlGender?: string }[] }>(
        fetchImpl,
        `${VOICES_ENDPOINT}?key=${encodeURIComponent(apiKey)}&languageCode=${encodeURIComponent(language)}`,
        undefined,
      );

      return (payload.voices ?? [])
        .flatMap((voice) => {
          if (!voice.name) return [];
          return [
            {
              name: voice.name,
              language: voice.languageCodes?.[0] ?? language,
              gender: readGender(voice.ssmlGender),
              tier: tierOf(voice.name),
            },
          ];
        })
        .sort((left, right) => left.name.localeCompare(right.name));
    },
  };
}

/** Which family a voice belongs to, read from Google's own naming convention. */
export function tierOf(voiceName: string): VoiceTier {
  const lower = voiceName.toLowerCase();
  if (lower.includes("chirp3-hd") || lower.includes("chirp3hd")) return "chirp3-hd";
  if (lower.includes("studio")) return "studio";
  if (lower.includes("neural2")) return "neural2";
  if (lower.includes("wavenet")) return "wavenet";
  return "standard";
}

function readGender(value: string | undefined): VoiceGender {
  if (value === "MALE") return "male";
  if (value === "FEMALE") return "female";
  return "any";
}

/**
 * The voice to ask for, given what the household said it wanted.
 *
 * A named voice wins outright. Otherwise the best match on tier, then
 * gender, then language — and when nothing matches, null, which leaves the
 * choice to Google rather than naming a voice that does not exist.
 */
export function resolveVoiceName(settings: VoiceSettings, available: readonly VoiceOption[]): string | null {
  if (settings.voiceName) return settings.voiceName;

  const token = TIER_TOKEN[settings.tier].toLowerCase();
  const sameLanguage = available.filter((voice) => voice.language.toLowerCase() === settings.language.toLowerCase());
  const pool = sameLanguage.length > 0 ? sameLanguage : available;
  const sameTier = pool.filter((voice) => voice.name.toLowerCase().includes(token));
  const candidates = sameTier.length > 0 ? sameTier : pool;

  if (settings.gender !== "any") {
    const matching = candidates.find((voice) => voice.gender === settings.gender);
    if (matching) return matching.name;
  }

  return candidates[0]?.name ?? null;
}

/** Google's encoding name for what the browser recorded. */
function encodingFor(mimeType: string): string {
  const type = mimeType.toLowerCase();
  if (type.includes("webm")) return "WEBM_OPUS";
  if (type.includes("ogg")) return "OGG_OPUS";
  if (type.includes("flac")) return "FLAC";
  if (type.includes("mpeg") || type.includes("mp3")) return "MP3";
  if (type.includes("wav") || type.includes("wave") || type.includes("pcm")) return "LINEAR16";
  throw new VoiceError("unsupported", "That recording is in a format Google cannot read.");
}

/**
 * Opus carries its rate in the container, and telling Google a different one
 * is an error. WAV from our own recorder is always 16 kHz.
 */
function sampleRateFor(mimeType: string): number | null {
  const type = mimeType.toLowerCase();
  if (type.includes("webm") || type.includes("ogg")) return null;
  if (type.includes("wav") || type.includes("wave") || type.includes("pcm")) return 16000;
  return null;
}

async function call<T>(fetchImpl: typeof fetch, url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new VoiceError("unavailable", "Google's speech service could not be reached.", true);
  }

  if (!response.ok) throw await errorFor(response);
  return (await response.json()) as T;
}

/**
 * Google's failures, turned into something a household can act on.
 *
 * The provider's own prose is deliberately not passed through: it names
 * projects, quotas and endpoints, and the person reading it can only act on
 * "the key is wrong" or "the free allowance is gone".
 */
async function errorFor(response: Response): Promise<VoiceError> {
  const detail = await response
    .json()
    .then((body: { error?: { status?: string; message?: string } }) => body?.error ?? null)
    .catch(() => null);

  if (response.status === 400 && detail?.message?.includes("API key not valid")) {
    return new VoiceError("unauthorized", "That Google API key was refused. Check it in Settings.");
  }
  if (response.status === 401 || response.status === 403) {
    const message = detail?.message ?? "";
    if (message.includes("has not been used") || message.includes("is disabled")) {
      return new VoiceError(
        "not_configured",
        "The Speech APIs are not switched on for that Google project yet.",
      );
    }
    return new VoiceError("unauthorized", "Google refused that key for speech. Check it in Settings.");
  }
  if (response.status === 429) {
    return new VoiceError("quota_exceeded", "This household has used its Google speech allowance.", true);
  }
  if (response.status === 400) {
    return new VoiceError("malformed", "Google could not read that request. Try different voice settings.");
  }
  return new VoiceError("unavailable", "Google's speech service is having trouble. Try again shortly.", true);
}
