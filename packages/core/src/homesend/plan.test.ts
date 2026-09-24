import { describe, expect, it } from "vitest";

import { sanitizeIntakeExtraction, groundIntakeDate, type IntakeExtraction, type RawDocumentRecord } from "../ai/classify-intake";
import type { Consumable } from "../commerce/consumables";
import { buildContextItems } from "../context/builders";
import { applyFreshness } from "../context/freshness";
import type { Obligation } from "../finance/payments";
import type { HouseholdMember } from "../identity/households";
import type { SchoolItem } from "../school/items";
import { documentReading, documentRecords, pageReport, pagesReadLine, type DocumentReading, type DocumentRecord } from "./document";
import { applyLabel, buildDocumentPlan, planSummary, type PlanContext } from "./plan";

/**
 * Deep Document Understanding 2.0 — the change plan, held to the spec's own
 * golden scenarios (§46–48) as permanent regression tests, plus the reading
 * rules they rest on.
 */

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-09-24T06:00:00Z");

function member(id: string, displayName: string, memberType: HouseholdMember["memberType"]): HouseholdMember {
  return {
    id, displayName, memberType, status: "active", roles: [], isOwner: false, dateOfBirth: null, nickname: null, relationship: null,
    occupation: null, schoolOrWorkLocation: null, specialOccasionLabel: null, specialOccasionDate: null, gender: null, notes: null, avatarUrl: null,
  };
}

const PARENT = member("kunal", "Kunal Mehta", "adult");
const ASMI = member("asmi", "Asmi", "child");
const MANAN = member("manan", "Manan", "child");

function people(members: HouseholdMember[]) {
  return applyFreshness(buildContextItems({ members }, { householdId: "hh", householdName: "Mehta Home", timezone: TZ, now: NOW, viewerMemberId: "kunal" }), NOW).filter(
    (item) => item.entityType === "member",
  );
}

function schoolItem(id: string, childMemberId: string, title: string, day: string, extra: Partial<SchoolItem> = {}): SchoolItem {
  return {
    id, childMemberId, kind: "event", title, subject: null, detail: null, dueAt: new Date(`${day}T00:00:00+05:30`), dueTimeKnown: false, endsAt: null,
    estimatedMinutes: null, estimateSource: null, status: "pending", completedAt: null, provider: null, externalId: null, ...extra,
  };
}

function bill(id: string, name: string, extra: Partial<Obligation> = {}): Obligation {
  return { id, name, kind: "school_fee", payee: "ABC International School", amountMinor: 50000, currency: "INR", dueOn: "2026-10-05", responsibleMemberId: "kunal", status: "received", requiresReview: false, ...extra };
}

function consumable(id: string, name: string): Consumable {
  return { id, name, category: "clothing", petId: null, unit: "pair", typicalQuantity: 1, daysPerUnit: null, evidenceBasis: null, lastPurchasedOn: null, lastPurchasedQuantity: null };
}

function record(key: string, fields: Partial<DocumentRecord> & Pick<DocumentRecord, "domain" | "title">): DocumentRecord {
  return {
    key, schoolKind: null, subject: null, person: null, date: null, time: null, endTime: null, billKind: null, payee: null, amount: null, currency: null,
    quantity: null, unit: null, location: null, notes: null, change: "new", evidence: { page: 1, section: null, quote: fields.title }, ...fields,
  };
}

function reading(records: DocumentRecord[], extra: Partial<DocumentReading> = {}): DocumentReading {
  return { pages: { total: 1, read: 1, unreadable: [] }, issuedOn: null, records, ...extra };
}

function plan(doc: DocumentReading, context: PlanContext, members: HouseholdMember[] = [PARENT, ASMI, MANAN], answers?: Record<string, string>) {
  return buildDocumentPlan(doc, context, { householdId: "hh", timezone: TZ, now: NOW, viewerMemberId: "kunal", people: people(members), receivedAt: NOW.toISOString(), answers });
}

const outcome = (result: ReturnType<typeof plan>, key: string) => result.entries.find((entry) => entry.key === key)!;

