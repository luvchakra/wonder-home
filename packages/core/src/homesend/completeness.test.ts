import { describe, expect, it } from "vitest";

import {
  COMPLETENESS,
  MAX_DETAIL_QUESTIONS,
  fillFromEvidence,
  listDetails,
  missingDetails,
  missingRequired,
  nextDetailToAsk,
  readQuantity,
} from "./completeness";
import { readAmount, readDetailAnswer, readRecordType } from "./completeness-answers";

const fields = (specs: readonly { field: string }[]) => specs.map((spec) => spec.field);
// Monday 26 October 2026, 10:30 in Kolkata.
const CLOCK = { timezone: "Asia/Kolkata", now: new Date("2026-10-26T05:00:00Z") };

describe("what makes each HomeSend entry complete (the owner, 2026-10-26)", () => {
  it("has one spec per kind, required details first, each with one short question", () => {
    for (const specs of Object.values(COMPLETENESS)) {
      const needs = specs.map((spec) => spec.need);
      expect(needs.indexOf("useful") === -1 || needs.lastIndexOf("required") < needs.indexOf("useful")).toBe(true);
      for (const spec of specs) expect(spec.question).toMatch(/\?$|\?\s|e\.g\.|example/);
    }
  });

  it("grocery: a name is required, a quantity is only useful", () => {
    expect(fields(missingDetails("grocery_item", { title: "Coconut oil" }))).toEqual(["quantity"]);
    expect(missingRequired("grocery_item", { title: "Coconut oil" })).toEqual([]);
    expect(fields(missingRequired("grocery_item", { title: "" }))).toEqual(["name"]);
    expect(missingDetails("grocery_item", { title: "Coconut oil", quantity: 2, unit: "l" })).toEqual([]);
  });

  it("school work: the child, the title and the due date are all required", () => {
    expect(fields(missingDetails("school_item", { title: "Science worksheet" }))).toEqual(["child", "dueDate"]);
    expect(fields(missingDetails("school_item", { title: "Science worksheet", subjectMemberName: "Asmi", dueDate: "2026-11-02" }))).toEqual([]);
    // The caller knows who it is for even when the reading named nobody.
    expect(fields(missingDetails("school_item", { title: "Worksheet", dueDate: "2026-11-02" }, { person: true }))).toEqual([]);
  });

  it("a class outside school: the child and the class are required, the day is useful", () => {
    expect(fields(missingDetails("activity_item", { title: "Grading", people: ["Asmi"] }))).toEqual(["className", "date"]);
    expect(fields(missingDetails("activity_item", { title: "Grading", people: ["Asmi"], subject: "Karate", dueDate: "2026-11-01" }))).toEqual([]);
  });

  it("an event: the title and the day are required, the time and where are useful", () => {
    expect(fields(missingDetails("event", { title: "Diwali dinner" }))).toEqual(["date", "time", "where"]);
    expect(fields(missingDetails("event", { title: "Diwali dinner", dueDate: "2026-11-07", dueTime: "20:00", location: "The Kapoors'" }))).toEqual([]);
  });

  it("a bill: who it's from, the amount and the due date are required", () => {
    expect(fields(missingRequired("bill", { title: "Electricity" }))).toEqual(["payee", "amount", "dueDate"]);
    expect(fields(missingRequired("bill", { title: "Electricity", payee: "BESCOM", amount: 0, dueDate: "2026-11-05" }))).toEqual(["amount"]);
  });

  it("a health document: whose and what kind are required, the date is useful", () => {
    expect(fields(missingDetails("health_document", { title: "Report" }))).toEqual(["person", "recordType", "date"]);
    expect(fields(missingDetails("health_document", { title: "Report", subjectMemberName: "Kunal", healthRecordType: "lab_result", documentDate: "2026-10-20" }))).toEqual([]);
  });

  it("a receipt: the shop and the date are required", () => {
    expect(fields(missingRequired("receipt", { title: "Groceries" }))).toEqual(["merchant", "date"]);
    expect(missingRequired("receipt", { title: "Groceries", merchant: "More", documentDate: "2026-10-25" })).toEqual([]);
  });

  it("an unknown reading has no spec — what it is, is asked first", () => {
    expect(missingDetails("unknown", { title: "x" })).toEqual([]);
    expect(missingDetails(null, null)).toEqual([]);
  });

  it("lists what is still needed in a sentence", () => {
    expect(listDetails(missingRequired("bill", { title: "x" }))).toBe("who it's from, amount and due date");
    expect(listDetails([])).toBe("");
  });
});

describe("asking on WhatsApp, one question at a time", () => {
  it("asks the first missing detail not yet asked, never who it is for, and stops after three", () => {
    expect(nextDetailToAsk("event", { title: "Dinner" }, [])?.field).toBe("date");
    expect(nextDetailToAsk("event", { title: "Dinner" }, ["date"])?.field).toBe("time");
    expect(nextDetailToAsk("school_item", { title: "Worksheet" }, [])?.field).toBe("dueDate");
    expect(nextDetailToAsk("event", { title: "Dinner" }, ["date", "time", "where"])).toBeNull();
    expect(nextDetailToAsk("bill", { title: "x" }, ["payee", "amount", "dueDate"].slice(0, MAX_DETAIL_QUESTIONS) as never)).toBeNull();
    expect(nextDetailToAsk("grocery_item", { title: "Milk", quantity: 1 }, [])).toBeNull();
  });
});

describe("reading a short answer as the detail asked — never a guess", () => {
  it("reads a quantity and its unit", () => {
    expect(readQuantity("2 litres")).toEqual({ quantity: 2, unit: "l" });
    expect(readQuantity("1.5kg")).toEqual({ quantity: 1.5, unit: "kg" });
    expect(readQuantity("a dozen")).toEqual({ quantity: 1, unit: "dozen" });
    expect(readQuantity("3")).toEqual({ quantity: 3, unit: null });
    expect(readQuantity("two packets")).toEqual({ quantity: 2, unit: "packet" });
    expect(readQuantity("2 kg or 3 kg")).toBeNull();
    expect(readQuantity("lots")).toBeNull();
  });

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

describe("the reading's own evidence comes first", () => {
  it("takes the one quantity the text sent says when the reading lost it", () => {
    expect(fillFromEvidence("grocery_item", { title: "Coconut oil", quantity: null, unit: null }, "Add 2 litres of oil")).toMatchObject({ quantity: 2, unit: "l" });
  });

  it("never guesses between two amounts, or from a number with no unit", () => {
    expect(fillFromEvidence("grocery_item", { title: "Oil", quantity: null }, "2 litres of oil and 1 kg rice").quantity).toBeNull();
    expect(fillFromEvidence("grocery_item", { title: "Eggs", quantity: null }, "Eggs for 4 people").quantity).toBeNull();
    expect(fillFromEvidence("event", { title: "Dinner" }, "2 litres")).toEqual({ title: "Dinner" });
  });

  it("keeps a quantity the reading already has", () => {
    expect(fillFromEvidence("grocery_item", { title: "Oil", quantity: 1, unit: "l" }, "Add 2 litres of oil")).toMatchObject({ quantity: 1 });
  });
});
