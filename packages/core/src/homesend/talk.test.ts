import { describe, expect, it } from "vitest";

import { sanitizeIntakeExtraction } from "../ai/classify-intake";
import { applyDocumentPlan, type PlanWriter } from "./apply";
import { buildDocumentPlan } from "./plan";
import { answerDocumentChanges, documentReplyClasses, documentReplyText, readDocumentChangeQuestion } from "./talk";
import { buildUnderstanding } from "./understanding";

/** DDU 2.0 §31–33, §49: HomeTalk and HomeSend are one pipeline; HomeTalk speaks from what actually happened. */

const RECORDS = [
  { domain: "school_item", title: "Annual Day", schoolKind: "event", subject: null, person: "Asmi", dateText: null, dueDate: "2026-10-15", billKind: null, payee: null, amount: null, currency: null, quantity: null, unit: null, location: null, notes: null, change: "new", evidence: { page: 1, section: "Annual Day", quote: "Annual Day — 15 October" } },
  { domain: "school_item", title: "Annual Day rehearsal", schoolKind: "event", subject: null, person: "Asmi", dateText: null, dueDate: "2026-10-10", billKind: null, payee: null, amount: null, currency: null, quantity: null, unit: null, location: null, notes: null, change: "new", evidence: { page: 1, section: "Rehearsals", quote: "Rehearsals — 8, 10 and 13 October" } },
  { domain: "bill", title: "Parent contribution", schoolKind: null, subject: null, person: null, dateText: null, dueDate: "2026-10-05", billKind: "school_fee", payee: "ABC International School", amount: 500, currency: "INR", quantity: null, unit: null, location: null, notes: null, change: "new", evidence: { page: 2, section: "Fees", quote: "Parent contribution ₹500 due 5 October" } },
] as const;

function extraction() {
  return sanitizeIntakeExtraction({
    readable: true, kind: "school_item", title: "Annual Day", notes: null, billKind: null, payee: null, amount: null, currency: null, dueDate: "2026-10-15", schoolKind: "event",
    subject: null, quantity: null, unit: null, category: null, healthRecordType: null, documentDate: null, dateText: null, merchant: null, lines: [], subjectMemberName: null,
    summary: "ABC International School's Annual Day notice.", people: ["Asmi"], facts: [], needs: [], change: "new", confidence: "high", issuedOn: null,
    pages: { total: 2, unreadable: [] }, records: RECORDS.map((record) => ({ ...record })),
  });
}

const injection = { flagged: false, signals: [] };

describe("Golden scenario 4 — the same file through HomeTalk (§49)", () => {
  it("the same reading gives the same plan whichever door it came through — only the words around it differ", () => {
    const viaHomeSend = buildUnderstanding(extraction(), { channel: "manual_upload", filename: "school_notice.pdf", pageCount: 2, injection });
    const viaHomeTalk = buildUnderstanding(extraction(), { channel: "manual_upload", filename: "school_notice.pdf", subject: "Please add these to our calendar", pageCount: 2, injection });
    expect(viaHomeTalk.document).toEqual(viaHomeSend.document);
    const options = { householdId: "hh", timezone: "Asia/Kolkata", now: new Date("2026-09-24T06:00:00Z"), viewerMemberId: "kunal", people: [], receivedAt: "2026-09-24T06:00:00Z" };
    const planA = buildDocumentPlan(viaHomeSend.document!, { schoolItems: [], obligations: [] }, options);
    const planB = buildDocumentPlan(viaHomeTalk.document!, { schoolItems: [], obligations: [] }, options);
    expect(planB).toEqual(planA);
  });
});

async function appliedItem() {
  const understanding = buildUnderstanding(extraction(), { channel: "manual_upload", pageCount: 2, injection });
  const plan = {
    ...buildDocumentPlan(understanding.document!, { schoolItems: [], obligations: [] }, { householdId: "hh", timezone: "Asia/Kolkata", viewerMemberId: "kunal", people: [] }),
  };
  // No children on record: the school records wait on an answer; the bill is new.
  const writer: PlanWriter = {
    create: async (entry) => ({ entityId: `e-${entry.key}` }),
    update: async (entry) => ({ entityId: `e-${entry.key}`, previous: {} }),
    cancel: async (entry) => ({ entityId: `e-${entry.key}`, previous: {} }),
    record: async (entry) => `c-${entry.key}`,
  };
  const receipt = await applyDocumentPlan(plan, new Set(plan.entries.map((entry) => entry.key)), writer, { intakeId: "i1" });
  return { id: "i1", understanding, receipt, subject: null, createdAt: "2026-09-24T06:00:00Z", extracted: null };
}