describe("Golden scenario 1 — the mixed school notice (§46)", () => {
  const notice = reading([
    record("r1", { domain: "school_item", title: "Annual Day", person: "Asmi", date: "2026-10-15", evidence: { page: 1, section: "Annual Day", quote: "Annual Day — 15 October" } }),
    record("r2", { domain: "school_item", title: "Annual Day rehearsal", person: "Asmi", date: "2026-10-08" }),
    record("r3", { domain: "school_item", title: "Annual Day rehearsal", person: "Asmi", date: "2026-10-10" }),
    record("r4", { domain: "school_item", title: "Annual Day rehearsal", person: "Asmi", date: "2026-10-13" }),
    record("r5", { domain: "grocery_item", title: "White shoes" }),
    record("r6", { domain: "bill", title: "Parent contribution", amount: 500, currency: "INR", date: "2026-10-05", payee: "ABC International School", evidence: { page: 2, section: "Fees", quote: "Parent contribution ₹500 due 5 October" } }),
  ]);
  const household: PlanContext = {
    schoolItems: [schoolItem("annual", "asmi", "Annual Day", "2026-10-12"), schoolItem("reh8", "asmi", "Annual Day rehearsal", "2026-10-08")],
    consumables: [consumable("shoes", "White shoes")],
    obligations: [bill("contribution", "School contribution")],
    enrolments: [{ childMemberId: "asmi", schoolName: "ABC International School", grade: "5B" }],
  };
  const result = plan(notice, household);

  it("updates the Annual Day on file, 12 Oct → 15 Oct, and never adds a second one", () => {
    expect(outcome(result, "r1")).toMatchObject({ action: "update", group: "updates", existing: { id: "annual" }, changes: [{ field: "date", before: "12 Oct", after: "15 Oct" }], included: true });
  });

  it("the 8 Oct rehearsal already on file is no change; 10 and 13 Oct are new occurrences, not a move of it", () => {
    expect(outcome(result, "r2")).toMatchObject({ action: "no_change", existing: { id: "reh8" }, included: false });
    expect(outcome(result, "r3")).toMatchObject({ action: "create", existing: null, included: true });
    expect(outcome(result, "r4")).toMatchObject({ action: "create", existing: null, included: true });
  });

  it("white shoes and the ₹500 contribution are already on record", () => {
    expect(outcome(result, "r5")).toMatchObject({ action: "no_change", existing: { id: "shoes" } });
    expect(outcome(result, "r6")).toMatchObject({ action: "no_change", existing: { id: "contribution" } });
  });

  it("offers exactly three changes, grouped as the spec shows them", () => {
    expect(result.counts).toEqual({ updates: 1, new: 2, already_on_record: 3, conflicts: 0, needs_answer: 0 });
    expect(result.changeCount).toBe(3);
    expect(applyLabel(result)).toBe("Apply 3 changes");
    expect(planSummary(result)).toBe("I found 6 relevant items: 1 to update, 2 new, 3 already on record.");
  });

  it("every entry keeps the page and the words it was read from", () => {
    expect(outcome(result, "r6").evidence).toEqual({ page: 2, section: "Fees", quote: "Parent contribution ₹500 due 5 October" });
  });

  it("the school comes from the household's own records, and says so (§30)", () => {
    const fields = outcome(result, "r3").fields;
    expect(fields).toContainEqual({ field: "school", label: "School", value: "ABC International School", source: "household" });
    expect(fields).toContainEqual({ field: "grade", label: "Class", value: "5B", source: "household" });
    expect(fields).toContainEqual({ field: "person", label: "Child", value: "Asmi", source: "document" });
  });
});

describe("Golden scenario 2 — a newer record wins (§47)", () => {
  it("a document written before the record was last changed is a conflict, and nothing changes", () => {
    const result = plan(
      reading([record("r1", { domain: "school_item", title: "PTM", person: "Asmi", date: "2026-10-10" })], { issuedOn: "2026-09-20" }),
      { schoolItems: [schoolItem("ptm", "asmi", "PTM", "2026-10-12", { updatedAt: new Date("2026-09-23T10:00:00Z") })] },
    );
    const entry = outcome(result, "r1");
    expect(entry).toMatchObject({ action: "conflict", group: "conflicts", existing: { id: "ptm" }, included: false });
    expect(entry.reason).toMatch(/10 Oct.*changed after it was written.*12 Oct.*record stands/);
    expect(result.changeCount).toBe(0);
    expect(applyLabel(result)).toBe("Nothing to change");
  });

  it("the same document written after the record's last change is an update", () => {
    const result = plan(
      reading([record("r1", { domain: "school_item", title: "PTM", person: "Asmi", date: "2026-10-10" })], { issuedOn: "2026-09-24" }),
      { schoolItems: [schoolItem("ptm", "asmi", "PTM", "2026-10-12", { updatedAt: new Date("2026-09-23T10:00:00Z") })] },
    );
    expect(outcome(result, "r1")).toMatchObject({ action: "update", changes: [{ before: "12 Oct", after: "10 Oct" }] });
  });
});

