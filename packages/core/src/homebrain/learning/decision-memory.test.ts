import { describe, expect, it } from "vitest";

import { pastDecisionsLine } from "../../ai/classify-intake";
import { compactDecision, examplesText, mostSimilar, strongerOutcome, type DecisionMemory } from "./decision-memory";
import { validateDecision, type HomeSendDecision } from "../intake/decision";

const memory = (overrides: Partial<DecisionMemory>): DecisionMemory => ({
  id: "m", intakeId: "i", senderMemberId: null, senderKey: null, title: "Something", whatIs: null, nearestKind: "note", newKind: null,
  decision: [], outcome: "pending", corrections: [], embedding: null, createdAt: "2026-11-01T00:00:00Z", ...overrides,
});

describe("decision memory (14-083)", () => {
  const society = memory({ id: "a", title: "Splendora CHS water supply shutdown", whatIs: "a society maintenance notice", newKind: "society notice", outcome: "confirmed", decision: [{ capability: "event", op: "create", title: "Water shutdown", confidence: 0.9 }] });
  const school = memory({ id: "b", title: "Annual Day rehearsal timings", whatIs: "a school circular", nearestKind: "school_item", outcome: "kept" });

  it("finds the household's similar past decisions, by words or meaning, and nothing unrelated", () => {
    expect(mostSimilar({ text: "Splendora CHS: lift maintenance and water supply shutdown on Sunday", senderMemberId: null, senderKey: null }, [society, school]).map((m) => m.id)).toEqual(["a"]);
    expect(mostSimilar({ text: "Pizza order receipt", senderMemberId: null, senderKey: null }, [society, school])).toEqual([]);
    const near = memory({ id: "c", embedding: [1, 0, 0], outcome: "kept" });
    const far = memory({ id: "d", embedding: [0, 1, 0], outcome: "kept" });
    expect(mostSimilar({ text: "", senderMemberId: null, senderKey: null, embedding: [0.9, 0.1, 0] }, [far, near]).map((m) => m.id)).toEqual(["c"]);
  });

  it("the same sender ranks first among equals", () => {
    const fromRiya = memory({ ...society, id: "r", senderKey: "sender:riya@example.com" });
    expect(mostSimilar({ text: "Splendora CHS water supply shutdown", senderMemberId: null, senderKey: "sender:riya@example.com" }, [society, fromRiya])[0]?.id).toBe("r");
  });

  it("examples say what the household did, an undo as a warning, with no ids", () => {
    const undone = memory({ title: "Loyalty points newsletter", nearestKind: "note", outcome: "undone", decision: [{ capability: "reminder", op: "create", title: "Redeem points", confidence: 0.7 }] });
    const corrected = memory({ title: "Ration card renewal", newKind: "ration notice", outcome: "corrected", corrections: [{ field: "dueDate", to: "2026-12-12" }] });
    const text = examplesText([society, undone, corrected]);
    expect(text).toContain('Example 1: "Splendora CHS water supply shutdown" (a society notice) → create event "Water shutdown"; the household confirmed it.');
    expect(text).toContain("the household undid it — do not decide this way again");
    expect(text).toContain("Corrected: dueDate → 2026-12-12.");
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/);
  });

  it("is handed to the model fenced, as untrusted content", () => {
    expect(pastDecisionsLine({ pastDecisions: "Example 1: …" })).toMatch(/Example 1/);
    expect(pastDecisionsLine({ pastDecisions: "Example 1: …" })).not.toBe("Example 1: …");
    expect(pastDecisionsLine({})).toBe("");
  });

  it("an undo or a correction is never overwritten by a later keep", () => {
    expect(strongerOutcome("undone", "kept")).toBe("undone");
    expect(strongerOutcome("corrected", "confirmed")).toBe("corrected");
    expect(strongerOutcome("pending", "kept")).toBe("kept");
  });

  it("remembers only accepted operations, with no amount or person", () => {
    const decision: HomeSendDecision = {
      whatIs: "a bill", nearestKind: "bill", newKind: null, question: null, source: "model",
      operations: [
        { op: "create", capability: "bill", ref: null, fields: { title: "Maintenance", amount: 4500 }, forPerson: "Kunal", evidence: [{ field: "amount", quote: "Rs 4,500", recordId: null }], confidence: 0.9 },
        { op: "create", capability: "nonsense", ref: null, fields: { title: "x" }, forPerson: null, evidence: [], confidence: 1 },
      ],
    };
    const compact = compactDecision(validateDecision(decision, { sourceText: "Maintenance due Rs 4,500", knownRecordIds: new Set(), injectionFlagged: false, healthFiler: false }));
    expect(compact).toEqual([{ capability: "bill", op: "create", title: "Maintenance", confidence: 0.9 }]);
  });
});
