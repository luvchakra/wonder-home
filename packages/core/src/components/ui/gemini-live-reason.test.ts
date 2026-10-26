import { describe, expect, it, vi } from "vitest";

import { withReason } from "./use-gemini-live";

describe("Gemini's own reason for closing a voice session", () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);

  it("adds the close code and reason Google gave", () => {
    expect(withReason("Gemini voice could not connect just now. Nothing was changed.", { code: 1008, reason: "API key not valid.  Please pass a valid key." })).toBe(
      "Gemini voice could not connect just now. Nothing was changed. (Gemini: 1008 · API key not valid. Please pass a valid key.)",
    );
  });

  it("adds nothing for a normal close, or when there is nothing to say", () => {
    expect(withReason("The voice session ended.", { code: 1000, reason: "" })).toBe("The voice session ended.");
    expect(withReason("The voice session had a problem.", undefined)).toBe("The voice session had a problem.");
  });

  it("reads an error event's message", () => {
    expect(withReason("The voice session had a problem.", { message: "quota exceeded" })).toBe("The voice session had a problem. (Gemini: quota exceeded)");
  });
});
