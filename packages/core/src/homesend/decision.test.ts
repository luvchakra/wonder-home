import { describe, expect, it } from "vitest";

import type { IntakeExtraction } from "../ai/classify-intake";
import { CAPABILITIES, CAPABILITY_IDS, capabilityLines } from "./capabilities";
import { datedOperations, decisionFromModel, decisionFromReading, newKindSentence, validateDecision, type DecisionContext, type HomeSendDecision } from "./decision";

const reading = (overrides: Partial<IntakeExtraction>): IntakeExtraction => ({
  readable: true, kind: "unknown", title: null, notes: null, billKind: null, payee: null, amount: null, currency: null, dueDate: null,
  schoolKind: null, subject: null, activityKind: null, location: null, quantity: null, unit: null, category: null, healthRecordType: null,
  documentDate: null, dateText: null, merchant: null, lines: [], subjectMemberName: null, summary: null, people: [], facts: [], needs: [],
  change: "new", confidence: "high", schedule: null, syllabus: null, secondary: null, records: [],
  ...overrides,
});

const context = (overrides: Partial<DecisionContext> = {}): DecisionContext => ({
  sourceText: null, knownRecordIds: new Set(), injectionFlagged: false, healthFiler: false, ...overrides,
});

const modelDecision = (operations: HomeSendDecision["operations"], extra: Partial<HomeSendDecision> = {}): HomeSendDecision => ({
  whatIs: "a society maintenance notice", nearestKind: "note", newKind: "society notice", operations, question: null, source: "model", ...extra,
});

const NOTICE = "Splendora CHS: water supply will be shut on 30 Nov 2026 from 10 am to 4 pm for tank cleaning. Maintenance due Rs 4,500 by 5 Dec.";

describe("capability registry", () => {
  it("every capability has a writer, an owner, a safety class and a title field", () => {
    for (const id of CAPABILITY_IDS) {
      const cap = CAPABILITIES[id];
      expect(cap.id).toBe(id);
      expect(cap.writer.length).toBeGreaterThan(0);
      expect(cap.fields.shape).toHaveProperty("title");
    }
  });

  it("money and health keep their own class; actions never run on their own", () => {
    expect(CAPABILITIES.bill.safety).toBe("money");
    expect(CAPABILITIES.payment.safety).toBe("money");
    expect(CAPABILITIES.health_record.safety).toBe("health");
    expect(CAPABILITIES.action_request.safety).toBe("action");
    expect(capabilityLines()).not.toMatch(/home-send-writes/);
  });
});

describe("decisionFromReading (today's behaviour as a decision)", () => {
  it("a bill is one money operation with its fields", () => {
    const decision = decisionFromReading(reading({ kind: "bill", title: "Electricity", payee: "MSEDCL", amount: 1240.5, currency: "INR", dueDate: "2026-12-05" }));
    expect(decision.source).toBe("reading");
    expect(decision.operations).toHaveLength(1);
    expect(decision.operations[0]).toMatchObject({ op: "create", capability: "bill", fields: { payee: "MSEDCL", amount: 1240.5 } });
  });

  it("a timetable is exams, a syllabus attaches to its exam, a payment message attaches to its bill", () => {
    const timetable = reading({ kind: "school_item", title: "MTUT2 timetable", schedule: { kind: "exam", title: "MTUT 2", school: null, columns: ["Std V"], rows: [{ dateText: "3 Dec", dueDate: "2026-12-03", cells: ["Science"] }] } as never });
    expect(decisionFromReading(timetable).operations[0]?.capability).toBe("exam");
    const syllabus = reading({ kind: "school_item", title: "Grade 5 syllabus", syllabus: { title: "MTUT2", school: null, grade: "Grade 5", examRef: null, rows: [] } as never });
    expect(decisionFromReading(syllabus).operations[0]).toMatchObject({ capability: "exam_portion", op: "attach" });
    const paid = decisionFromReading(reading({ kind: "receipt" }), { amount: 899, currency: "INR", payee: "Airtel", paidOn: "2026-11-20", method: "upi" } as never);
    expect(paid.operations[0]).toMatchObject({ capability: "payment", op: "attach", fields: { payee: "Airtel", amount: 899 } });
  });

  it("an unknown reading becomes a household note with its facts; needs become To Buy", () => {
    const decision = decisionFromReading(reading({ title: "Society notice", facts: [{ statement: "Water off 30 Nov", evidence: "water supply will be shut" }], needs: [{ title: "Water cans", reason: "Water off" }] }));
    expect(decision.operations.map((op) => op.capability)).toEqual(["note", "to_buy"]);
  });

  it("a document's several records are each an operation, with where each was read", () => {
    const record = (title: string, quote: string) => ({ domain: "school_item" as const, title, schoolKind: "event" as const, subject: null, person: "Asmi", dateText: null, dueDate: "2026-12-10", billKind: null, payee: null, amount: null, currency: null, quantity: null, unit: null, location: null, notes: null, change: "new" as const, evidence: { page: 1, section: null, quote } });
    const decision = decisionFromReading(reading({ kind: "school_item", title: "Circular", records: [record("Annual Day", "Annual Day on 10 Dec"), record("PTM", "PTM 12 Dec")] }));
    expect(decision.operations.map((op) => op.fields.title)).toEqual(["Annual Day", "PTM"]);
    expect(decision.operations[1]?.evidence[0]?.quote).toBe("PTM 12 Dec");
  });
});

