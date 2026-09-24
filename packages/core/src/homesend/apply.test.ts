import { describe, expect, it } from "vitest";

import { ApiError } from "../api/errors";
import { applyDocumentPlan, receiptHeadline, receiptText, type PlanWriter, type WriteResult } from "./apply";
import type { DocumentPlan, PlanEntry } from "./plan";

/** Deep Document Understanding 2.0 §22–27, §42–44: applying a plan, and the exact receipt it leaves. */

function entry(key: string, action: PlanEntry["action"], extra: Partial<PlanEntry> = {}): PlanEntry {
  const record = {
    key, domain: "school_item" as const, title: `Item ${key}`, schoolKind: null, subject: null, person: null, date: null, time: null, endTime: null, billKind: null, payee: null,
    amount: null, currency: null, quantity: null, unit: null, location: null, notes: null, change: "new" as const, evidence: { page: 1, section: null, quote: `quote ${key}` },
  };
  const group = { create: "new", update: "updates", cancel: "updates", no_change: "already_on_record", conflict: "conflicts", needs_answer: "needs_answer" }[action] as PlanEntry["group"];
  return {
    key, domain: "school_item", action, group, title: `Item ${key}`, reason: `reason ${key}`, fields: [], changes: [], existing: null, person: null, question: null,
    evidence: record.evidence, included: action === "create" || action === "update" || action === "cancel", record, ...extra,
  };
}

function plan(entries: PlanEntry[]): DocumentPlan {
  return { version: 1, pages: { total: 2, read: 2, unreadable: [] }, issuedOn: null, entries, counts: { updates: 0, new: 0, already_on_record: 0, conflicts: 0, needs_answer: 0 }, changeCount: 0 };
}

function writer(options: { fail?: Record<string, unknown>; recordFails?: string[] } = {}): PlanWriter & { calls: string[] } {
  const calls: string[] = [];
  const write = (kind: string) => async (target: PlanEntry): Promise<WriteResult> => {
    calls.push(`${kind}:${target.key}`);
    if (options.fail?.[target.key]) throw options.fail[target.key];
    return { entityId: `entity-${target.key}`, previous: kind === "create" ? null : { dueAt: "2026-10-12" } };
  };
  return {
    calls,
    create: write("create"),
    update: write("update"),
    cancel: write("cancel"),
    record: async (target) => {
      calls.push(`record:${target.key}`);
      if (options.recordFails?.includes(target.key)) throw new Error("db down");
      return `change-${target.key}`;
    },
  };
}

const MOVE = { field: "date" as const, label: "Date", before: "12 Oct", after: "15 Oct" };

