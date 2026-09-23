import { describe, expect, it } from "vitest";

import { groundIntakeDate, INTAKE_SYSTEM_PROMPT, sanitizeIntakeExtraction, type IntakeExtraction } from "./classify-intake";
import { decideConfirmation } from "../homesend/confirmation";
import { detectInstructionInjection } from "../homesend/injection";
import { buildUnderstanding } from "../homesend/understanding";
import { BLANK_READING } from "../evaluation/runners";

/** Story 09-009: a paid receipt is purchase history — read as one, never as a bill. */

const reading = (over: Partial<IntakeExtraction>): IntakeExtraction => ({ ...BLANK_READING, ...over });
const lines = [
  { name: "Amul Toned Milk 1L", quantity: 2, unit: null, lineTotal: 56 },
  { name: "Eggs (12)", quantity: 1, unit: null, lineTotal: 84 },
];

describe("a receipt reading", () => {
  it("keeps what a receipt owns: shop, total, day and lines", () => {
    const clean = sanitizeIntakeExtraction(
      reading({ kind: "receipt", title: "FreshMart receipt", merchant: "FreshMart", amount: 140, currency: "INR", documentDate: "2026-09-22", lines }),
    );
    expect(clean).toMatchObject({ kind: "receipt", merchant: "FreshMart", amount: 140, currency: "INR", documentDate: "2026-09-22" });
    expect(clean.lines).toHaveLength(2);
  });

  it("drops what only a bill owns, whatever the model set: a receipt is never something to pay", () => {
    const clean = sanitizeIntakeExtraction(reading({ kind: "receipt", title: "FreshMart receipt", billKind: "utility", payee: "FreshMart", dueDate: "2026-09-30", lines }));
    expect(clean).toMatchObject({ billKind: null, payee: null, dueDate: null });
  });

  it("never lets another kind carry receipt lines or a shop", () => {
    const clean = sanitizeIntakeExtraction(reading({ kind: "bill", title: "Water", amount: 640, merchant: "FreshMart", lines }));
    expect(clean.merchant).toBeNull();
    expect(clean.lines).toEqual([]);
  });

  it("a line that carries an id is dropped, like any id a model sends", () => {
    const clean = sanitizeIntakeExtraction(reading({ kind: "receipt", title: "Receipt", lines: [{ name: "3f2b8c1e-1234-4abc-9def-0123456789ab", quantity: 1, unit: null, lineTotal: 1 }, ...lines] }));
    expect(clean.lines.map((line) => line.name)).toEqual(["Amul Toned Milk 1L", "Eggs (12)"]);
  });

  it("the day of the purchase is grounded like any other document date", () => {
    const grounded = groundIntakeDate(reading({ kind: "receipt", title: "Receipt", dateText: "yesterday", lines }), { now: new Date("2026-09-23T06:00:00Z"), timezone: "Asia/Kolkata" });
    expect(grounded.documentDate).toBe("2026-09-22");
    expect(grounded.dueTime).toBeNull();
  });

  it("proposes recording purchases, names each line, and always waits for a person", () => {
    const extraction = sanitizeIntakeExtraction(reading({ kind: "receipt", title: "FreshMart receipt", merchant: "FreshMart", confidence: "high", lines }));
    const understanding = buildUnderstanding(extraction, { channel: "pasted_text", injection: detectInstructionInjection("FreshMart receipt: milk, eggs") });
    expect(understanding.candidateActions[0]?.type).toBe("record_purchases");
    expect(understanding.entities.filter((entity) => entity.type === "item").map((entity) => entity.extractedValue)).toEqual(["Amul Toned Milk 1L", "Eggs (12)"]);
    const decision = decideConfirmation({ kind: "receipt", extracted: { title: extraction.title, needs: [], confidence: "high" }, understanding, reconciliation: null, subject: null, memberInitiated: true, autonomy: "execute" });
    expect(decision.mode).toBe("govern");
  });

  it("the prompt tells the model a paid receipt is a receipt, not a bill and not unknown", () => {
    expect(INTAKE_SYSTEM_PROMPT).toMatch(/receipt: proof of a purchase already paid for/);
    expect(INTAKE_SYSTEM_PROMPT).toMatch(/is never a bill/);
    expect(INTAKE_SYSTEM_PROMPT).not.toMatch(/unknown: anything else — including a receipt/);
  });
});
