import { describe, expect, it } from "vitest";

import { talkComposerState } from "./talk-composer";
import type { SpeechToTextState } from "./use-speech-to-text";

const off = { active: false, paused: false };
const on = { active: true, paused: false };
const held = { active: true, paused: true };

const state = (input: {
  live?: { active: boolean; paused: boolean };
  speech?: SpeechToTextState;
  hasText?: boolean;
}) =>
  talkComposerState({
    live: input.live ?? off,
    speech: input.speech ?? "idle",
    hasText: input.hasText ?? false,
  });

describe("the four states the composer is designed around", () => {
  it("is idle with nothing typed and nothing listening", () => {
    expect(state({})).toBe("idle");
  });

  it("is typing as soon as there is something to send", () => {
    expect(state({ hasText: true })).toBe("typing");
  });

  it("is listening while the microphone is open", () => {
    expect(state({ speech: "listening" })).toBe("listening");
  });

  it("is transcribing between the microphone closing and the words arriving", () => {
    expect(state({ speech: "transcribing" })).toBe("transcribing");
  });

  it("is live during a voice conversation, and paused when it is held", () => {
    expect(state({ live: on })).toBe("live");
    expect(state({ live: held })).toBe("paused");
  });
});

describe("what happens when two things claim to be happening", () => {
  it("never offers Send while the microphone is open", () => {
    // Text typed first is still there underneath, but a Send button during
    // recording would commit words somebody is mid-way through saying.
    expect(state({ speech: "listening", hasText: true })).toBe("listening");
    expect(state({ speech: "transcribing", hasText: true })).toBe("transcribing");
  });

  it("lets a live conversation outrank everything else", () => {
    expect(state({ live: on, speech: "listening", hasText: true })).toBe("live");
    expect(state({ live: held, speech: "transcribing", hasText: true })).toBe("paused");
  });

  it("reads a paused conversation as paused, not as the text left in the box", () => {
    // The session is still open and still owes a recap; showing "typing"
    // here would strand it behind a composer that looks finished.
    expect(state({ live: held, hasText: true })).toBe("paused");
  });
});

describe("states that mean the microphone cannot be used", () => {
  it("falls back to composing, because those are reported as an error instead", () => {
    // "denied" and "unsupported" are not composer states: the person can
    // still type, and the reason they cannot speak is said in words rather
    // than by a field that looks stuck.
    for (const speech of ["denied", "unsupported"] as const) {
      expect(state({ speech })).toBe("idle");
      expect(state({ speech, hasText: true })).toBe("typing");
    }
  });
});
