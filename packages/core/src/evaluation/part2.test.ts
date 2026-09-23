import { describe, expect, it } from "vitest";

import { approvalRefusal, checkApproval, proposalFingerprint } from "../conversation/approval";
import { homebrainCorrectionEvidence, homesendCorrectionEvidence, hometalkCorrectionEvidence } from "./evidence";
import { summarizeProduction, type ActionRow, type ReplyRow } from "./production";

const NOW = new Date("2026-09-23T10:00:00Z");
const bill = (amount: number) => ({ actionType: "make_payment", outcomeKey: "electricity", parameters: { billName: "Electricity", amount, currency: "INR" } });

describe("approval binding (Wave 5 §20)", () => {
  it("a fingerprint is stable across key order and changes with any detail", () => {
    const a = proposalFingerprint({ actionType: "make_payment", outcomeKey: "electricity", parameters: { amount: 2840, billName: "Electricity" } });
    const b = proposalFingerprint({ actionType: "make_payment", outcomeKey: "electricity", parameters: { billName: "Electricity", amount: 2840 } });
    expect(a).toBe(b);
    expect(a).toMatch(/^fp-[0-9a-f]{16}$/);
    expect(proposalFingerprint(bill(3100))).not.toBe(proposalFingerprint(bill(2840)));
    expect(proposalFingerprint({ ...bill(2840), outcomeKey: "internet" })).not.toBe(proposalFingerprint(bill(2840)));
    expect(proposalFingerprint({ ...bill(2840), parameters: { ...bill(2840).parameters, memberId: "m-2" } })).not.toBe(proposalFingerprint(bill(2840)));
  });

  it("the spec's example: ₹2,840 approved, the proposal became ₹3,100 — rejected as stale", () => {
    const shown = proposalFingerprint(bill(2840));
    const stored = { ...bill(3100), fingerprint: proposalFingerprint(bill(3100)), createdAt: new Date(NOW.getTime() - 60_000) };
    expect(checkApproval({ stored, seen: shown, now: NOW, ttlMinutes: 10 })).toEqual({ ok: false, reason: "stale" });
  });

  it("a proposal altered after it was recorded is rejected as changed, whatever the client sent", () => {
    const stored = { ...bill(3100), fingerprint: proposalFingerprint(bill(2840)), createdAt: new Date(NOW.getTime() - 60_000) };
    expect(checkApproval({ stored, seen: null, now: NOW, ttlMinutes: 10 })).toEqual({ ok: false, reason: "changed" });
    expect(checkApproval({ stored, seen: proposalFingerprint(bill(2840)), now: NOW, ttlMinutes: 10 })).toEqual({ ok: false, reason: "changed" });
  });

  it("an approval past the time limit is expired, even for the exact proposal", () => {
    const stored = { ...bill(2840), fingerprint: proposalFingerprint(bill(2840)), createdAt: new Date(NOW.getTime() - 11 * 60_000) };
    expect(checkApproval({ stored, seen: proposalFingerprint(bill(2840)), now: NOW, ttlMinutes: 10 })).toEqual({ ok: false, reason: "expired" });
  });

  it("the exact proposal, in time, is honoured", () => {
    const stored = { ...bill(2840), fingerprint: proposalFingerprint(bill(2840)), createdAt: new Date(NOW.getTime() - 60_000) };
    expect(checkApproval({ stored, seen: proposalFingerprint(bill(2840)), now: NOW, ttlMinutes: 10 })).toEqual({ ok: true });
    // A "yes" said aloud carries no fingerprint; the stored one still has to hold.
    expect(checkApproval({ stored, seen: null, now: NOW, ttlMinutes: 10 })).toEqual({ ok: true });
  });

  it("a proposal recorded before fingerprints existed still binds to what the person saw", () => {
    const stored = { ...bill(2840), fingerprint: null, createdAt: new Date(NOW.getTime() - 60_000) };
    expect(checkApproval({ stored, seen: null, now: NOW, ttlMinutes: 10 })).toEqual({ ok: true });
    expect(checkApproval({ stored, seen: proposalFingerprint(bill(3100)), now: NOW, ttlMinutes: 10 })).toEqual({ ok: false, reason: "stale" });
  });

  it("the person is told nothing ran, and what to do", () => {
    for (const reason of ["expired", "changed", "stale"] as const) {
      expect(approvalRefusal(reason)).toMatch(/I have not done it/);
      expect(approvalRefusal(reason)).toMatch(/Ask again/);
    }
  });
});

