import { describe, expect, it } from "vitest";

import { readAmount, readDetailAnswer, readRecordType } from "./detail-answers";

// Monday 26 October 2026, 10:30 in Kolkata.
const CLOCK = { timezone: "Asia/Kolkata", now: new Date("2026-10-26T05:00:00Z") };

describe("reading a short answer as the detail asked — never a guess", () => {

  it("reads an amount, with or without a currency or Indian commas", () => {
    expect(readAmount("₹2,140")).toBe(2140);
    expect(readAmount("Rs 499.50")).toBe(499.5);
    expect(readAmount("1,00,000 rupees")).toBe(100000);
    expect(readAmount("about 2 or 3 thousand")).toBeNull();
    expect(readAmount("not sure")).toBeNull();
  });

  it("reads a record type from a few words", () => {
    expect(readRecordType("blood test report")).toBe("lab_result");
    expect(readRecordType("prescription")).toBe("prescription");
    expect(readRecordType("an x-ray")).toBe("imaging_report");
    expect(readRecordType("banana")).toBeNull();
  });

  it("turns each answer type into the reading's own fields", () => {
    expect(readDetailAnswer("grocery_item", "quantity", "2 litres", CLOCK)).toEqual({ quantity: 2, unit: "l" });
    expect(readDetailAnswer("bill", "amount", "₹2,140", CLOCK)).toEqual({ amount: 2140 });
    expect(readDetailAnswer("bill", "payee", "it's BESCOM", CLOCK)).toEqual({ payee: "BESCOM" });
    expect(readDetailAnswer("event", "where", "At the Kapoors'.", CLOCK)).toEqual({ location: "the Kapoors'" });
    expect(readDetailAnswer("event", "time", "8 pm", CLOCK)).toMatchObject({ dueTime: "20:00" });
    expect(readDetailAnswer("event", "date", "tomorrow", CLOCK)).toMatchObject({ dueDate: "2026-10-27" });
    expect(readDetailAnswer("school_item", "dueDate", "Friday", CLOCK)).toMatchObject({ dueDate: "2026-10-30" });
    expect(readDetailAnswer("health_document", "date", "tomorrow", CLOCK)).toEqual({ documentDate: "2026-10-27" });
    expect(readDetailAnswer("health_document", "recordType", "a prescription", CLOCK)).toEqual({ healthRecordType: "prescription" });
    expect(readDetailAnswer("activity_item", "className", "Karate", CLOCK)).toEqual({ subject: "Karate" });
  });

  it("takes a pass as a pass, and anything it can't read as nothing", () => {
    expect(readDetailAnswer("event", "time", "don't know", CLOCK)).toBe("skip");
    expect(readDetailAnswer("event", "time", "Skip", CLOCK)).toBe("skip");
    expect(readDetailAnswer("event", "date", "whenever", CLOCK)).toBeNull();
    expect(readDetailAnswer("grocery_item", "quantity", "lots", CLOCK)).toBeNull();
    expect(readDetailAnswer("bill", "amount", "", CLOCK)).toBeNull();
  });
});