describe("Golden scenario 3 — the ambiguous child (§48)", () => {
  const doc = reading([record("r1", { domain: "school_item", title: "Maths assessment", schoolKind: "exam", date: "2026-09-25" })]);

  it("asks who it is for, offers both children, and creates nothing until answered", () => {
    const result = plan(doc, { schoolItems: [] });
    const entry = outcome(result, "r1");
    expect(entry).toMatchObject({ action: "needs_answer", group: "needs_answer", included: false });
    expect(entry.question?.text).toBe("Who is the Maths assessment for — Asmi or Manan?");
    expect(entry.question?.options.map((option) => option.displayName)).toEqual(["Asmi", "Manan"]);
    expect(result.changeCount).toBe(0);
  });

  it("once a person answers, it is a new record for that child", () => {
    const entry = outcome(plan(doc, { schoolItems: [] }, undefined, { r1: "manan" }), "r1");
    expect(entry).toMatchObject({ action: "create", person: { displayName: "Manan" }, question: null, included: true });
  });

  it("an answer naming someone who was not offered is ignored — the question stands", () => {
    expect(outcome(plan(doc, { schoolItems: [] }, undefined, { r1: "kunal" }), "r1").action).toBe("needs_answer");
  });

  it("with one child on record, a notice that names nobody is that child's — not a guess", () => {
    expect(outcome(plan(doc, { schoolItems: [] }, [PARENT, ASMI]), "r1")).toMatchObject({ action: "create", person: { displayName: "Asmi" } });
  });
});

describe("the plan's other outcomes", () => {
  it("a document that says something is cancelled offers to cancel the record on file", () => {
    const result = plan(reading([record("r1", { domain: "school_item", title: "Science Exhibition", person: "Asmi", date: "2026-09-28", change: "cancellation" })]), {
      schoolItems: [schoolItem("sci", "asmi", "Science Exhibition", "2026-09-28")],
    });
    expect(outcome(result, "r1")).toMatchObject({ action: "cancel", group: "updates", existing: { id: "sci" }, included: true });
  });

  it("a revised amount and a moved due date are a field-level update, before and after in rupees", () => {
    const result = plan(reading([record("r1", { domain: "bill", title: "Electricity bill", payee: "City Power", amount: 2430, currency: "INR", date: "2026-10-03" })]), {
      obligations: [bill("power", "Electricity bill", { kind: "utility", payee: "City Power", amountMinor: 212000, dueOn: "2026-09-28" })],
    });
    const entry = outcome(result, "r1");
    expect(entry.action).toBe("update");
    expect(entry.changes).toEqual([
      { field: "date", label: "Due date", before: "28 Sep", after: "3 Oct" },
      { field: "amount", label: "Amount", before: "₹2,120", after: "₹2,430" },
    ]);
  });

  it("the same bill a month on is the next one, not a change to the last (§20, multiple occurrences)", () => {
    const result = plan(reading([record("r1", { domain: "bill", title: "Electricity bill", payee: "City Power", amount: 2430, currency: "INR", date: "2026-10-03" })]), {
      obligations: [bill("power", "Electricity bill", { kind: "utility", payee: "City Power", amountMinor: 212000, dueOn: "2026-09-02" })],
    });
    expect(outcome(result, "r1")).toMatchObject({ action: "create", existing: null });
  });

  it("nothing new at all is a successful plan with nothing to apply (§27)", () => {
    const result = plan(reading([record("r1", { domain: "grocery_item", title: "White shoes" })]), { consumables: [consumable("shoes", "White shoes")] });
    expect(result.changeCount).toBe(0);
    expect(applyLabel(result)).toBe("Nothing to change");
    expect(planSummary(result)).toBe("I found 1 relevant item: 1 already on record.");
  });

  it("a person's own choices decide what is applied", () => {
    const result = plan(reading([record("r1", { domain: "grocery_item", title: "Water bottle" }), record("r2", { domain: "grocery_item", title: "Cap" })]), { consumables: [] });
    expect(applyLabel(result, new Set(["r2"]))).toBe("Apply 1 change");
  });
});

// ---- reading the whole document ------------------------------------------

function raw(overrides: Partial<Parameters<typeof sanitizeIntakeExtraction>[0]> = {}): Parameters<typeof sanitizeIntakeExtraction>[0] {
  return {
    readable: true, kind: "school_item", title: "Annual Day", notes: null, billKind: null, payee: null, amount: null, currency: null, dueDate: null,
    schoolKind: "event", subject: null, quantity: null, unit: null, category: null, healthRecordType: null, documentDate: null, dateText: "15 October",
    merchant: null, lines: [], subjectMemberName: null, summary: "Annual Day notice", people: ["Asmi"], facts: [], needs: [], change: "new", confidence: "high",
    issuedOn: "2026-09-20", pages: { total: 3, unreadable: [] }, records: [], ...overrides,
  } as Parameters<typeof sanitizeIntakeExtraction>[0];
}

function rawRecord(overrides: Partial<RawDocumentRecord> = {}): RawDocumentRecord {
  return {
    domain: "school_item", title: "Annual Day rehearsal", schoolKind: "event", subject: null, person: "Asmi", dateText: "10 October", dueDate: null, billKind: null,
    payee: null, amount: null, currency: null, quantity: null, unit: null, location: "School ground", notes: null, change: "new",
    evidence: { page: 2, section: "Rehearsals", quote: "Rehearsals — 8, 10 and 13 October" }, ...overrides,
  };
}