describe("corrections as evidence (Wave 5 §13)", () => {
  const subject = (parameters: Record<string, unknown>, actionType = "record_absence", outcomeKey: string | null = null) => ({
    actionId: "a-1",
    actionType,
    outcomeKey,
    parameters,
    status: "executed" as const,
    result: null,
  });

  it("the spec's example: Asmi, when the person meant Manan, is an entity error", () => {
    const evidence = hometalkCorrectionEvidence(subject({ memberId: "m-asmi", memberName: "Asmi", when: "today" }), {
      parameters: { memberId: "m-manan", memberName: "Manan", when: "today" },
      target: { kind: "member", reference: "manan" },
    });
    expect(evidence).toEqual([{ field: "memberName", modelValue: "Asmi", humanValue: "Manan", errorType: "false_entity_match" }]);
  });

  it("not milk, almond milk is the wrong item; make that Friday is the wrong date", () => {
    expect(
      hometalkCorrectionEvidence(subject({ item: "milk" }, "add_to_list", "groceries"), { parameters: { item: "almond milk" }, target: { kind: "list", reference: "groceries" } }),
    ).toEqual([{ field: "item", modelValue: "milk", humanValue: "almond milk", errorType: "wrong_item" }]);
    expect(
      hometalkCorrectionEvidence(subject({ memberName: "Asmi", memberId: "m-asmi", when: "Thursday" }), {
        parameters: { memberName: "Asmi", memberId: "m-asmi", when: "Friday" },
        target: { kind: "member", reference: "asmi" },
      }),
    ).toEqual([{ field: "when", modelValue: "Thursday", humanValue: "Friday", errorType: "wrong_date" }]);
  });

  it("a correction that changed nothing is no evidence", () => {
    expect(hometalkCorrectionEvidence(subject({ item: "milk" }, "add_to_list"), { parameters: { item: "Milk" }, target: { kind: "list" } })).toEqual([]);
  });

  it("HomeSend: each field the person fixed before confirming, in closed words", () => {
    const evidence = homesendCorrectionEvidence(
      { kind: "bill", title: "Electricity", date: "2026-09-25", amount: 2480, quantity: null },
      { kind: "bill", title: "Electricity", date: "2026-09-26", amount: 2840, quantity: null },
    );
    expect(evidence.map((entry) => [entry.field, entry.errorType])).toEqual([
      ["date", "wrong_date"],
      ["amount", "wrong_amount"],
    ]);
    expect(
      homesendCorrectionEvidence({ kind: "grocery_item", title: "Science kit", date: null, amount: null, quantity: null }, { kind: "school_item", title: "Science kit", date: null, amount: null, quantity: null }),
    ).toEqual([{ field: "kind", modelValue: "grocery_item", humanValue: "school_item", errorType: "wrong_classification" }]);
  });

  it("HomeBrain Review: a corrected belief is a wrong fact", () => {
    expect(homebrainCorrectionEvidence("Asmi dislikes mushrooms", "Asmi is fine with mushrooms now")).toEqual([
      { field: "claim", modelValue: "Asmi dislikes mushrooms", humanValue: "Asmi is fine with mushrooms now", errorType: "wrong_fact" },
    ]);
  });

  it("a value is never stored longer than 200 characters", () => {
    const [entry] = homebrainCorrectionEvidence("a".repeat(500), "b".repeat(500));
    expect(entry!.modelValue).toHaveLength(200);
    expect(entry!.humanValue).toHaveLength(200);
  });
});

describe("production metrics (Wave 5 §23)", () => {
  const reply = (extra: Partial<ReplyRow>): ReplyRow => ({ proposal: "answer", mode: "answer", understanding: "rules", failure: null, brain: null, rejected: null, ...extra });
  const action = (extra: Partial<ActionRow>): ActionRow => ({ action_type: "add_to_list", approval_status: "executed", kind: "executed", reason: null, ...extra });

  it("counts every figure out of what it is measured against", () => {
    const metrics = summarizeProduction(
      [
        reply({ understanding: "model" }),
        reply({ understanding: "rules", failure: "provider_error" }),
        reply({ mode: "clarify", proposal: "clarify" }),
        reply({ brain: "model" }),
        reply({ brain: "not_on_record" }),
        reply({ brain: "deterministic", rejected: ["unsupported_name"] }),
        reply({ proposal: null, brain: null }),
      ],
      [
        action({}),
        action({ approval_status: "failed" }),
        action({ action_type: "make_payment", approval_status: "executed", kind: "approval" }),
        action({ action_type: "make_payment", approval_status: "expired", kind: "approval", reason: "approval_stale" }),
        action({ approval_status: "proposed", kind: "approval" }),
      ],
      [
        { surface: "hometalk", error_type: "false_entity_match", source_id: "x" },
        { surface: "hometalk", error_type: "wrong_date", source_id: "x" },
        { surface: "homesend", error_type: "wrong_amount", source_id: "y" },
      ],
      { windowDays: 30, homesendRouted: 4 },
    );
    expect(metrics.outcomesHandled).toEqual({ hometalk: 2, homesend: 4 });
    expect(metrics.modelUnderstanding).toEqual({ count: 1, of: 6 });
    expect(metrics.providerFailures).toEqual({ provider_error: 1 });
    expect(metrics.clarification).toEqual({ count: 1, of: 6 });
    expect(metrics.homeTalkUpdateSuccess).toEqual({ count: 2, of: 3 });
    expect(metrics.homeBrainGrounded).toEqual({ count: 2, of: 3 });
    expect(metrics.homeBrainValidationRefusals).toEqual({ count: 1, of: 3 });
    expect(metrics.hometalkCorrection).toEqual({ count: 1, of: 5 });
    expect(metrics.corrections).toEqual({ hometalk: { false_entity_match: 1, wrong_date: 1 }, homesend: { wrong_amount: 1 } });
    expect(metrics.approvalsRefused).toEqual({ expired: 0, changed: 0, stale: 1 });
    expect(metrics.unsafeActions).toEqual({ count: 0, of: 1 });
  });

  it("a consequential action carried out with no approval step is counted unsafe", () => {
    const metrics = summarizeProduction([], [action({ action_type: "make_payment", kind: "executed" })], [], { windowDays: 30, homesendRouted: 0 });
    expect(metrics.unsafeActions).toEqual({ count: 1, of: 1 });
  });
});
