import { describe, expect, it } from "vitest";

import type { HouseholdRule } from "./rules";
import { MAX_CONFLICTS, planVerification, type VerifyEntry } from "./verify-night";

const now = new Date("2026-11-14T22:00:00Z");
let n = 0;
function entry(over: Partial<VerifyEntry>): VerifyEntry {
  n += 1;
  return {
    changeId: `c${n}`,
    itemId: `i${n}`,
    kind: "bill",
    title: "electricity",
    label: "Electricity",
    date: "2026-11-20",
    time: null,
    amount: 1200,
    payee: "BESCOM",
    sender: null,
    subjectMemberId: null,
    createdByMemberId: "mum",
    contentHash: null,
    unconfirmed: false,
    createdAt: "2026-11-14T10:00:00Z",
    ...over,
  };
}
const names = new Map([["anya", "Anya"], ["kabir", "Kabir"]]);
const plan = (entries: VerifyEntry[], extra: Partial<Parameters<typeof planVerification>[0]> = {}) =>
  planVerification({ entries, sources: [], rules: [], names, alreadyRaised: new Set(), now, ...extra });

describe("nightly verification: conflicts", () => {
  it("raises a duplicate on the later copy, defaulting to keep both", () => {
    const first = entry({ createdAt: "2026-11-14T08:00:00Z" });
    const copy = entry({ createdAt: "2026-11-14T09:00:00Z" });
    const { conflicts } = plan([first, copy]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ reason: "duplicate", changeId: copy.changeId, itemId: copy.itemId, otherChangeId: first.changeId, defaultAnswerId: "keep" });
    // Only a person's tap removes the copy; the default keeps both.
    expect(conflicts[0]!.answers.find((answer) => answer.id === "remove")?.action).toBe("undo_this");
    expect(conflicts[0]!.answers.find((answer) => answer.id === conflicts[0]!.defaultAnswerId)?.action).toBe("keep");
  });
  it("a grocery said twice is a top-up, not a duplicate", () => {
    expect(plan([entry({ kind: "grocery_item", amount: null, title: "milk", label: "Milk" }), entry({ kind: "grocery_item", amount: null, title: "milk", label: "Milk" })]).conflicts).toEqual([]);
  });
  it("raises a date clash for the same child at the same time, defaulting to keep both", () => {
    const a = entry({ kind: "event", title: "swim", label: "Swimming", time: "16:00", subjectMemberId: "anya", amount: null, createdAt: "2026-11-13T08:00:00Z" });
    const b = entry({ kind: "school_item", title: "ptm", label: "PTM", time: "16:00", subjectMemberId: "anya", amount: null });
    const { conflicts } = plan([a, b]);
    expect(conflicts.map((c) => c.reason)).toEqual(["date_clash"]);
    expect(conflicts[0]!.defaultAnswerId).toBe("keep");
    expect(conflicts[0]!.question).toContain("Anya");
  });
  it("raises an unusual amount without saying it", () => {
    const history = [1100, 1200, 1250].map((amount, index) => entry({ amount, date: `2026-0${7 + index}-20`, createdAt: `2026-0${7 + index}-21T00:00:00Z` }));
    const odd = entry({ amount: 9800, date: "2026-11-20" });
    const { conflicts } = plan([...history, odd]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ reason: "unusual_amount", defaultAnswerId: "keep" });
    expect(conflicts[0]!.question).not.toMatch(/\d/);
  });
  it("raises a sender that doesn't match what the household taught", () => {
    const taught: HouseholdRule = { id: "r", kind: "sender_child", key: "sender:class2@lakeside.edu", valueMemberId: "kabir", valueText: null, learnedByMemberId: "mum", learnedFromItemId: null, learnedAt: "2026-11-01", mixed: false, source: "answer", times: 2 };
    const odd = entry({ kind: "school_item", title: "ptm", label: "PTM", amount: null, sender: "class2@lakeside.edu", subjectMemberId: "anya" });
    const { conflicts } = plan([odd], { rules: [taught] });
    expect(conflicts[0]).toMatchObject({ reason: "sender_mismatch", defaultAnswerId: "keep" });
  });
  it("never asks twice, and never more than the nightly cap", () => {
    const first = entry({ createdAt: "2026-11-14T08:00:00Z" });
    const copy = entry({ createdAt: "2026-11-14T09:00:00Z" });
    expect(plan([first, copy], { alreadyRaised: new Set([copy.changeId]) }).conflicts).toEqual([]);
    const many = Array.from({ length: 12 }, (_, index) => entry({ title: `t${index % 6}`, label: `T${index % 6}`, createdAt: `2026-11-14T0${Math.floor(index / 6)}:${10 + index}:00Z` }));
    expect(plan(many).conflicts.length).toBeLessThanOrEqual(MAX_CONFLICTS);
  });
  it("leaves older entries alone", () => {
    expect(plan([entry({ createdAt: "2026-11-01T00:00:00Z" }), entry({ createdAt: "2026-11-02T00:00:00Z" })]).conflicts).toEqual([]);
  });
});

