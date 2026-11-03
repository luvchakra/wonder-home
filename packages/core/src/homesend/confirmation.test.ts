import { describe, expect, it } from "vitest";

import { decideConfirmation, type ConfirmationInput } from "./confirmation";

const CLEAR: ConfirmationInput = {
  kind: "grocery_item",
  extracted: { title: "Milk", needs: [], confidence: "high" },
  // Checked against what was sent: every detail found there (verify.ts).
  understanding: { readable: true, confidence: "high", score: 0.97, check: { verified: true, unverified: [] }, safety: { instructionsIgnored: false, signals: [] } },
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
    for (const autonomy of ["prepare"] as const) {
      const decision = decide({ autonomy });
      expect(decision.mode).toBe("prepare");
      expect(decision.reason).toContain("“Wait for Approval”");
    }
  });

  it("allows a new school item under the school outcome's own setting, once it is clear which child it is for", () => {
    const worksheet = { kind: "school_item" as const, extracted: { title: "Science worksheet", dueDate: "2026-11-02", needs: [], confidence: "high" as const } };
    const asmi = { memberId: "asmi", displayName: "Asmi", memberType: "child" as const };
    expect(decide({ ...worksheet, subject: { question: null, selected: asmi } }).mode).toBe("auto_apply");
    // A school item can't be added without its due date: it is asked, never guessed (the owner, 2026-10-26).
    expect(decide({ ...worksheet, extracted: { ...worksheet.extracted, dueDate: null }, subject: { question: null, selected: asmi } })).toMatchObject({ mode: "ask", question: null, reason: "It doesn't say the due date.", stillNeeded: ["due date"] });
    expect(decide({ ...worksheet, subject: null })).toMatchObject({ mode: "ask", question: "Who is this for?" });
  });

  it("adds directly, marked Checking, when it is not more than 95% sure (the owner, 2026-11-03)", () => {
    const unchecked = { readable: true, confidence: "high" as const, score: 0.9, check: { verified: false, unverified: ["the name"] }, safety: { instructionsIgnored: false, signals: [] } };
    expect(decide({ understanding: unchecked })).toMatchObject({ mode: "auto_apply", unconfirmed: true });
    expect(decide({ understanding: unchecked }).reason).toContain("marked Checking");
    // A photo or file has no words of its own to check against: added, but always Checking.
    const photo = { ...unchecked, score: 0.99, check: { verified: false, unverified: ["the original, which can't be checked word by word"] } };
    expect(decide({ understanding: photo })).toMatchObject({ mode: "auto_apply", unconfirmed: true });
    // Exactly 95% is not more than 95%.
    expect(decide({ understanding: { ...unchecked, score: 0.95, check: { verified: true, unverified: [] } } })).toMatchObject({ mode: "auto_apply", unconfirmed: true });
    // An item read before the check existed has no score: added, and checked.
    const { score: _score, check: _check, ...old } = unchecked;
    expect(decide({ understanding: old })).toMatchObject({ mode: "auto_apply", unconfirmed: true });
    // Above the bar: simply added, nothing to check.
    const above = decide({ understanding: { ...unchecked, score: 0.96, check: { verified: true, unverified: [] } } });
    expect(above.mode).toBe("auto_apply");
    expect(above.unconfirmed).toBeUndefined();
  });

  it("never applies a bill or a health document on its own, whatever the confidence or setting (consequential)", () => {
    expect(decide({ kind: "bill" })).toMatchObject({ mode: "govern" });
    expect(decide({ kind: "health_document" })).toMatchObject({ mode: "govern" });
  });

  it("adds a medium reading marked Checking, never as if it were sure", () => {
    expect(decide({ understanding: { readable: true, confidence: "medium", safety: { instructionsIgnored: false, signals: [] } } })).toMatchObject({ mode: "auto_apply", unconfirmed: true });
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
    expect(decide({ kind: "school_item", subject: { question: null, selected: asmi }, extracted: { title: "Sports Day", dueDate: "2026-11-02", needs: [{ title: "White T-shirt", reason: "asked for" }], confidence: "high" } }).mode).toBe("prepare");
  });

  it("never applies an email on its own — nobody in the household was acting", () => {
    expect(decide({ memberInitiated: false }).mode).toBe("prepare");
  });
});

describe("the household's bar for adding on its own (the owner, 2026-10-26)", () => {
  const unchecked = { readable: true, confidence: "high" as const, score: 0.9, check: { verified: false, unverified: ["the name"] }, safety: { instructionsIgnored: false, signals: [] } };
  const unsure = { readable: true, confidence: "medium" as const, score: 0.7, check: { verified: false, unverified: ["the name"] }, safety: { instructionsIgnored: false, signals: [] } };

  it("is 95% until an Admin picks another, and is strictly above", () => {
    expect(decide({}).unconfirmed).toBeUndefined();
    expect(decide({ understanding: unchecked }).unconfirmed).toBe(true);
    expect(decide({ autoAddPercent: 97 })).toMatchObject({ mode: "auto_apply", unconfirmed: true });
  });

  it("follows a lower bar the Admin picked, for a clear or even a medium reading", () => {
    expect(decide({ understanding: unchecked, autoAddPercent: 85 })).toMatchObject({ mode: "auto_apply" });
    expect(decide({ understanding: unchecked, autoAddPercent: 85 }).unconfirmed).toBeUndefined();
    expect(decide({ understanding: unsure, autoAddPercent: 60 }).unconfirmed).toBeUndefined();
    expect(decide({ understanding: unsure, autoAddPercent: 70 })).toMatchObject({ mode: "auto_apply", unconfirmed: true });
  });

  it("names the household's own bar when it is still checking", () => {
    const sureButUnnamed = { ...unchecked, check: { verified: false, unverified: [] } };
    expect(decide({ understanding: sureButUnnamed, autoAddPercent: 90 }).reason).toContain("wasn't more than 90% sure");
  });

  it("never lets any bar add a bill with the money switch off, or anything under Wait for Approval", () => {
    expect(decide({ kind: "bill", autoAddPercent: 60 }).mode).toBe("govern");
    expect(decide({ kind: "health_document", autoAddPercent: 60 }).mode).toBe("govern");
    expect(decide({ understanding: unchecked, autoAddPercent: 60, autonomy: "prepare" }).mode).toBe("prepare");
  });
});

describe("what an entry can't be added without (the owner, 2026-10-26)", () => {
  it("reports what is missing and never words the question itself — HomeTalk asks", () => {
    expect(decide({ kind: "event", extracted: { title: "Diwali dinner", needs: [], confidence: "high" } })).toMatchObject({ mode: "ask", question: null, stillNeeded: ["day"], reason: "It doesn't say the day." });
    expect(decide({ kind: "bill", extracted: { title: "Electricity", payee: "BESCOM", amount: 2140, needs: [], confidence: "high" } })).toMatchObject({ mode: "govern", question: null, stillNeeded: ["due date"] });
  });

  it("never holds a grocery item back for a quantity, which is only useful", () => {
    expect(decide({ extracted: { title: "Coconut oil", quantity: null, needs: [], confidence: "high" } }).mode).toBe("auto_apply");
  });
});