describe("validateDecision (the guardrails after the model decides)", () => {
  it("accepts a grounded event and note for an unseen kind", () => {
    const decision = modelDecision([
      { op: "create", capability: "event", ref: null, fields: { title: "Water shutdown", dueDate: "2026-11-30" }, forPerson: null, evidence: [{ field: "dueDate", quote: "shut on 30 Nov 2026", recordId: null }], confidence: 0.9 },
      { op: "create", capability: "note", ref: null, fields: { title: "Society maintenance notice", kindName: "society notice" }, forPerson: null, evidence: [{ field: "title", quote: "Splendora CHS", recordId: null }], confidence: 0.9 },
    ]);
    const validated = validateDecision(decision, context({ sourceText: NOTICE }));
    expect(validated.accepted).toEqual([0, 1]);
  });

  it("a reading naming something not in what was sent adds nothing", () => {
    const decision = modelDecision([{ op: "create", capability: "bill", ref: null, fields: { title: "Maintenance", amount: 9999 }, forPerson: null, evidence: [{ field: "amount", quote: "Rs 9,999", recordId: null }], confidence: 0.95 }]);
    expect(validateDecision(decision, context({ sourceText: NOTICE })).verdicts[0]).toEqual({ status: "rejected", reason: "not_in_what_was_sent" });
    const bare = modelDecision([{ op: "create", capability: "event", ref: null, fields: { title: "Something" }, forPerson: null, evidence: [], confidence: 0.95 }]);
    expect(validateDecision(bare, context({ sourceText: NOTICE })).accepted).toEqual([]);
  });

  it("an unknown capability, an unsupported op or a missing title is rejected; extra fields are dropped", () => {
    const decision = modelDecision([
      { op: "create", capability: "transfer_money", ref: null, fields: { title: "x" }, forPerson: null, evidence: [], confidence: 1 },
      { op: "attach", capability: "to_buy", ref: "r1", fields: { title: "x" }, forPerson: null, evidence: [], confidence: 1 },
      { op: "create", capability: "event", ref: null, fields: { notes: "x" }, forPerson: null, evidence: [{ field: "notes", quote: "tank cleaning", recordId: null }], confidence: 1 },
      { op: "create", capability: "event", ref: null, fields: { title: "Tank cleaning", memberId: "a1b2", approved: true }, forPerson: null, evidence: [{ field: "title", quote: "tank cleaning", recordId: null }], confidence: 1 },
    ]);
    const validated = validateDecision(decision, context({ sourceText: NOTICE }));
    expect(validated.verdicts.slice(0, 3)).toEqual([
      { status: "rejected", reason: "unknown_capability" },
      { status: "rejected", reason: "unsupported_op" },
      { status: "rejected", reason: "missing_required" },
    ]);
    expect(validated.verdicts[3]).toMatchObject({ status: "accepted", dropped: ["memberId", "approved"] });
    expect(validated.operations[3]?.fields).toEqual({ title: "Tank cleaning" });
  });

  it("an update names a record WonderHome handed over, never an invented one", () => {
    const op = { op: "update" as const, capability: "bill", fields: { title: "Maintenance", amount: 4500 }, forPerson: null, evidence: [{ field: "amount", quote: "Rs 4,500", recordId: null }], confidence: 0.9 };
    expect(validateDecision(modelDecision([{ ...op, ref: "bill-9" }]), context({ sourceText: NOTICE })).verdicts[0]).toEqual({ status: "rejected", reason: "unknown_reference" });
    expect(validateDecision(modelDecision([{ ...op, ref: null }]), context({ sourceText: NOTICE })).verdicts[0]).toEqual({ status: "unresolved", reason: "no_reference" });
    expect(validateDecision(modelDecision([{ ...op, ref: "bill-1" }]), context({ sourceText: NOTICE, knownRecordIds: new Set(["bill-1"]) })).accepted).toEqual([0]);
  });

  it("paying is never done: an action waits for a yes", () => {
    const decision = modelDecision([{ op: "create", capability: "action_request", ref: null, fields: { title: "Pay maintenance", action: "pay" }, forPerson: null, evidence: [{ field: "title", quote: "Maintenance due Rs 4,500", recordId: null }], confidence: 0.99 }]);
    const validated = validateDecision(decision, context({ sourceText: NOTICE }));
    expect(validated.verdicts[0]).toEqual({ status: "needs_consent", safety: "action" });
    expect(validated.accepted).toEqual([]);
  });

  it("who a health record is for is never a model's, unless the sender is a health filer", () => {
    const decision = modelDecision([{ op: "create", capability: "health_record", ref: null, fields: { title: "Prescription" }, forPerson: "Asmi", evidence: [], confidence: 0.95 }], { source: "reading" });
    expect(validateDecision(decision, context()).operations[0]?.forPerson).toBeNull();
    expect(validateDecision(decision, context({ healthFiler: true })).operations[0]?.forPerson).toBe("Asmi");
  });

  it("content that tried to instruct WonderHome caps every confidence", () => {
    const decision = modelDecision([{ op: "create", capability: "note", ref: null, fields: { title: "Notice" }, forPerson: null, evidence: [{ field: "title", quote: "Splendora", recordId: null }], confidence: 0.99 }]);
    expect(validateDecision(decision, context({ sourceText: NOTICE, injectionFlagged: true })).operations[0]?.confidence).toBe(0.6);
  });
});

