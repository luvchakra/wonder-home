import { describe, expect, it } from "vitest";

import { googleProvider, resolveVoiceName, tierOf } from "./google";
import { VoiceError, type VoiceOption } from "./provider";
import { voiceSettingsSchema, type VoiceSettings } from "./settings";

const settings = (overrides: Partial<VoiceSettings> = {}): VoiceSettings =>
  voiceSettingsSchema.parse({ provider: "google", ...overrides });

/** A fetch that records what it was asked and answers with whatever is given. */
function fakeFetch(response: unknown, status = 200) {
  const calls: { url: string; body: Record<string, unknown> | null }[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null,
    });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => response,
    } as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const clip = { base64: "AAAA", mimeType: "audio/webm;codecs=opus" };

describe("speaking through Google", () => {
  it("sends the household's own rate, pitch and volume, and returns playable audio", async () => {
    const { impl, calls } = fakeFetch({ audioContent: "bXAz" });
    const provider = googleProvider("key-1234567890123456789", impl);

    const spoken = await provider.speak({
      text: "Dinner is at seven.",
      settings: settings({ speakingRate: 1.25, pitch: -2, volumeGainDb: 3, voiceName: "en-IN-Wavenet-B" }),
    });

    const audioConfig = (calls[0]!.body!.audioConfig as Record<string, unknown>);
    expect(audioConfig.speakingRate).toBe(1.25);
    expect(audioConfig.pitch).toBe(-2);
    expect(audioConfig.volumeGainDb).toBe(3);
    expect((calls[0]!.body!.voice as Record<string, unknown>).name).toBe("en-IN-Wavenet-B");
    expect(spoken.base64).toBe("bXAz");
    expect(spoken.mimeType).toBe("audio/mpeg");
    expect(spoken.characters).toBe("Dinner is at seven.".length);
  });

  it("never sends pitch or a device profile to a Chirp voice, which rejects both", async () => {
    const { impl, calls } = fakeFetch({ audioContent: "bXAz" });
    const provider = googleProvider("key-1234567890123456789", impl);

    await provider.speak({
      text: "Hello",
      settings: settings({ tier: "chirp3-hd", pitch: 5, listeningDevice: "headphones" }),
    });

    const audioConfig = calls[0]!.body!.audioConfig as Record<string, unknown>;
    expect(audioConfig).not.toHaveProperty("pitch");
    expect(audioConfig).not.toHaveProperty("effectsProfileId");
  });

  it("sends the device profile for a tier that honours it", async () => {
    const { impl, calls } = fakeFetch({ audioContent: "bXAz" });
    const provider = googleProvider("key-1234567890123456789", impl);

    await provider.speak({ text: "Hello", settings: settings({ tier: "wavenet", listeningDevice: "car" }) });

    const audioConfig = calls[0]!.body!.audioConfig as Record<string, unknown>;
    expect(audioConfig.effectsProfileId).toEqual(["large-automotive-class-device"]);
  });

  it("asks by gender when no specific voice was chosen", async () => {
    const { impl, calls } = fakeFetch({ audioContent: "bXAz" });
    const provider = googleProvider("key-1234567890123456789", impl);

    await provider.speak({ text: "Hello", settings: settings({ voiceName: null, gender: "male" }) });

    expect((calls[0]!.body!.voice as Record<string, unknown>).ssmlGender).toBe("MALE");
  });

  it("refuses a reply too long for one request rather than truncating it silently", async () => {
    const { impl } = fakeFetch({ audioContent: "bXAz" });
    const provider = googleProvider("key-1234567890123456789", impl);

    await expect(provider.speak({ text: "a".repeat(5001), settings: settings() })).rejects.toMatchObject({
      code: "too_long",
    });
  });
});

describe("listening through Google", () => {
  it("merges the household's phrase hints with the ones passed in, without duplicates", async () => {
    const { impl, calls } = fakeFetch({ results: [{ alternatives: [{ transcript: "add milk", confidence: 0.9 }] }] });
    const provider = googleProvider("key-1234567890123456789", impl);

    await provider.listen({
      clip,
      settings: settings({ phraseHints: ["Anaya", "dosa"] }),
      hints: ["Priya", "Anaya"],
    });

    const config = calls[0]!.body!.config as Record<string, unknown>;
    const contexts = config.speechContexts as { phrases: string[]; boost: number }[];
    expect(contexts[0]!.phrases).toEqual(["Priya", "Anaya", "dosa"]);
    expect(contexts[0]!.boost).toBe(15);
  });

  it("joins every stretch of speech into one utterance and averages the confidence", async () => {
    const { impl } = fakeFetch({
      results: [
        { alternatives: [{ transcript: "add milk", confidence: 0.8 }], languageCode: "en-IN" },
        { alternatives: [{ transcript: "and bread", confidence: 1.0 }] },
      ],
    });
    const provider = googleProvider("key-1234567890123456789", impl);

    const heard = await provider.listen({ clip, settings: settings() });
    expect(heard.text).toBe("add milk and bread");
    expect(heard.confidence).toBeCloseTo(0.9);
    expect(heard.language).toBe("en-IN");
  });

  it("reports an honest middling confidence when Google does not give one", async () => {
    const { impl } = fakeFetch({ results: [{ alternatives: [{ transcript: "hello" }] }] });
    const provider = googleProvider("key-1234567890123456789", impl);

    expect((await provider.listen({ clip, settings: settings() })).confidence).toBe(0.5);
  });

  it("leaves the primary language out of the alternatives it sends", async () => {
    const { impl, calls } = fakeFetch({ results: [] });
    const provider = googleProvider("key-1234567890123456789", impl);

    await provider.listen({
      clip,
      settings: settings({ language: "en-IN", alternativeLanguages: ["en-IN", "hi-IN"] }),
    });

    expect((calls[0]!.body!.config as Record<string, unknown>).alternativeLanguageCodes).toEqual(["hi-IN"]);
  });

  it("never asks Chirp for the enhanced models it does not have", async () => {
    const { impl, calls } = fakeFetch({ results: [] });
    const provider = googleProvider("key-1234567890123456789", impl);

    await provider.listen({ clip, settings: settings({ recognitionModel: "chirp", enhancedRecognition: true }) });

    expect(calls[0]!.body!.config).not.toHaveProperty("useEnhanced");
  });

  it("tells Google the encoding the browser actually recorded", async () => {
    const { impl, calls } = fakeFetch({ results: [] });
    const provider = googleProvider("key-1234567890123456789", impl);

    await provider.listen({ clip: { base64: "AA", mimeType: "audio/wav" }, settings: settings() });

    const config = calls[0]!.body!.config as Record<string, unknown>;
    expect(config.encoding).toBe("LINEAR16");
    // Opus carries its own rate; WAV from our recorder does not.
    expect(config.sampleRateHertz).toBe(16000);
  });

  it("does not claim a sample rate for Opus, which carries its own", async () => {
    const { impl, calls } = fakeFetch({ results: [] });
    const provider = googleProvider("key-1234567890123456789", impl);

    await provider.listen({ clip, settings: settings() });

    expect(calls[0]!.body!.config).not.toHaveProperty("sampleRateHertz");
  });

  it("refuses a recording Google cannot read", async () => {
    const { impl } = fakeFetch({ results: [] });
    const provider = googleProvider("key-1234567890123456789", impl);

    await expect(
      provider.listen({ clip: { base64: "AA", mimeType: "audio/aac" }, settings: settings() }),
    ).rejects.toMatchObject({ code: "unsupported" });
  });
});

