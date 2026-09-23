import { describe, expect, it } from "vitest";

import { CONSEQUENTIAL_CONFIDENCE_FLOOR, gateTranscript, isConsequentialInstruction, TRANSCRIPT_CONFIDENCE_FLOOR, uncertainTranscriptPrompt } from "./audio";

describe("voice-note safety (Wave 3 §17)", () => {
  it("reads on from a clean, confident note", () => {
    expect(gateTranscript({ text: " Asmi has a science exhibition on the 29th ", confidence: 0.93 })).toEqual({
      outcome: "confident",
      text: "Asmi has a science exhibition on the 29th",
      confidence: 0.93,
    });
  });

  it("does not act on a noisy or accented note it is unsure of — it shows what it heard", () => {
    const gate = gateTranscript({ text: "as me has a signs exhibition", confidence: 0.52 });
    expect(gate).toEqual({ outcome: "uncertain", text: "as me has a signs exhibition", confidence: 0.52, consequential: false });
    if (gate.outcome === "uncertain") expect(uncertainTranscriptPrompt(gate)).toMatch(/not sure I heard this right/);
  });

  it("holds a payment or order instruction to a higher bar", () => {
    const text = "Pay the electricity bill of 2400 rupees";
    expect(isConsequentialInstruction(text)).toBe(true);
    const gate = gateTranscript({ text, confidence: 0.85 });
    expect(gate.outcome).toBe("uncertain");
    if (gate.outcome === "uncertain") {
      expect(gate.consequential).toBe(true);
      expect(uncertainTranscriptPrompt(gate)).toMatch(/pay for or order/);
    }
    expect(gateTranscript({ text, confidence: CONSEQUENTIAL_CONFIDENCE_FLOOR }).outcome).toBe("confident");
  });

  it.each(["order two packs of milk", "buy a white T-shirt", "\u20B9500 for the trip", "send money to the cook", "$20 for pizza"])("treats %s as consequential", (text) => {
    expect(isConsequentialInstruction(text)).toBe(true);
  });

  it.each(["Asmi's match is on Saturday", "the bedtime is 9 pm", "Manan has a dentist visit"])("treats %s as ordinary", (text) => {
    expect(isConsequentialInstruction(text)).toBe(false);
  });

  it("says nothing was heard for an empty transcript", () => {
    expect(gateTranscript({ text: "   ", confidence: 0.99 })).toEqual({ outcome: "empty" });
  });

  it("uses a floor that sits below the consequential one", () => {
    expect(TRANSCRIPT_CONFIDENCE_FLOOR).toBeLessThan(CONSEQUENTIAL_CONFIDENCE_FLOOR);
    expect(gateTranscript({ text: "Match on Saturday", confidence: TRANSCRIPT_CONFIDENCE_FLOOR }).outcome).toBe("confident");
  });
});
