import { describe, expect, it } from "vitest";

import { platformSpeechKey, speechConfigured } from "./platform-key";

describe("the deployment's speech key", () => {
  it("is absent when nothing is configured", () => {
    expect(platformSpeechKey({})).toBeNull();
    expect(speechConfigured({})).toBe(false);
  });

  it("reads the environment variable the deployment sets", () => {
    expect(platformSpeechKey({ WONDERHOME_SPEECH_KEY: "AIzaSyExample" })).toEqual({
      provider: "google",
      key: "AIzaSyExample",
    });
    expect(speechConfigured({ WONDERHOME_SPEECH_KEY: "AIzaSyExample" })).toBe(true);
  });

  it("treats an empty or blank value as not configured", () => {
    // A variable set to "" is how a deployment turns something off, and it
    // must not read as a key that will then be refused by Google.
    expect(platformSpeechKey({ WONDERHOME_SPEECH_KEY: "" })).toBeNull();
    expect(platformSpeechKey({ WONDERHOME_SPEECH_KEY: "   " })).toBeNull();
  });

  it("trims whitespace a copy-paste leaves behind", () => {
    expect(platformSpeechKey({ WONDERHOME_SPEECH_KEY: "  AIzaSyExample\n" })?.key).toBe("AIzaSyExample");
  });
});
