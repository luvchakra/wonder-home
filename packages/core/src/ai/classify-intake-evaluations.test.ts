import { describe, expect, it } from "vitest";

import { CLASSIFY_INTAKE_SCENARIOS, evaluateAllClassifyIntake } from "./classify-intake-evaluations";

describe("HomeSend classify-intake golden scenario evaluations", () => {
  it("sanitizes every scenario the way the product says it should", () => {
    const failures = evaluateAllClassifyIntake()
      .filter((result) => !result.passed)
      .map((result) => `${result.scenario.id}: ${JSON.stringify(result.actual)}`);

    expect(failures).toEqual([]);
  });

  it("strips a hallucinated field the claimed kind does not own", () => {
    const result = evaluateAllClassifyIntake(CLASSIFY_INTAKE_SCENARIOS.filter((s) => s.id === "CI-02"))[0];
    expect(result?.actual.billKind).toBeNull();
    expect(result?.actual.amount).toBeNull();
  });

  it("never lets a secondary proposal survive on grocery_item or unknown", () => {
    const results = evaluateAllClassifyIntake(
      CLASSIFY_INTAKE_SCENARIOS.filter((s) => s.raw.kind === "grocery_item" || s.raw.kind === "unknown"),
    );
    expect(results.every((result) => result.actual.secondary === null)).toBe(true);
  });

  it("keeps a legitimate secondary proposal on a school_item", () => {
    const result = evaluateAllClassifyIntake(CLASSIFY_INTAKE_SCENARIOS.filter((s) => s.id === "CI-06"))[0];
    expect(result?.actual.secondary).toEqual({ reason: "Sports day asks for a white T-shirt.", title: "White T-shirt" });
  });

  it("collapses unreadable content to a bare unknown, whatever else the model claimed", () => {
    const result = evaluateAllClassifyIntake(CLASSIFY_INTAKE_SCENARIOS.filter((s) => s.id === "CI-07"))[0];
    expect(result?.actual).toEqual({
      readable: false,
      kind: "unknown",
      title: null,
      notes: null,
      billKind: null,
      payee: null,
      amount: null,
      currency: null,
      dueDate: null,
      schoolKind: null,
      subject: null,
      quantity: null,
      unit: null,
      category: null,
      healthRecordType: null,
      documentDate: null,
      dateText: null,
      merchant: null,
      lines: [],
      subjectMemberName: null,
      summary: null,
      people: [],
      facts: [],
      needs: [],
      change: "new",
      confidence: "low",
      secondary: null,
      dueTime: null,
      endTime: null,
      issuedOn: null,
      pages: { total: null, unreadable: [] },
      records: [],
    });
  });

  it("leaves a clean extraction with no hallucinated fields unchanged", () => {
    const result = evaluateAllClassifyIntake(CLASSIFY_INTAKE_SCENARIOS.filter((s) => s.id === "CI-08"))[0];
    expect(result?.actual).toEqual(result?.scenario.raw);
  });

  it("uses unique ids", () => {
    const ids = CLASSIFY_INTAKE_SCENARIOS.map((scenario) => scenario.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