describe("what Google's refusals become", () => {
  it("turns a rejected key into something a household can act on", async () => {
    const { impl } = fakeFetch({ error: { message: "API key not valid. Please pass a valid API key." } }, 400);
    const provider = googleProvider("key-1234567890123456789", impl);

    const thrown = await provider.speak({ text: "Hi", settings: settings() }).catch((error: VoiceError) => error);
    expect(thrown).toBeInstanceOf(VoiceError);
    expect((thrown as VoiceError).code).toBe("unauthorized");
    expect((thrown as VoiceError).message).toContain("Settings");
  });

  it("names the real problem when the API was never switched on", async () => {
    const { impl } = fakeFetch(
      { error: { message: "Cloud Text-to-Speech API has not been used in project 12345 before" } },
      403,
    );
    const provider = googleProvider("key-1234567890123456789", impl);

    await expect(provider.speak({ text: "Hi", settings: settings() })).rejects.toMatchObject({
      code: "not_configured",
    });
  });

  it("marks a spent allowance retryable, because next month it is not spent", async () => {
    const { impl } = fakeFetch({ error: { message: "Quota exceeded" } }, 429);
    const provider = googleProvider("key-1234567890123456789", impl);

    const thrown = await provider.speak({ text: "Hi", settings: settings() }).catch((error: VoiceError) => error);
    expect((thrown as VoiceError).code).toBe("quota_exceeded");
    expect((thrown as VoiceError).retryable).toBe(true);
  });

  it("never passes Google's own prose through to a household", async () => {
    const { impl } = fakeFetch({ error: { message: "project 998877 quota metric speech.googleapis.com" } }, 500);
    const provider = googleProvider("key-1234567890123456789", impl);

    const thrown = await provider.speak({ text: "Hi", settings: settings() }).catch((error: VoiceError) => error);
    expect((thrown as VoiceError).message).not.toContain("998877");
  });
});

describe("choosing which voice speaks", () => {
  const available: VoiceOption[] = [
    { name: "en-IN-Standard-A", language: "en-IN", gender: "female", tier: "standard" },
    { name: "en-IN-Standard-B", language: "en-IN", gender: "male", tier: "standard" },
    { name: "en-IN-Wavenet-A", language: "en-IN", gender: "female", tier: "wavenet" },
    { name: "en-IN-Wavenet-B", language: "en-IN", gender: "male", tier: "wavenet" },
    { name: "hi-IN-Wavenet-C", language: "hi-IN", gender: "male", tier: "wavenet" },
  ];

  it("reads the family from Google's own naming", () => {
    expect(tierOf("en-IN-Wavenet-B")).toBe("wavenet");
    expect(tierOf("en-US-Studio-O")).toBe("studio");
    expect(tierOf("en-IN-Chirp3-HD-Achernar")).toBe("chirp3-hd");
    expect(tierOf("en-IN-Neural2-A")).toBe("neural2");
    expect(tierOf("en-IN-Standard-C")).toBe("standard");
  });

  it("honours a named voice above everything else", () => {
    expect(resolveVoiceName(settings({ voiceName: "en-IN-Studio-Z" }), available)).toBe("en-IN-Studio-Z");
  });

  it("matches the tier, then the gender, within the chosen language", () => {
    expect(resolveVoiceName(settings({ tier: "wavenet", gender: "male", language: "en-IN" }), available)).toBe(
      "en-IN-Wavenet-B",
    );
    expect(resolveVoiceName(settings({ tier: "standard", gender: "female", language: "en-IN" }), available)).toBe(
      "en-IN-Standard-A",
    );
  });

  it("stays in the chosen language even when the tier has to give", () => {
    expect(resolveVoiceName(settings({ tier: "studio", gender: "male", language: "hi-IN" }), available)).toBe(
      "hi-IN-Wavenet-C",
    );
  });

  it("leaves the choice to Google rather than naming a voice that does not exist", () => {
    expect(resolveVoiceName(settings({ voiceName: null }), [])).toBeNull();
  });
});
