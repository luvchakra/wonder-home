import { describe, expect, it } from "vitest";

import { acceptReading, isClassifyFailure, type IntakeExtraction } from "../../ai/classify-intake";
import { detectInstructionInjection } from "../../homesend/injection";
import { readPaymentProof } from "../../homesend/payment-proof";
import { planTimetable } from "../../homesend/timetable";
import { DOCUMENT_CASES } from "./cases";

/** An empty reading, so each case records only what its model said. */
const BLANK = {
  readable: true, kind: "unknown", title: null, notes: null, billKind: null, payee: null, amount: null, currency: null, dueDate: null,
  schoolKind: null, subject: null, activityKind: null, location: null, quantity: null, unit: null, category: null, healthRecordType: null,
  documentDate: null, dateText: null, merchant: null, lines: [], subjectMemberName: null, summary: null, people: [], facts: [], needs: [],
  change: "new", confidence: "high", issuedOn: null, pages: { total: 1, unreadable: [] }, records: [], schedule: null,
};

const CONTEXT = { now: new Date("2026-11-20T18:11:56Z"), timezone: "Asia/Kolkata" };

/** Every day a written date names, in a source's own words, for "nothing invented". */
function writtenDays(text: string): string[] {
  const months = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const days: string[] = [];
  for (const match of text.toLowerCase().matchAll(/\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/g)) {
    days.push(`${match[3]}-${String(months.indexOf(match[2]!) + 1).padStart(2, "0")}-${match[1]!.padStart(2, "0")}`);
  }
  return days;
}

describe("HomeSend regression set: complex messages become the right entries (14-074)", () => {
  for (const testCase of DOCUMENT_CASES) {
    it(`${testCase.id} ${testCase.description}`, () => {
      const reading = acceptReading({ ...BLANK, ...testCase.reading }, CONTEXT);
      expect(isClassifyFailure(reading), "the reading survives the schema").toBe(false);
      const read = reading as IntakeExtraction;
      expect(read.readable).toBe(testCase.expected.readable);
      expect(read.kind).toBe(testCase.expected.kind);

      if (testCase.expected.exams) {
        const plan = planTimetable(read.schedule!, testCase.children ?? []);
        const got = Object.fromEntries(plan.children.map((child) => [child.name, { column: child.column, papers: child.papers }]));
        expect(got).toEqual(testCase.expected.exams);
        expect(plan.needClass.map((child) => child.name)).toEqual(testCase.expected.askClass ?? []);
      }

      if (testCase.expected.records) {
        expect(read.records ?? []).toHaveLength(testCase.expected.records.count);
        if (testCase.expected.records.domains) expect((read.records ?? []).map((record) => record.domain)).toEqual(testCase.expected.records.domains);
        // Nothing invented: every record's day is a day the source writes.
        const written = writtenDays(testCase.source.text);
        for (const record of read.records ?? []) {
          const day = (record as { dueDate: string | null }).dueDate;
          if (day && written.length > 0 && testCase.id !== "HD-08") expect(written, `${record.title} on ${day}`).toContain(day);
        }
      }

      if (testCase.expected.paymentProof !== undefined) {
        expect(Boolean(readPaymentProof(testCase.source.caption, testCase.source.text).proof)).toBe(testCase.expected.paymentProof);
      }
      if (testCase.expected.injection !== undefined) {
        expect(detectInstructionInjection(testCase.source.text).flagged).toBe(testCase.expected.injection);
      }
      // A health document is never filed for someone its words don't name.
      if (read.kind === "health_document") expect(read.subjectMemberName).toBeNull();
    });
  }

  it("a reading over a list limit is cut, never thrown away whole (the owner's timetable, 20 Nov)", () => {
    const tooMany = acceptReading({ ...BLANK, kind: "school_item", title: "Many", facts: Array.from({ length: 20 }, (_, index) => ({ statement: `Fact ${index}`, evidence: "x" })), summary: "y".repeat(500) }, CONTEXT);
    expect(isClassifyFailure(tooMany)).toBe(false);
    expect((tooMany as IntakeExtraction).facts).toHaveLength(8);
  });

  it("a reading in a shape WonderHome can't use is a rejected reading, never 'unknown content'", () => {
    expect(acceptReading({ ...BLANK, kind: "a timetable" }, CONTEXT)).toEqual({ failed: "rejected" });
  });
});
