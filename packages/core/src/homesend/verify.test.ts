import { describe, expect, it } from "vitest";

import type { IntakeExtraction } from "../ai/classify-intake";
import { buildUnderstanding, checkedConfidence } from "./understanding";
import { AUTO_APPLY_FLOOR, checkReading, VERIFIED_CONFIDENCE } from "./verify";

const BLANK: IntakeExtraction = {
  readable: true, kind: "unknown", title: null, notes: null, billKind: null, payee: null, amount: null, currency: null, dueDate: null,
  schoolKind: null, subject: null, quantity: null, unit: null, category: null, healthRecordType: null, documentDate: null, dateText: null,
  merchant: null, lines: [], subjectMemberName: null, summary: null, people: [], facts: [], needs: [], change: "new", confidence: "high", secondary: null,
};

function reading(over: Partial<IntakeExtraction>): IntakeExtraction {
  return { ...BLANK, ...over };
}

const NO_INJECTION = { flagged: false, signals: [] };

describe("checking a reading against what was sent (the owner, 2026-10-25: more than 95% sure)", () => {
  it("verifies a reading whose every detail is in the message", () => {
    const bill = reading({ kind: "bill", title: "Electricity bill", payee: "BESCOM", amount: 2140, currency: "INR", dateText: "5 October", dueDate: "2026-10-05" });
    expect(checkReading(bill, "BESCOM electricity bill for September: ₹2,140 due by 5 October.")).toEqual({ verified: true, unverified: [] });
  });

  it("reads a date phrase put together from words across the message, and a time written either way", () => {
    const karate = reading({ kind: "activity_item", title: "Karate exam", dateText: "Sunday, 9.30 morning", dueDate: "2026-10-25" });
    expect(checkReading(karate, "Dear parents and students, exam time is 9.30 morning\n\nThe sender added: asmi Karate Sunday").verified).toBe(true);
    const exam = reading({ kind: "school_item", title: "SOF IGKO Examination", dateText: "Tuesday 22nd September, 2:30 p.m. – 3:30 p.m.", dueDate: "2026-09-22" });
    expect(checkReading(exam, "SOF IGKO Examination on Tuesday 22nd September. Examination Time: 2:30 p.m. – 3:30 p.m.").verified).toBe(true);
  });

  it("names each detail the message does not say", () => {
    const bill = reading({ kind: "bill", title: "Water bill", payee: "BWSSB", amount: 999, dateText: "10 October", dueDate: "2026-10-10" });
    expect(checkReading(bill, "BESCOM electricity bill: ₹2,140 due by 5 October.").unverified).toEqual(["the name", "the amount", "who it's paid to", "the date"]);
  });

  it("finds an amount however the message writes it, and a day the model gave without its words", () => {
    const bill = reading({ kind: "bill", title: "Rent", amount: 25000, dueDate: "2026-10-05" });
    expect(checkReading(bill, "Rent of Rs 25,000.00 is due on 05/10.").verified).toBe(true);
    expect(checkReading(reading({ kind: "bill", title: "Rent", amount: 25000, dueDate: "2026-10-05" }), "Rent of Rs 25,000 is due on the 5th of October.").verified).toBe(true);
    expect(checkReading(reading({ kind: "bill", title: "Rent", amount: 25000, dueDate: "2026-10-06" }), "Rent of Rs 25,000 is due on the 5th of October.").unverified).toEqual(["the date"]);
  });

  it("asks for what each kind needs before it can be an entry", () => {
    expect(checkReading(reading({ kind: "bill", title: "Electricity bill" }), "Electricity bill").unverified).toEqual(["the amount or due date"]);
    expect(checkReading(reading({ kind: "event", title: "Diwali dinner" }), "Diwali dinner").unverified).toEqual(["the date"]);
    expect(checkReading(reading({ kind: "receipt", title: "Groceries" }), "Groceries").unverified).toEqual(["the shop", "what was bought"]);
    expect(checkReading(reading({ kind: "health_document", title: "Blood report" }), "Blood report").unverified).toEqual(["what kind of record it is"]);
    expect(checkReading(reading({ kind: "unknown", title: "Something" }), "Something").unverified).toEqual(["what it is"]);
    expect(checkReading(reading({ kind: "grocery_item", title: "Paneer" }), "We need paneer").verified).toBe(true);
  });

  it("never verifies a photo or a file, which has no text to check against", () => {
    expect(checkReading(reading({ kind: "grocery_item", title: "Paneer" }), null)).toEqual({ verified: false, unverified: ["the original, which can't be checked word by word"] });
  });
});

describe("the confidence a checked reading earns", () => {
  const paneer = reading({ kind: "grocery_item", title: "Paneer" });

  it("is above the bar only for a model's high reading that was verified, and never above a voice note's transcript", () => {
    expect(checkedConfidence(paneer, { verified: true, unverified: [] })).toBe(VERIFIED_CONFIDENCE);
    expect(VERIFIED_CONFIDENCE).toBeGreaterThan(AUTO_APPLY_FLOOR);
    expect(checkedConfidence(paneer, { verified: false, unverified: ["the name"] })).toBe(0.9);
    expect(checkedConfidence({ ...paneer, confidence: "medium" }, { verified: true, unverified: [] })).toBe(0.7);
    expect(checkedConfidence(paneer, { verified: true, unverified: [] }, 0.93)).toBe(0.93);
  });

  it("is what the understanding carries, with what could not be checked", () => {
    const sent = buildUnderstanding(paneer, { channel: "pasted_text", sourceText: "We need paneer", injection: NO_INJECTION });
    expect(sent).toMatchObject({ confidence: "high", score: VERIFIED_CONFIDENCE, check: { verified: true, unverified: [] } });
    const photo = buildUnderstanding(paneer, { channel: "manual_upload", sourceText: null, injection: NO_INJECTION });
    expect(photo).toMatchObject({ confidence: "high", score: 0.9, check: { verified: false } });
  });
});
