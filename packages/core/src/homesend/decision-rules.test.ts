import { describe, expect, it, vi } from "vitest";

import type { HouseholdRule } from "../homebrain/rules";
import type { HomeSendDecision } from "./decision";
import type { DecisionMemory, DecisionOutcome } from "./decision-memory";
import {
  applyLearnedRule,
  learnedRuleFor,
  learnedRuleLine,
  learnFromOutcome,
  newKindPatternKey,
  patternKeys,
  patternValue,
  promotionFor,
  ruleEvidence,
} from "./decision-rules";

const NOTE_EVENT = [
  { capability: "note", op: "create", title: "AGM notice", confidence: 0.9 },
  { capability: "event", op: "create", title: "AGM", confidence: 0.9 },
];

let n = 0;
function memory(outcome: DecisionOutcome, over: Partial<DecisionMemory> = {}): DecisionMemory {
  n += 1;
  return {
    id: `m${n}`,
    intakeId: `i${n}`,
    senderMemberId: null,
    senderKey: "sender:secretary@society.in",
    title: `Society notice ${n}`,
    whatIs: "a society notice",
    nearestKind: "note",
    newKind: "society notice",
    decision: NOTE_EVENT,
    outcome,
    corrections: [],
    embedding: null,
    createdAt: new Date(Date.UTC(2026, 10, n)).toISOString(),
    ...over,
  };
}

function rule(over: Partial<HouseholdRule> = {}): HouseholdRule {
  return {
    id: "r1",
    kind: "decision_pattern",
    key: "pattern:sender:secretary@society.in",
    valueMemberId: null,
    valueText: "event.create note.create",
    learnedByMemberId: null,
    learnedFromItemId: null,
    learnedAt: "2026-11-22T00:00:00Z",
    mixed: false,
    source: "confirmations",
    times: 3,
    ...over,
  };
}

const SENDER = "pattern:sender:secretary@society.in";

