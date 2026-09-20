import { describe, expect, it } from "vitest";

import { describeSpeechSource, platformSpeechKey, resolveSpeechKey } from "./platform-key";

describe("the deployment's own speech key", () => {
  it("is absent when nothing is configured", () => {
    expect(platformSpeechKey({})).toBeNull();
  });

  it("reads the environment variable the deployment sets", () => {
    expect(platformSpeechKey({ WONDERHOME_SPEECH_KEY: "AIzaPlatform" })).toBe("AIzaPlatform");
  });

  it("treats an empty or blank value as not configured", () => {
    // A variable set to "" is how a deployment turns something off, and it
    // must not read as a key that will then be refused by Google.
    expect(platformSpeechKey({ WONDERHOME_SPEECH_KEY: "" })).toBeNull();
    expect(platformSpeechKey({ WONDERHOME_SPEECH_KEY: "   " })).toBeNull();
  });

  it("trims whitespace a copy-paste leaves behind", () => {
    expect(platformSpeechKey({ WONDERHOME_SPEECH_KEY: "  AIzaPlatform\n" })).toBe("AIzaPlatform");
  });
});

describe("whose key answers for a household", () => {
  it("prefers the household's own over the deployment's", () => {
    expect(resolveSpeechKey("AIzaTheirs", "AIzaOurs")).toEqual({
      source: "household",
      provider: "google",
      key: "AIzaTheirs",
    });
  });

  it("falls back to the deployment's, which is what almost every household uses", () => {
    expect(resolveSpeechKey(null, "AIzaOurs")).toEqual({
      source: "platform",
      provider: "google",
      key: "AIzaOurs",
    });
  });

  it("says plainly when there is no key at all rather than inventing one", () => {
    expect(resolveSpeechKey(null, null)).toEqual({ source: "none", provider: null, key: null });
  });

  it("does not let a blank household key silently shadow a working platform one", () => {
    // A row whose key is whitespace would otherwise take precedence and
    // then be refused by Google, which looks like WonderHome being broken.
    expect(resolveSpeechKey("   ", "AIzaOurs").source).toBe("platform");
  });

  it("trims whichever key it hands back", () => {
    expect(resolveSpeechKey(" AIzaTheirs ", null).key).toBe("AIzaTheirs");
  });
});

describe("what a household is told about whose servers hear them", () => {
  it("says a household key is billed to them, not to us", () => {
    expect(describeSpeechSource("household").detail).toContain("your Google Cloud account");
  });

  it("says the included service needs no account of their own", () => {
    expect(describeSpeechSource("platform").detail).toContain("Included with your plan");
  });

  it("is honest, and attentive, when there is nothing configured", () => {
    const none = describeSpeechSource("none");
    expect(none.tone).toBe("attention");
    expect(none.detail).toContain("browser");
  });
});
