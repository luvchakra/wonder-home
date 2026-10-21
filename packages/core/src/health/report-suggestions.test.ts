import { describe, expect, it } from "vitest";

import type { ReportFinding } from "./report-reading";
import { addMonths, homeMeasureOf, suggestFromReport } from "./report-suggestions";

const TODAY = "2026-10-21";
const MEMBER = "member-1";

function finding(overrides: Partial<ReportFinding>): ReportFinding {
  return {
    key: "f1",
    name: "LDL Cholesterol",
    value: "162",
    numericValue: 162,
    secondaryValue: null,
    unit: "mg/dL",
    referenceRange: "<100",
    flag: "high",
    outside: "high",
    outsideBasis: "flag",
    quote: "LDL Cholesterol 162 H mg/dL <100",
    page: 1,
    checkedAgainst: "text",
    ...overrides,
  };
}

describe("suggestFromReport — golden cases", () => {
  it("a flagged high LDL suggests a follow-up and a recheck, citing the finding, and no home tracking", () => {
    const suggestions = suggestFromReport({ findings: [finding({})], memberId: MEMBER, reportDate: "2026-10-12", today: TODAY });
    expect(suggestions.map((s) => s.kind)).toEqual(["follow_up", "recheck"]);
    expect(suggestions[0]).toEqual({ kind: "follow_up", findingKeys: ["f1"], memberId: MEMBER });
    expect(suggestions[1]).toEqual({
      kind: "recheck",
      findingKeys: ["f1"],
      memberId: MEMBER,
      options: [
        { months: 3, dueOn: "2027-01-12" },
        { months: 6, dueOn: "2027-04-12" },
      ],
    });
  });

  it("a flagged blood pressure also suggests tracking it at home weekly, from today", () => {
    const bp = finding({ key: "f2", name: "Blood Pressure", value: "150/95", numericValue: 150, secondaryValue: 95, unit: "mmHg", referenceRange: "<120/80" });
    const suggestions = suggestFromReport({ findings: [bp], memberId: MEMBER, reportDate: null, today: TODAY });
    expect(suggestions).toEqual([
      { kind: "follow_up", findingKeys: ["f2"], memberId: MEMBER },
      { kind: "track", findingKeys: ["f2"], memberId: MEMBER, measure: "blood_pressure", cadenceDays: 7, startsOn: TODAY },
    ]);
  });

  it("nothing flagged is one calm line and no actions", () => {
    const suggestions = suggestFromReport({ findings: [finding({ flag: "normal", outside: null, outsideBasis: null })], memberId: MEMBER, reportDate: "2026-10-12", today: TODAY });
    expect(suggestions).toEqual([{ kind: "nothing_flagged", findingKeys: [] }]);
  });

  it("nothing read suggests nothing at all", () => {
    expect(suggestFromReport({ findings: [], memberId: MEMBER, reportDate: "2026-10-12", today: TODAY })).toEqual([]);
  });

  it("an old report is rechecked from today, never on a day already gone", () => {
    const suggestions = suggestFromReport({ findings: [finding({})], memberId: MEMBER, reportDate: "2024-01-31", today: TODAY });
    const recheck = suggestions.find((s) => s.kind === "recheck");
    expect(recheck && recheck.kind === "recheck" ? recheck.options : []).toEqual([
      { months: 3, dueOn: "2027-01-21" },
      { months: 6, dueOn: "2027-04-21" },
    ]);
  });

  it("one tracking suggestion per measurement, carrying every finding it came from", () => {
    const findings = [
      finding({ key: "f1", name: "Systolic", value: "150", referenceRange: "<120" }),
      finding({ key: "f2", name: "Diastolic", value: "95", referenceRange: "<80" }),
      finding({ key: "f3", name: "Fasting Blood Glucose", value: "126", referenceRange: "70-100" }),
      finding({ key: "f4", name: "Urine Glucose", value: "Trace", numericValue: null, outside: "outside" }),
    ];
    const track = suggestFromReport({ findings, memberId: MEMBER, reportDate: null, today: TODAY }).filter((s) => s.kind === "track");
    expect(track).toEqual([
      { kind: "track", findingKeys: ["f1", "f2"], memberId: MEMBER, measure: "blood_pressure", cadenceDays: 7, startsOn: TODAY },
      { kind: "track", findingKeys: ["f3"], memberId: MEMBER, measure: "blood_sugar", cadenceDays: 7, startsOn: TODAY },
    ]);
  });
});

describe("helpers", () => {
  it("knows what can be measured at home", () => {
    expect(homeMeasureOf("Blood Pressure")).toBe("blood_pressure");
    expect(homeMeasureOf("Body weight")).toBe("weight");
    expect(homeMeasureOf("Pulse rate")).toBe("pulse");
    expect(homeMeasureOf("Heart Rate")).toBe("pulse");
    expect(homeMeasureOf("Glucose, Fasting")).toBe("blood_sugar");
    expect(homeMeasureOf("HbA1c")).toBeNull();
    expect(homeMeasureOf("Urine glucose")).toBeNull();
    expect(homeMeasureOf("LDL Cholesterol")).toBeNull();
  });

  it("adds months without spilling into the next one", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-10-12", 3)).toBe("2027-01-12");
    expect(addMonths("2024-08-31", 6)).toBe("2025-02-28");
  });
});
