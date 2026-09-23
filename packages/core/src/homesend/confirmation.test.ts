import { describe, expect, it } from "vitest";

import { decideConfirmation, type ConfirmationInput } from "./confirmation";

const CLEAR: ConfirmationInput = {
  kind: "grocery_item",
  extracted: { title: "Milk", needs: [], confidence: "high" },
  understanding: { readable: true, confidence: "high", safety: { instructionsIgnored: false, signals: [] } },
  reconciliation: null,
  subject: null,
  memberInitiated: true,
  autonomy: "execute",
};

function decide(over: Partial<ConfirmationInput>) {
  return decideConfirmation({ ...CLEAR, ...over });
}

describe("HomeSend confirmation strategy (Wave 3 §12)", () => {
  it("applies a clear, safe, reversible item on its own only when the household set that outcome to execute", () => {
    expect(decide({}).mode).toBe("auto_apply");
    expect(decide({}).reason).toMatch(/lets WonderHome handle groceries on its own/);
    for (const autonomy of ["observe", "prepare", "approve"] as const) {
      const decision = decide({ autonomy });
      expect(decision.mode).toBe("prepare");
      expect(decision.reason).toContain(`“${autonomy}”`);
    }
  });

  it("allows a new school item under the school outcome's own setting, once it is clear which child it is for", () => {
    const worksheet = { kind: "school_item" as const, extracted: { title: "Science worksheet", needs: [], confidence: "high" as const } };
    const asmi = { memberId: "asmi", displayName: "Asmi", memberType: "child" as const };
    expect(decide({ ...worksheet, subject: { question: null, selected: asmi } }).mode).toBe("auto_apply");
    expect(decide({ ...worksheet, subject: null })).toMatchObject({ mode: "ask", question: "Who is this for?" });
  });

  it("never applies a bill or a health document on its own, whatever the confidence or setting (consequential)", () => {
    expect(decide({ kind: "bill" })).toMatchObject({ mode: "govern" });
    expect(decide({ kind: "health_document" })).toMatchObject({ mode: "govern" });
  });

  it("prepares and asks at medium confidence", () => {
    expect(decide({ understanding: { readable: true, confidence: "medium", safety: { instructionsIgnored: false, signals: [] } } }).mode).toBe("prepare");
  });

  it("asks one targeted question at low confidence", () => {
    const decision = decide({ understanding: { readable: true, confidence: "low", safety: { instructionsIgnored: false, signals: [] } } });
    expect(decision).toMatchObject({ mode: "ask", question: "Is this something to buy: “Milk”?" });
  });

  it("asks who it is for, rather than guessing, even when everything else is clear", () => {
    const decision = decide({ kind: "school_item", subject: { question: "Who is this for — Asmi or Manan?", selected: null } });
    expect(decision).toMatchObject({ mode: "ask", question: "Who is this for — Asmi or Manan?" });
  });

  it("asks what it is when nothing could tell", () => {
    expect(decide({ kind: "unknown" }).mode).toBe("ask");
    expect(decide({ understanding: { readable: false, confidence: "low", safety: { instructionsIgnored: false, signals: [] } } }).mode).toBe("ask");
    expect(decide({ extracted: { title: null, needs: [], confidence: "high" } })).toMatchObject({ mode: "ask", question: "What is it?" });
  });

  it("never applies on its own when the item matches a record already on file", () => {
    const decision = decide({ reconciliation: { message: "I found the existing Milk.", proposal: { type: "duplicate" } } });
    expect(decision).toMatchObject({ mode: "prepare", reason: "I found the existing Milk." });
  });

  it("never applies on its own when the content tried to instruct WonderHome", () => {
    expect(decide({ understanding: { readable: true, confidence: "high", safety: { instructionsIgnored: true, signals: ["ignore previous instructions"] } } }).mode).toBe("prepare");
  });

  it("leaves several needs for a person to confirm one by one", () => {
    const asmi = { memberId: "asmi", displayName: "Asmi", memberType: "child" as const };
    expect(decide({ kind: "school_item", subject: { question: null, selected: asmi }, extracted: { title: "Sports Day", needs: [{ title: "White T-shirt", reason: "asked for" }], confidence: "high" } }).mode).toBe("prepare");
  });

  it("never applies an email on its own — nobody in the household was acting", () => {
    expect(decide({ memberInitiated: false }).mode).toBe("prepare");
  });
});