describe("nightly verification: confirming Checking entries", () => {
  it("a second source sent separately confirms it", () => {
    const checking = entry({ unconfirmed: true, contentHash: "a" });
    const { confirm } = plan([checking], { sources: [{ itemId: "other", kind: "bill", title: "Electricity", date: "2026-11-20", amount: 1200, payee: "BESCOM", contentHash: "b" }] });
    expect(confirm).toEqual([expect.objectContaining({ changeId: checking.changeId, basis: "second_source" })]);
  });
  it("the same bytes sent twice are not a second source", () => {
    const checking = entry({ unconfirmed: true, contentHash: "same" });
    expect(plan([checking], { sources: [{ itemId: "other", kind: "bill", title: "Electricity", date: "2026-11-20", amount: 1200, payee: "BESCOM", contentHash: "same" }] }).confirm).toEqual([]);
  });
  it("a bill matching the payee's kept pattern is confirmed as recurring", () => {
    const kept = [entry({ amount: 1150, date: "2026-09-19", createdAt: "2026-09-10T00:00:00Z" }), entry({ amount: 1250, date: "2026-10-21", createdAt: "2026-10-10T00:00:00Z" })];
    const checking = entry({ amount: 1210, date: "2026-11-20", unconfirmed: true, createdAt: "2026-11-01T00:00:00Z" });
    expect(plan([...kept, checking]).confirm).toEqual([expect.objectContaining({ changeId: checking.changeId, basis: "recurring" })]);
  });
  it("an amount off the pattern stays Checking", () => {
    const kept = [entry({ amount: 1150, date: "2026-09-19", createdAt: "2026-09-10T00:00:00Z" }), entry({ amount: 1250, date: "2026-10-21", createdAt: "2026-10-10T00:00:00Z" })];
    expect(plan([...kept, entry({ amount: 2000, unconfirmed: true, createdAt: "2026-11-01T00:00:00Z" })]).confirm).toEqual([]);
  });
  it("a grocery kept twice before is confirmed", () => {
    const g = (over: Partial<VerifyEntry>) => entry({ kind: "grocery_item", title: "milk", label: "Milk", amount: null, payee: null, ...over });
    const checking = g({ unconfirmed: true, createdAt: "2026-11-10T00:00:00Z" });
    expect(plan([g({ createdAt: "2026-10-01T00:00:00Z" }), g({ createdAt: "2026-10-15T00:00:00Z" }), checking]).confirm.map((c) => c.changeId)).toEqual([checking.changeId]);
  });
  it("never confirms a health document", () => {
    const checking = entry({ kind: "health_document", unconfirmed: true, amount: null, payee: null, title: "blood report", label: "Blood report" });
    expect(plan([checking], { sources: [{ itemId: "other", kind: "health_document", title: "Blood report", date: "2026-11-20", amount: null, payee: null, contentHash: null }] }).confirm).toEqual([]);
  });
});

describe("nightly verification: confirmed by evidence and action (2026-11-20 review)", () => {
  it("confirms a Checking bill its payee sent a matching receipt for", () => {
    const bill = entry({ unconfirmed: true, payee: "Airtel", title: "broadband", label: "Broadband", amount: 999, date: "2026-11-25" });
    const { confirm } = plan([bill], { sources: [{ itemId: "r1", kind: "receipt", title: "Airtel receipt", date: "2026-11-21", amount: 999, payee: "Airtel Ltd", contentHash: null }] });
    expect(confirm).toEqual([expect.objectContaining({ changeId: bill.changeId, basis: "receipt" })]);
  });

  it("never takes a receipt for a different amount or payee as proof", () => {
    const bill = entry({ unconfirmed: true, payee: "Airtel", title: "broadband", label: "Broadband", amount: 999, date: "2026-11-25" });
    expect(plan([bill], { sources: [{ itemId: "r1", kind: "receipt", title: "x", date: "2026-11-21", amount: 1499, payee: "Airtel", contentHash: null }] }).confirm).toEqual([]);
    expect(plan([bill], { sources: [{ itemId: "r2", kind: "receipt", title: "x", date: "2026-11-21", amount: 999, payee: "Jio", contentHash: null }] }).confirm).toEqual([]);
  });

  it("confirms a non-health Checking entry once its day has passed with no correction and no conflict", () => {
    const school = entry({ kind: "school_item", unconfirmed: true, title: "sports day", label: "Sports Day", amount: null, payee: null, date: "2026-11-10" });
    expect(plan([school]).confirm).toEqual([expect.objectContaining({ changeId: school.changeId, basis: "due_passed" })]);
    // Not yet passed, corrected, or with a conflict raised about it: left Checking.
    expect(plan([{ ...school, date: "2026-11-20" }]).confirm).toEqual([]);
    expect(plan([{ ...school, corrected: true }]).confirm).toEqual([]);
    expect(plan([school], { alreadyRaised: new Set([school.changeId]) }).confirm).toEqual([]);
  });

  it("never confirms a health document by its day passing", () => {
    const health = entry({ kind: "health_document", unconfirmed: true, title: "blood test", label: "Blood test", amount: null, payee: null, date: "2026-11-01" });
    expect(plan([health]).confirm).toEqual([]);
  });

  it("asks the unusual-amount question about a payment that disagrees with its bill, without saying an amount", () => {
    const payment = entry({ unconfirmed: true, title: "paid to bescom", label: "Paid to BESCOM", amount: 4500, date: "2026-11-14", paymentConflictWith: "Electricity" });
    const { conflicts, confirm } = plan([payment]);
    expect(conflicts).toEqual([expect.objectContaining({ reason: "unusual_amount", changeId: payment.changeId, defaultAnswerId: "keep" })]);
    expect(conflicts[0]!.question).not.toMatch(/\d{3,}/);
    expect(confirm).toEqual([]);
  });
});
