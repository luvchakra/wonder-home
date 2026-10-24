import { describe, expect, it } from "vitest";

import { numberedNotes, sanitizeIntakeExtraction, type IntakeExtraction } from "./classify-intake";
import { looksLikeServiceOrGathering, reviewIntakeKind, suggestedIntakeKind } from "./intake-kind-check";

function reading(over: Partial<IntakeExtraction>): IntakeExtraction {
  return {
    readable: true, kind: "unknown", title: null, notes: null, billKind: null, payee: null, amount: null, currency: null,
    dueDate: null, schoolKind: null, subject: null, quantity: null, unit: null, category: null, healthRecordType: null,
    documentDate: null, dateText: null, merchant: null, lines: [], subjectMemberName: null, summary: null, people: [],
    facts: [], needs: [], change: "new", confidence: "medium", secondary: null, records: [],
    ...over,
  } as IntakeExtraction;
}

describe("reviewIntakeKind", () => {
  it("moves a blood-test camp read as a grocery to an event, at low confidence", () => {
    const checked = reviewIntakeKind(reading({ kind: "grocery_item", title: "Blood Test Camp at Splendora CHS", quantity: 1, category: "grocery" }));
    expect(checked).toMatchObject({ kind: "event", confidence: "low", quantity: null, category: null });
  });

  it("reads the summary and notes too", () => {
    expect(reviewIntakeKind(reading({ kind: "grocery_item", title: "LiveWell Essential", summary: "A full body check-up package from Torrent Diagnostics" })).kind).toBe("event");
    expect(reviewIntakeKind(reading({ kind: "grocery_item", title: "Society notice", notes: "1. Vaccination drive in the clubhouse" })).kind).toBe("event");
  });

  it("leaves a real grocery alone", () => {
    for (const title of ["Amul Toned Milk 1L", "Basmati rice 5 kg", "Glucose biscuits", "Party poppers", "Test tube brush"]) {
      expect(reviewIntakeKind(reading({ kind: "grocery_item", title })).kind, title).toBe("grocery_item");
    }
  });

  it("never second-guesses any other kind", () => {
    expect(reviewIntakeKind(reading({ kind: "health_document", title: "Blood test report" })).kind).toBe("health_document");
    expect(reviewIntakeKind(reading({ kind: "bill", title: "Diagnostics invoice" })).kind).toBe("bill");
  });

  it("runs inside the backstop every provider's reading goes through", () => {
    const clean = sanitizeIntakeExtraction(reading({ kind: "grocery_item", title: "Eye screening camp", quantity: 2, unit: "pcs", dateText: "Sunday" }));
    expect(clean).toMatchObject({ kind: "event", quantity: null, unit: null, dateText: "Sunday" });
  });
});

describe("suggestedIntakeKind", () => {
  it("never suggests a category nothing suggested", () => {
    expect(suggestedIntakeKind("unknown", { title: "Payment received" })).toBeNull();
    expect(suggestedIntakeKind(null, null)).toBeNull();
  });

  it("suggests an event for an unknown reading that names a camp or a test", () => {
    expect(suggestedIntakeKind("unknown", { title: "Blood Test Camp at Splendora CHS" })).toBe("event");
  });

  it("re-reads an item stored as a grocery before this check", () => {
    expect(suggestedIntakeKind("grocery_item", { title: "Blood Test Camp at Splendora CHS" })).toBe("event");
    expect(suggestedIntakeKind("grocery_item", { title: "Milk" })).toBe("grocery_item");
    expect(suggestedIntakeKind("school_item", { title: "Sports day camp" })).toBe("school_item");
  });
});

describe("looksLikeServiceOrGathering", () => {
  it("names services and gatherings, not products", () => {
    expect(looksLikeServiceOrGathering("HbA1c and thyroid test camp")).toBe(true);
    expect(looksLikeServiceOrGathering("Society AGM meeting")).toBe(true);
    expect(looksLikeServiceOrGathering("Sugar 1 kg")).toBe(false);
  });
});

describe("numberedNotes", () => {
  it("numbers bullet points, whatever marked them", () => {
    expect(numberedNotes("- Wear white\n• Bring water\n* Report by 9")).toBe("1. Wear white\n2. Bring water\n3. Report by 9");
  });

  it("renumbers numbered points and drops blank lines", () => {
    expect(numberedNotes("2) First\n\n5. Second")).toBe("1. First\n2. Second");
  });

  it("numbers several plain lines, keeps one plain line as written", () => {
    expect(numberedNotes("At Fun City\nBring a gift")).toBe("1. At Fun City\n2. Bring a gift");
    expect(numberedNotes("At Fun City, Koramangala")).toBe("At Fun City, Koramangala");
    expect(numberedNotes(null)).toBeNull();
  });
});