describe("the reader's backstop for every record (§8 ids, §39)", () => {
  it("keeps what a record's domain owns and drops what it does not", () => {
    const read = sanitizeIntakeExtraction(raw({ records: [rawRecord({ amount: 500, payee: "ABC" }), rawRecord({ domain: "grocery_item", title: "White shoes", person: "Asmi", dateText: "tomorrow", quantity: 1, unit: "pair" })] }));
    expect(read.records?.[0]).toMatchObject({ domain: "school_item", amount: null, payee: null, location: "School ground" });
    expect(read.records?.[1]).toMatchObject({ domain: "grocery_item", person: null, dateText: null, quantity: 1, unit: "pair", location: null });
  });

  it("never lets a record carry a database id, and drops a record left with no name", () => {
    const id = "0b9f6c1e-2c1a-4a7e-9d51-6f0a3c2b1d4e";
    const read = sanitizeIntakeExtraction(raw({ records: [rawRecord({ title: `Rehearsal ${id}` }), rawRecord({ notes: `use ${id}`, person: id })] }));
    expect(read.records).toHaveLength(1);
    expect(read.records?.[0]).toMatchObject({ notes: null, person: null });
  });

  it("a receipt or a health document proposes no records — they keep their own flows", () => {
    expect(sanitizeIntakeExtraction(raw({ kind: "receipt", records: [rawRecord()] })).records).toEqual([]);
    expect(sanitizeIntakeExtraction(raw({ kind: "health_document", records: [rawRecord()] })).records).toEqual([]);
  });

  it("an unreadable page beyond the document's length is not reported", () => {
    expect(sanitizeIntakeExtraction(raw({ pages: { total: 3, unreadable: [2, 9, 2] } })).pages).toEqual({ total: 3, unreadable: [2] });
  });
});

describe("each record's day is WonderHome's, from the document's own words", () => {
  it("grounds every record's date phrase in the household's timezone, and a school item's time", () => {
    const grounded = groundIntakeDate(sanitizeIntakeExtraction(raw({ records: [rawRecord({ dateText: "10 October at 4pm" }), rawRecord({ domain: "bill", title: "Contribution", dateText: "5 October", amount: 500 })] })), {
      timezone: TZ,
      now: NOW,
    });
    expect(grounded.records?.[0]).toMatchObject({ dueDate: "2026-10-10", dueTime: "16:00" });
    expect(grounded.records?.[1]).toMatchObject({ dueDate: "2026-10-05", dueTime: null });
  });
});

describe("the document reading", () => {
  const extraction = (overrides: Partial<IntakeExtraction> = {}): IntakeExtraction => sanitizeIntakeExtraction(raw(overrides as never));

  it("reports the pages it read — never a page it could not", () => {
    expect(pageReport({ pages: { total: 8, unreadable: [4] } })).toEqual({ total: 8, read: 7, unreadable: [4] });
    expect(pagesReadLine(pageReport({ pages: { total: 8, unreadable: [4] } }))).toBe("7 of 8 pages read — page 4 could not be made out");
    expect(pagesReadLine(pageReport({ pages: { total: 3, unreadable: [] } }))).toBe("All 3 pages read");
    // No count from the model: the file's own bytes say how many.
    expect(pageReport({ pages: { total: null, unreadable: [] } }, 6)).toEqual({ total: 6, read: 6, unreadable: [] });
    expect(pagesReadLine(pageReport({ pages: { total: null, unreadable: [] } }))).toBeNull();
  });

  it("the same thing said twice is one record", () => {
    const records = documentRecords(extraction({ records: [rawRecord({ dueDate: "2026-10-10", dateText: null }), rawRecord({ dueDate: "2026-10-10", dateText: null }), rawRecord({ dueDate: "2026-10-13", dateText: null })] } as never));
    expect(records.map((entry) => [entry.key, entry.date])).toEqual([
      ["r1", "2026-10-10"],
      ["r2", "2026-10-13"],
    ]);
  });

  it("a reading with no records still has its headline and its needs, as records", () => {
    const records = documentRecords(extraction({ records: [], dueDate: "2026-10-15", needs: [{ title: "White shoes", reason: "Annual Day asks for white shoes" }] } as never));
    expect(records.map((entry) => [entry.domain, entry.title, entry.person])).toEqual([
      ["school_item", "Annual Day", "Asmi"],
      ["grocery_item", "White shoes", null],
    ]);
  });

  it("carries the day the document is dated, for newer-record-wins", () => {
    expect(documentReading(extraction()).issuedOn).toBe("2026-09-20");
  });
});