describe("a kind nobody anticipated (14-082)", () => {
  const society = reading({
    title: "Water supply shutdown", whatIs: "a society maintenance notice", newKind: "society notice",
    operations: [
      { capability: "event", title: "Water shutdown", notes: "10 am to 4 pm, tank cleaning", dateText: "30 Nov 2026", person: null, quote: "water supply will be shut on 30 Nov 2026", confidence: "high" },
      { capability: "reminder", title: "Pay maintenance", notes: null, dateText: "5 Dec", person: null, quote: "Maintenance due Rs 4,500 by 5 Dec", confidence: "high" },
    ],
  });
  const ground = (text: string) => (text.startsWith("30 Nov") ? "2026-11-30" : text === "5 Dec" ? "2026-12-05" : null);

  it("the model's decision keeps the notice as a note and grounds each day itself", () => {
    const decision = decisionFromModel(society, ground);
    expect(decision?.source).toBe("model");
    expect(decision?.operations.map((op) => op.capability)).toEqual(["note", "event", "reminder"]);
    expect(decision?.operations[1]?.fields.dueDate).toBe("2026-11-30");
    expect(decision?.operations[0]?.fields.kindName).toBe("society notice");
  });

  it("only for a new kind: a known kind keeps today's path", () => {
    expect(decisionFromModel({ ...society, kind: "bill" }, ground)).toBeNull();
    expect(decisionFromModel({ ...society, newKind: null }, ground)).toBeNull();
  });

  it("its dated things, once validated, are said plainly", () => {
    const validated = validateDecision(decisionFromModel(society, ground)!, context({ sourceText: NOTICE }));
    expect(datedOperations(validated).map((op) => op.day)).toEqual(["2026-11-30", "2026-12-05"]);
    expect(newKindSentence(validated, "did")).toBe("This looks like a society maintenance notice. I added the 30 Nov water shutdown and the 5 Dec reminder to pay maintenance to the calendar and kept the society notice as a note.");
  });

  it("a day the model made up is not in what was sent, so nothing is added for it", () => {
    const made = reading({ ...society, operations: [{ ...society.operations![0]!, quote: "shutdown on 2 Dec" }] });
    const validated = validateDecision(decisionFromModel(made, () => "2026-12-02")!, context({ sourceText: NOTICE }));
    expect(datedOperations(validated)).toEqual([]);
    expect(newKindSentence(validated, "will")).toBe("This looks like a society maintenance notice. I'll keep the society notice as a note.");
  });
});