describe("learned rules (14-084)", () => {
  it("keys a pattern by outside sender, then by new kind", () => {
    expect(patternKeys({ senderKey: "sender:secretary@society.in", newKind: "Society Notice" })).toEqual([SENDER, "pattern:newkind:society notice"]);
    expect(patternKeys({ senderKey: null, newKind: null })).toEqual([]);
    expect(newKindPatternKey("  ")).toBeNull();
  });

  it("only ever learns record capabilities: never money, health, an action or a known-kind record", () => {
    expect(patternValue(NOTE_EVENT)).toBe("event.create note.create");
    expect(patternValue([{ capability: "bill", op: "create" }])).toBeNull();
    expect(patternValue([{ capability: "note", op: "create" }, { capability: "health_record", op: "create" }])).toBeNull();
    expect(patternValue([{ capability: "action_request", op: "create" }])).toBeNull();
    expect(patternValue([{ capability: "school_item", op: "create" }])).toBeNull();
    expect(patternValue([{ capability: "note", op: "update" }])).toBeNull();
    expect(patternValue([])).toBeNull();
  });

  it("promotes after three confirmations with nothing corrected", () => {
    const two = [memory("confirmed"), memory("answered"), memory("kept")];
    expect(promotionFor(two, SENDER)).toBeNull();
    const three = [...two, memory("confirmed")];
    expect(promotionFor(three, SENDER)).toMatchObject({ key: SENDER, value: "event.create note.create" });
    expect(promotionFor(three, SENDER)?.evidence).toHaveLength(3);
  });

  it("counts only since the last correction or Undo", () => {
    const memories = [memory("confirmed"), memory("confirmed"), memory("undone"), memory("confirmed"), memory("confirmed")];
    expect(promotionFor(memories, SENDER)).toBeNull();
    expect(promotionFor([...memories, memory("confirmed")], SENDER)).not.toBeNull();
  });

  it("never promotes when the same pattern was confirmed two different ways", () => {
    const memories = [memory("confirmed"), memory("confirmed"), memory("confirmed"), memory("confirmed", { decision: [NOTE_EVENT[0]!] })];
    expect(promotionFor(memories, SENDER)).toBeNull();
  });

  it("is per household: another sender's confirmations don't count", () => {
    const memories = [memory("confirmed"), memory("confirmed"), memory("confirmed", { senderKey: "sender:other@x.in", newKind: "flyer" })];
    expect(promotionFor(memories, SENDER)).toBeNull();
  });

  it("finds the live rule, sender first; a demoted rule settles nothing", () => {
    const newKind = rule({ id: "r2", key: "pattern:newkind:society notice", valueText: "note.create" });
    expect(learnedRuleFor([newKind, rule()], { senderKey: "sender:secretary@society.in", newKind: "society notice" })?.id).toBe("r1");
    expect(learnedRuleFor([newKind, rule({ mixed: true })], { senderKey: "sender:secretary@society.in", newKind: "society notice" })?.id).toBe("r2");
    expect(learnedRuleFor([rule({ mixed: true })], { senderKey: "sender:secretary@society.in", newKind: null })).toBeNull();
    expect(learnedRuleLine(rule())).toContain("event + note");
  });

  it("holds a new-kind decision to the rule: drops what the rule doesn't name, keeps the note, marks the source", () => {
    const decision: HomeSendDecision = {
      whatIs: "a society notice",
      nearestKind: "note",
      newKind: "society notice",
      question: null,
      source: "model",
      operations: [
        { op: "create", capability: "note", ref: null, fields: { title: "AGM" }, forPerson: null, evidence: [], confidence: 0.9 },
        { op: "create", capability: "event", ref: null, fields: { title: "AGM" }, forPerson: null, evidence: [], confidence: 0.9 },
        { op: "create", capability: "to_buy", ref: null, fields: { title: "Chairs" }, forPerson: null, evidence: [], confidence: 0.6 },
      ],
    };
    const held = applyLearnedRule(decision, rule());
    expect(held.source).toBe("learned_rule");
    expect(held.operations.map((op) => op.capability)).toEqual(["note", "event"]);
    expect(applyLearnedRule({ ...decision, newKind: null }, rule())).toEqual({ ...decision, newKind: null });
    expect(applyLearnedRule(decision, null)).toBe(decision);
  });

  it("answers Why? from the memory rows", () => {
    const memories = [memory("confirmed"), memory("confirmed"), memory("corrected"), memory("confirmed")];
    expect(ruleEvidence(memories, { key: SENDER, mixed: false }).confirmed).toHaveLength(1);
    expect(ruleEvidence(memories, { key: SENDER, mixed: true }).broken?.outcome).toBe("corrected");
  });

  it("promotes on the third confirmation and demotes on a correction, in that household only", async () => {
    const calls: { table: string; op: string; values?: unknown; filters: unknown[] }[] = [];
    const chain = (entry: (typeof calls)[number]) => {
      const self: Record<string, unknown> = {};
      for (const name of ["eq", "in"]) self[name] = (...args: unknown[]) => (entry.filters.push([name, ...args]), self);
      (self as { then: unknown }).then = (resolve: (value: unknown) => void) => resolve({ error: null });
      return self;
    };
    const client = {
      from: vi.fn((table: string) => ({
        upsert: (values: unknown) => {
          calls.push({ table, op: "upsert", values, filters: [] });
          return Promise.resolve({ error: null });
        },
        update: (values: unknown) => {
          const entry = { table, op: "update", values, filters: [] as unknown[] };
          calls.push(entry);
          return chain(entry);
        },
      })),
    };
    const memories = [memory("confirmed"), memory("confirmed"), memory("confirmed")];
    const item = { senderKey: "sender:secretary@society.in", newKind: "society notice", intakeId: "i9" };
    const by = { householdId: "h1", byMemberId: "m1", itemId: "i9" };
    expect(await learnFromOutcome(client as never, memories, item, "confirmed", by)).toBe(2);
    expect(calls[0]).toMatchObject({ op: "upsert", values: { household_id: "h1", kind: "decision_pattern", key: SENDER, value_text: "event.create note.create", source: "confirmations", times: 3, mixed: false, value_member_id: null } });
    calls.length = 0;
    expect(await learnFromOutcome(client as never, [], item, "corrected", by)).toBe(0);
    expect(calls[0]).toMatchObject({ op: "update", values: { mixed: true, source: "correction" } });
    expect(calls[0]!.filters).toContainEqual(["eq", "household_id", "h1"]);
    calls.length = 0;
    expect(await learnFromOutcome(client as never, memories, item, "kept", by)).toBe(0);
    expect(calls).toHaveLength(0);
  });
});