describe("what HomeTalk says once a document is applied (§32)", () => {
  it("says what it read, then exactly what was done — from the receipt", async () => {
    const item = await appliedItem();
    const text = documentReplyText(item)!;
    expect(text.startsWith("I read the 2-page school notice and found 3 things for your household.")).toBe(true);
    expect(text).toContain("Created:\n• Parent contribution");
    expect(text).toContain("Still needs your answer:\n• Annual Day");
    expect(text).toContain("Nothing else was changed");
  });

  it("carries the content classes of what it names, for the reply-language gate", async () => {
    const item = await appliedItem();
    expect(documentReplyClasses(item.receipt).sort()).toEqual(["child", "financial", "general"]);
  });

  it("says nothing for a document not yet applied", () => {
    expect(documentReplyText({ id: "x", understanding: null, receipt: null, subject: null, createdAt: "2026-09-24T06:00:00Z" })).toBeNull();
  });
});

describe("'What did the school notice change?' (§33)", () => {
  it("reads questions about a document, and only those", () => {
    expect(readDocumentChangeQuestion("What did the school notice change?")).toEqual({ about: "school notice" });
    expect(readDocumentChangeQuestion("what did that PDF add")).toEqual({ about: "PDF" });
    expect(readDocumentChangeQuestion("So what has the electricity bill changed?")).toEqual({ about: "electricity bill" });
    expect(readDocumentChangeQuestion("What did Asmi change?")).toBeNull();
    expect(readDocumentChangeQuestion("What changed at school today?")).toBeNull();
  });

  const receiptItem = {
    id: "i1",
    subject: null,
    createdAt: "2026-09-24T06:00:00Z",
    understanding: { contentSummary: "ABC International School's Annual Day notice.", kind: "school_item", document: { pages: { total: 2, read: 2, unreadable: [] }, issuedOn: null, records: [] } } as never,
    receipt: {
      version: 1 as const,
      intakeId: "i1",
      status: "completed" as const,
      appliedAt: "2026-09-24T06:05:00Z",
      pages: { total: 2, read: 2, unreadable: [] },
      counts: { created: 2, updated: 1, cancelled: 0, unchanged: 1, skipped: 0, needs_clarification: 0, failed: 0 },
      changes: [
        { key: "r1", title: "Annual Day", domain: "school_item" as const, action: "updated" as const, entityId: "a", changeId: "c1", fields: [{ field: "date" as const, label: "Date", before: "12 Oct", after: "15 Oct" }], evidence: { page: 1, section: null, quote: "" }, reason: "" },
        { key: "r3", title: "Annual Day rehearsal", domain: "school_item" as const, action: "created" as const, entityId: "b", changeId: "c2", fields: [], evidence: { page: 1, section: null, quote: "" }, reason: "Asmi · 10 Oct" },
        { key: "r4", title: "Annual Day rehearsal", domain: "school_item" as const, action: "created" as const, entityId: "c", changeId: "c3", fields: [], evidence: { page: 1, section: null, quote: "" }, reason: "Asmi · 13 Oct" },
        { key: "r5", title: "White shoes", domain: "grocery_item" as const, action: "unchanged" as const, entityId: "d", changeId: null, fields: [], evidence: { page: 1, section: null, quote: "" }, reason: "Already on record" },
      ],
    },
  };

  it("answers from what the document actually did", () => {
    const answer = answerDocumentChanges([receiptItem], [{ id: "c1", undoneAt: null }, { id: "c2", undoneAt: null }, { id: "c3", undoneAt: null }], "school notice");
    expect(answer?.text).toBe(
      "The 2-page school notice moved Annual Day from 12 Oct to 15 Oct, added Annual Day rehearsal (Asmi · 10 Oct) and added Annual Day rehearsal (Asmi · 13 Oct). One thing was already on record.",
    );
  });

  it("never repeats a change someone has since undone as if it still held", () => {
    const answer = answerDocumentChanges([receiptItem], [{ id: "c1", undoneAt: null }, { id: "c2", undoneAt: "2026-09-24T07:00:00Z" }, { id: "c3", undoneAt: null }], "notice");
    expect(answer?.text).toContain("One more change was undone since.");
    expect(answer?.text).not.toContain("10 Oct");
    const allUndone = answerDocumentChanges([receiptItem], ["c1", "c2", "c3"].map((id) => ({ id, undoneAt: "2026-09-24T07:00:00Z" })), "notice");
    expect(allUndone?.text).toBe("The 2-page school notice changed 3 things, but they were all undone since — nothing from it is on record now.");
  });

  it("finds nothing when no applied document fits — the question goes on to HomeBrain", () => {
    expect(answerDocumentChanges([receiptItem], [], "electricity bill")).toBeNull();
    expect(answerDocumentChanges([], [], "notice")).toBeNull();
  });
});
