import { describe, expect, it } from "vitest";

import { pickVoice } from "./use-live-voice";

describe("picking a voice for live conversation", () => {
  it("returns null when the device offers no voices at all", () => {
    expect(pickVoice([], "en-IN")).toBeNull();
  });

  it("prefers a voice whose name reads as male, in the requested language", () => {
    const voices = [
      { name: "Samantha", lang: "en-US" },
      { name: "Daniel", lang: "en-US" },
      { name: "Veena", lang: "en-IN" },
    ];
    expect(pickVoice(voices, "en-US")?.name).toBe("Daniel");
  });

  it("falls back to a voice that does not read as female when no male name matches", () => {
    const voices = [
      { name: "Samantha", lang: "en-US" },
      { name: "Google US English", lang: "en-US" },
    ];
    expect(pickVoice(voices, "en-US")?.name).toBe("Google US English");
  });

  it("prefers the requested language over an unmatched one", () => {
    const voices = [
      { name: "David", lang: "en-GB" },
      { name: "Ravi", lang: "hi-IN" },
    ];
    expect(pickVoice(voices, "hi-IN")?.name).toBe("Ravi");
  });

  it("falls back to any voice when none match the requested language", () => {
    const voices = [{ name: "David", lang: "en-GB" }];
    expect(pickVoice(voices, "fr-FR")?.name).toBe("David");
  });

  it("falls back to the first voice when every one of them reads as female", () => {
    const voices = [
      { name: "Samantha", lang: "en-US" },
      { name: "Victoria", lang: "en-US" },
    ];
    expect(pickVoice(voices, "en-US")?.name).toBe("Samantha");
  });
});
