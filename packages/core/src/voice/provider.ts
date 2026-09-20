import type { VoiceGender, VoiceProvider, VoiceSettings, VoiceTier } from "./settings";

/**
 * The speech contract, one shape for every provider (story 04-009).
 *
 * The same reasoning as `integrations/connector.ts`: a module asks for "the
 * voice" and gets audio or a transcript back, never learning whose servers
 * produced it. Google is the first real implementation; the browser's own
 * Web Speech API stays as the free fallback, and neither the conversation
 * engine nor the assistant screen knows which one answered.
 *
 * Nothing here is live until a household has configured a key. Until then
 * the resolver hands back the browser provider and the screen says so,
 * rather than offering a control that quietly does nothing (CLAUDE.md:
 * never claim a live integration).
 */

export type VoiceErrorCode =
  | "not_configured"
  | "unauthorized"
  | "quota_exceeded"
  | "unsupported"
  | "too_long"
  | "unavailable"
  | "malformed";

export class VoiceError extends Error {
  readonly code: VoiceErrorCode;
  readonly retryable: boolean;

  constructor(code: VoiceErrorCode, message: string, retryable = false) {
    super(message);
    this.name = "VoiceError";
    this.code = code;
    this.retryable = retryable;
  }
}

/** Audio as it crosses our own boundaries: base64, because it goes through JSON. */
export type AudioClip = {
  base64: string;
  mimeType: string;
};

export type SpokenReply = AudioClip & {
  /** The voice that actually spoke, which may not be the one asked for. */
  voiceName: string;
  /** Characters billed, so a household can see what it is spending. */
  characters: number;
};

export type Transcript = {
  text: string;
  /** 0–1. Providers that do not report one say 0.5 rather than inventing certainty. */
  confidence: number;
  /** Which language it turned out to be, when the provider distinguishes. */
  language: string | null;
};

export type VoiceOption = {
  /** The provider's own identifier, e.g. `en-IN-Wavenet-B`. */
  name: string;
  language: string;
  gender: VoiceGender;
  tier: VoiceTier;
};

export type SpeechProvider = {
  readonly id: VoiceProvider;
  /** Whether this provider can actually do anything right now. */
  readonly live: boolean;
  speak(input: { text: string; settings: VoiceSettings }): Promise<SpokenReply>;
  listen(input: { clip: AudioClip; settings: VoiceSettings; hints?: readonly string[] }): Promise<Transcript>;
  /** What this provider can sound like, for the settings screen to offer. */
  voices(language: string): Promise<VoiceOption[]>;
};

/**
 * The provider for a household that has configured nothing.
 *
 * It refuses rather than pretends: the browser does its own speaking and
 * listening in the page, so there is no server call to make, and a caller
 * that reaches here has asked the server for something only the browser
 * can do. `live: false` is what the screen reads to know that.
 */
export const browserProvider: SpeechProvider = {
  id: "browser",
  live: false,
  async speak() {
    throw new VoiceError(
      "not_configured",
      "This household has not set up a speech provider, so replies are spoken by the browser itself.",
    );
  },
  async listen() {
    throw new VoiceError(
      "not_configured",
      "This household has not set up a speech provider, so listening happens in the browser itself.",
    );
  },
  async voices() {
    return [];
  },
};

/**
 * A provider that answers predictably, for tests and for a deployment that
 * wants the whole path exercised without a bill.
 *
 * The audio is a real, playable WAV of silence at the requested length, so
 * anything downstream that decodes or plays it behaves as it would with
 * speech. The transcript is derived from the clip rather than random, so a
 * test can assert on it.
 */
export function mockProvider(input?: { transcript?: string }): SpeechProvider {
  return {
    id: "google",
    live: true,
    async speak({ text, settings }) {
      return {
        base64: silentWav(Math.min(Math.ceil(text.length / 15), 30)),
        mimeType: "audio/wav",
        voiceName: settings.voiceName ?? `${settings.language}-Mock-A`,
        characters: text.length,
      };
    },
    async listen({ clip, settings }) {
      return {
        text: input?.transcript ?? `heard ${clip.base64.length} bytes`,
        confidence: 0.9,
        language: settings.recognitionLanguage ?? settings.language,
      };
    },
    async voices(language) {
      return [
        { name: `${language}-Mock-A`, language, gender: "female", tier: "standard" },
        { name: `${language}-Mock-B`, language, gender: "male", tier: "standard" },
      ];
    },
  };
}

/** A valid, playable WAV header over `seconds` of silence. */
function silentWav(seconds: number): string {
  const rate = 8000;
  const samples = rate * Math.max(seconds, 1);
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };

  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples * 2, true);

  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