describe("applying a plan", () => {
  it("writes each included change through its domain, once, and records each for undo", async () => {
    const w = writer();
    const receipt = await applyDocumentPlan(
      plan([entry("r1", "update", { changes: [MOVE], existing: { id: "annual", title: "Annual Day", date: "2026-10-12" } }), entry("r2", "create"), entry("r3", "no_change")]),
      new Set(["r1", "r2"]),
      w,
      { intakeId: "intake", now: new Date("2026-09-24T10:00:00Z") },
    );
    expect(w.calls).toEqual(["update:r1", "record:r1", "create:r2", "record:r2"]);
    expect(receipt.status).toBe("completed");
    expect(receipt.changes.map((change) => [change.key, change.action, change.changeId])).toEqual([
      ["r1", "updated", "change-r1"],
      ["r2", "created", "change-r2"],
      ["r3", "unchanged", null],
    ]);
    expect(receipt.changes[0]).toMatchObject({ entityId: "entity-r1", fields: [MOVE], evidence: { page: 1, quote: "quote r1" } });
    expect(receiptHeadline(receipt)).toBe("2 changes applied");
  });

  it("a change the person left out is skipped, and nothing is written for it", async () => {
    const w = writer();
    const receipt = await applyDocumentPlan(plan([entry("r1", "create"), entry("r2", "create")]), new Set(["r2"]), w, { intakeId: "intake" });
    expect(w.calls).toEqual(["create:r2", "record:r2"]);
    expect(receipt.changes[0]).toMatchObject({ action: "skipped", reason: "You left this out.", changeId: null });
  });

  it("a conflict, a no-op and an open question are never written, even if the browser says to include them", async () => {
    const w = writer();
    const receipt = await applyDocumentPlan(
      plan([entry("r1", "conflict", { existing: { id: "ptm", title: "PTM", date: "2026-10-12" } }), entry("r2", "no_change"), entry("r3", "needs_answer", { question: { text: "Who is the Maths assessment for — Asmi or Manan?", options: [] } })]),
      new Set(["r1", "r2", "r3"]),
      w,
      { intakeId: "intake" },
    );
    expect(w.calls).toEqual([]);
    expect(receipt.changes.map((change) => change.action)).toEqual(["unchanged", "unchanged", "needs_clarification"]);
    expect(receipt.changes[0]?.reason).toBe("PTM was changed after the document was written, so it stays as it is.");
    expect(receipt.status).toBe("needs_review");
  });

  it("one refusal among successes is a partial result — the rest are not claimed failed, and it is not claimed done (§43)", async () => {
    const w = writer({ fail: { r2: new ApiError("conflict", "That contribution is already paid.") } });
    const receipt = await applyDocumentPlan(plan([entry("r1", "create"), entry("r2", "create", { domain: "bill", title: "School contribution" }), entry("r3", "create")]), new Set(["r1", "r2", "r3"]), w, { intakeId: "intake" });
    expect(receipt.status).toBe("partial");
    expect(receipt.counts).toMatchObject({ created: 2, failed: 1 });
    expect(receipt.changes[1]).toMatchObject({ action: "failed", error: "That contribution is already paid.", changeId: null });
    expect(receiptHeadline(receipt)).toBe("2 applied, 1 could not be");
    expect(receiptText(receipt)).toContain("Could not complete:\n• School contribution — That contribution is already paid.");
    expect(receiptText(receipt)).not.toContain("Nothing else was changed");
  });

  it("an unexpected failure is said in the domain's own plain words, never an internal detail", async () => {
    const w = writer({ fail: { r1: new Error("duplicate key value violates unique constraint obligations_pkey") } });
    const receipt = await applyDocumentPlan(plan([entry("r1", "create", { domain: "bill" })]), new Set(["r1"]), w, { intakeId: "intake" });
    expect(receipt.status).toBe("failed");
    expect(receipt.changes[0]?.error).toBe("Bills did not accept it.");
  });

  it("a write that could not be recorded for undo is still reported as written, with the reason", async () => {
    const receipt = await applyDocumentPlan(plan([entry("r1", "create")]), new Set(["r1"]), writer({ recordFails: ["r1"] }), { intakeId: "intake" });
    expect(receipt.changes[0]).toMatchObject({ action: "created", changeId: null });
    expect(receipt.changes[0]?.error).toMatch(/could not be recorded for undo/);
  });

  it("done with a question still open says so — never folded into 'all done'", async () => {
    const receipt = await applyDocumentPlan(plan([entry("r1", "create"), entry("r2", "needs_answer", { question: { text: "Who is it for?", options: [] } })]), new Set(["r1"]), writer(), { intakeId: "intake" });
    expect(receipt.status).toBe("completed");
    expect(receiptHeadline(receipt)).toBe("1 change applied, 1 waiting on your answer");
  });

  it("nothing new is a successful outcome in its own words (§27, §42)", async () => {
    const receipt = await applyDocumentPlan(plan([entry("r1", "no_change")]), new Set(), writer(), { intakeId: "intake" });
    expect(receipt.status).toBe("no_change");
    expect(receiptHeadline(receipt)).toBe("Nothing new found");
    expect(receiptText(receipt)).toBe("Nothing new found. No records changed.");
  });
});

describe("the receipt in words (§32)", () => {
  it("says what was updated, created and already on record, and that nothing else changed", async () => {
    const receipt = await applyDocumentPlan(
      plan([
        entry("r1", "update", { title: "Annual Day", changes: [MOVE], existing: { id: "annual", title: "Annual Day", date: "2026-10-12" } }),
        entry("r2", "create", { title: "Rehearsal · 10 Oct" }),
        entry("r3", "no_change", { title: "₹500 contribution" }),
      ]),
      new Set(["r1", "r2"]),
      writer(),
      { intakeId: "intake" },
    );
    expect(receiptText(receipt)).toBe(
      ["Done.", "", "Updated:", "• Annual Day — 12 Oct → 15 Oct", "", "Created:", "• Rehearsal · 10 Oct", "", "Already on record:", "• ₹500 contribution", "", "Nothing else was changed."].join("\n"),
    );
  });
});
