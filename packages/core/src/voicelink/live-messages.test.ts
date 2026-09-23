import { describe, expect, it } from "vitest";

import { LiveTranscript, readLiveMessage } from "./live-messages";

describe("reading a Gemini Live server message", () => {
  it("finds audio, transcripts, turn ends and interruptions", () => {
    const reading = readLiveMessage({
      serverContent: {
        modelTurn: { parts: [{ inlineData: { mimeType: "audio/pcm;rate=24000", data: "AAAA" } }, { text: "ignored" }, { inlineData: { mimeType: "image/png", data: "BBBB" } }] },
        inputTranscription: { text: "what's for" },
        outputTranscription: { text: "Dinner is" },
        turnComplete: true,
        interrupted: true,
      },
    });
    expect(reading).toMatchObject({ audio: ["AAAA"], heard: "what's for", said: "Dinner is", turnComplete: true, interrupted: true, toolCalls: [], goingAway: false });
  });

  it("reads tool calls, cancellations and a going-away notice", () => {
    const reading = readLiveMessage({
      toolCall: { functionCalls: [{ id: "c1", name: "get_meal_plan", args: { when: "tonight" } }, { name: "get_bill_status" }, { id: "c3" }] },
      toolCallCancellation: { ids: ["c0", 5] },
      goAway: { timeLeft: "10s" },
    });
    expect(reading.toolCalls).toEqual([
      { id: "c1", name: "get_meal_plan", args: { when: "tonight" } },
      { id: "call-1", name: "get_bill_status", args: {} },
    ]);
    expect(reading.cancelledToolCalls).toEqual(["c0"]);
    expect(reading.goingAway).toBe(true);
  });

  it("anything malformed reads as nothing, never a throw", () => {
    for (const message of [null, undefined, "text", 42, [], { serverContent: "x", toolCall: { functionCalls: "x" } }]) {
      expect(readLiveMessage(message)).toMatchObject({ audio: [], heard: null, said: null, toolCalls: [], turnComplete: false });
    }
  });
});

describe("the on-screen record of a live conversation", () => {
  it("one message for what the person said, one for the reply", () => {
    const entries: { role: string; text: string }[] = [];
    const transcript = new LiveTranscript((entry) => entries.push(entry));
    transcript.read(readLiveMessage({ serverContent: { inputTranscription: { text: " What's for" } } }));
    transcript.read(readLiveMessage({ serverContent: { inputTranscription: { text: " dinner?" } } }));
    transcript.read(readLiveMessage({ toolCall: { functionCalls: [{ id: "c", name: "get_meal_plan" }] } }));
    transcript.read(readLiveMessage({ serverContent: { outputTranscription: { text: "Dinner is " } } }));
    transcript.read(readLiveMessage({ serverContent: { outputTranscription: { text: "paneer tikka." }, turnComplete: true } }));
    expect(entries).toEqual([
      { role: "member", text: "What's for dinner?" },
      { role: "assistant", text: "Dinner is paneer tikka." },
    ]);
  });

  it("a reply talked over is kept as far as it got, and nothing is lost at the end", () => {
    const entries: { role: string; text: string }[] = [];
    const transcript = new LiveTranscript((entry) => entries.push(entry));
    transcript.read(readLiveMessage({ serverContent: { outputTranscription: { text: "Dinner is" } } }));
    transcript.read(readLiveMessage({ serverContent: { interrupted: true } }));
    transcript.read(readLiveMessage({ serverContent: { inputTranscription: { text: "stop" } } }));
    transcript.finish();
    expect(entries).toEqual([
      { role: "assistant", text: "Dinner is" },
      { role: "member", text: "stop" },
    ]);
  });
});
