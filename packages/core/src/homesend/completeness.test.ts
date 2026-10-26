import { describe, expect, it } from "vitest";

import {
  COMPLETENESS,
  MAX_DETAIL_QUESTIONS,
  fillFromEvidence,
  listDetails,
  missingDetails,
  missingRequired,
  nextMissingDetail,
  readQuantity,
} from "./completeness";

const fields = (specs: readonly { field: string }[]) => specs.map((spec) => spec.field);

describe("what makes each HomeSend entry complete (the owner, 2026-10-26)", () => {
  it("has one spec per kind, required details first, each named, never worded as a question", () => {
    for (const specs of Object.values(COMPLETENESS)) {
      const needs = specs.map((spec) => spec.need);
      expect(needs.indexOf("useful") === -1 || needs.lastIndexOf("required") < needs.indexOf("useful")).toBe(true);
      for (const spec of specs) expect(spec).not.toHaveProperty("question");
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

describe("what HomeTalk asks about next", () => {
  it("is the first missing detail not yet asked, and nothing after three", () => {
    expect(nextMissingDetail("event", { title: "Dinner" }, [])?.field).toBe("date");
    expect(nextMissingDetail("event", { title: "Dinner" }, ["date"])?.field).toBe("time");
    expect(nextMissingDetail("school_item", { title: "Worksheet" }, [])?.field).toBe("child");
    expect(nextMissingDetail("school_item", { title: "Worksheet" }, [], { person: true })?.field).toBe("dueDate");
    expect(nextMissingDetail("event", { title: "Dinner" }, ["date", "time", "where"])).toBeNull();
    expect(nextMissingDetail("bill", { title: "x" }, ["payee", "amount", "dueDate"].slice(0, MAX_DETAIL_QUESTIONS) as never)).toBeNull();
    expect(nextMissingDetail("grocery_item", { title: "Milk", quantity: 1 }, [])).toBeNull();
  });
});

describe("reading a quantity", () => {
  it("reads a quantity and its unit", () => {
    expect(readQuantity("2 litres")).toEqual({ quantity: 2, unit: "l" });
    expect(readQuantity("1.5kg")).toEqual({ quantity: 1.5, unit: "kg" });
    expect(readQuantity("a dozen")).toEqual({ quantity: 1, unit: "dozen" });
    expect(readQuantity("3")).toEqual({ quantity: 3, unit: null });
    expect(readQuantity("two packets")).toEqual({ quantity: 2, unit: "packet" });
    expect(readQuantity("2 kg or 3 kg")).toBeNull();
    expect(readQuantity("lots")).toBeNull();
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
