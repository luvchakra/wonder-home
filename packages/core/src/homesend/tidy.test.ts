import { describe, expect, it } from "vitest";

import type { HomeSendReconciliation } from "./reconcile";
import { checkVerdict, countByGroup, decideByRules, isPastWithGrace, itemDays, tidyFacts, type TidyItem, type TidyVerdict } from "./tidy";

const NOW = new Date("2026-11-03T06:00:00Z");
const TODAY = "2026-11-03";
const ZONE = "Asia/Kolkata";

function item(over: Partial<TidyItem> = {}): TidyItem {
  return {
    id: "i1",
    status: "classified",
    kind: "school_item",
    extracted: { title: "Sports day", dueDate: null },
    understanding: { contentSummary: "", change: "new" },
    sender: "member:upasana",
    memberId: "upasana",
    createdAt: "2026-10-20T05:00:00Z",
    updatedAt: "2026-10-20T05:00:00Z",
    failureReason: null,
    retryCount: 0,
    retryRequestedAt: null,
    ...over,
  };
}

const duplicate = { proposal: { type: "duplicate" }, existingId: "rec-1" } as unknown as HomeSendReconciliation;
const update = { proposal: { type: "update", changes: [] }, existingId: "rec-1" } as unknown as HomeSendReconciliation;
const rules = (it: TidyItem, over: { reconciliation?: HomeSendReconciliation | null; others?: TidyItem[] } = {}) =>
  decideByRules(it, { today: TODAY, timeZone: ZONE, now: NOW, others: [], ...over });

describe("the day an item is about", () => {
  it("counts as past only after a day's grace, on the household's calendar", () => {
    expect(isPastWithGrace("2026-11-01", TODAY)).toBe(true);
    expect(isPastWithGrace("2026-11-02", TODAY)).toBe(false);
    expect(isPastWithGrace("2026-11-03", TODAY)).toBe(false);
  });

  it("reads a due date, every dated record of a document, never a grocery's date", () => {
    expect(itemDays(item({ extracted: { dueDate: "2026-10-30T09:00:00Z" } }))).toEqual(["2026-10-30"]);
    expect(itemDays(item({ kind: "grocery_item", extracted: { dueDate: "2026-10-30" } }))).toEqual([]);
    const document = { pages: { total: 1, read: 1, unreadable: [] }, issuedOn: null, records: [{ domain: "school_item", date: "2026-10-01" }, { domain: "event", date: "2026-11-20" }] } as never;
    expect(itemDays(item({ understanding: { contentSummary: "", change: "new", document } }))).toEqual(["2026-10-01", "2026-11-20"]);
  });
});

describe("rules first, from evidence", () => {
  it("archives a school notice whose day has passed", () => {
    expect(rules(item({ extracted: { title: "Sports day", dueDate: "2026-10-30" } }))).toMatchObject({ action: "archive", reason: "past_date", by: "rule" });
  });

  it("keeps one whose day is still ahead, or within the grace day, and never asks the model", () => {
    expect(rules(item({ extracted: { title: "Sports day", dueDate: "2026-11-20" } }))).toEqual({ action: "keep", why: "future_date", askAi: false });
    expect(rules(item({ extracted: { title: "Sports day", dueDate: "2026-11-02" } }))).toEqual({ action: "keep", why: "future_date", askAi: false });
  });

  it("keeps a document while any of its days is still ahead", () => {
    const document = { pages: { total: 1, read: 1, unreadable: [] }, issuedOn: null, records: [{ domain: "school_item", date: "2026-10-01" }, { domain: "event", date: "2026-11-20" }] } as never;
    expect(rules(item({ understanding: { contentSummary: "", change: "new", document } }))).toMatchObject({ action: "keep", why: "future_date" });
  });

  it("archives what is already on record, keeps an update or a conflict for a person", () => {
    expect(rules(item({ kind: "grocery_item", extracted: { title: "Milk" } }), { reconciliation: duplicate })).toMatchObject({ action: "archive", reason: "already_recorded" });
    expect(rules(item({ kind: "grocery_item", extracted: { title: "Milk" } }), { reconciliation: update })).toEqual({ action: "keep", why: "needs_person", askAi: false });
  });

  it("archives the older of two from the same sender about the same thing", () => {
    const newer = item({ id: "i2", extracted: { title: "Sports Day!" }, createdAt: "2026-10-25T05:00:00Z" });
    expect(rules(item(), { others: [newer] })).toMatchObject({ action: "archive", reason: "superseded", evidence: [{ field: "newer", value: "i2" }] });
    // Not from someone else, not of another kind, not an older one.
    expect(rules(item(), { others: [{ ...newer, sender: "member:kunal" }] })).toMatchObject({ action: "keep" });
    expect(rules(item(), { others: [{ ...newer, kind: "event" }] })).toMatchObject({ action: "keep" });
    expect(rules(item({ createdAt: "2026-10-26T05:00:00Z" }), { others: [newer] })).toMatchObject({ action: "keep" });
  });

  it("archives a failed item only once every try is spent", () => {
    expect(rules(item({ status: "failed", retryCount: 5 }))).toMatchObject({ action: "archive", reason: "unreadable" });
    expect(rules(item({ status: "failed", retryCount: 2 }))).toEqual({ action: "keep", why: "retry_left", askAi: false });
    expect(rules(item({ status: "failed", retryCount: 5, retryRequestedAt: NOW.toISOString() }))).toMatchObject({ action: "keep" });
  });
});

describe("bills, receipts and health documents: only past AND already recorded", () => {
  const bill = (dueDate: string) => item({ kind: "bill", extracted: { title: "Electricity bill", payee: "BESCOM", amount: 2140, dueDate } });

  it("keeps a past bill nobody recorded, and a recorded one still ahead", () => {
    expect(rules(bill("2026-10-05"))).toEqual({ action: "keep", why: "money_or_health", askAi: false });
    expect(rules(bill("2026-11-20"), { reconciliation: duplicate })).toEqual({ action: "keep", why: "money_or_health", askAi: false });
  });

  it("archives a past bill already on record", () => {
    expect(rules(bill("2026-10-05"), { reconciliation: duplicate })).toMatchObject({ action: "archive", reason: "already_recorded", by: "rule" });
  });

  it("keeps a receipt and a health document unless both hold, and never asks the model", () => {
    expect(rules(item({ kind: "receipt", extracted: { title: "Groceries", documentDate: "2026-09-01" } }))).toEqual({ action: "keep", why: "money_or_health", askAi: false });
    expect(rules(item({ kind: "health_document", extracted: { title: "Blood test", documentDate: "2026-09-01" } }))).toEqual({ action: "keep", why: "money_or_health", askAi: false });
    expect(rules(item({ kind: "health_document", extracted: { title: "Blood test", documentDate: "2026-09-01" } }), { reconciliation: duplicate })).toMatchObject({ action: "archive", reason: "already_recorded" });
    // Superseded never applies to money.
    const newer = bill("2026-10-05");
    expect(rules(bill("2026-11-20"), { others: [{ ...newer, id: "i2", createdAt: "2026-10-25T05:00:00Z" }] })).toMatchObject({ action: "keep" });
  });
});

describe("entries added as Checking whose questions ended", () => {
  const ended = { version: 1, recipientMemberId: "upasana", base: 0.9, percent: 95, planned: [], answered: [], open: null, done: "please_check" };
  const routed = (over: Partial<TidyItem> = {}) => item({ status: "routed", unconfirmed: true, checking: ended, extracted: { title: "Sports day", dueDate: "2026-10-30" }, ...over });

  it("archives the source item once its day has passed", () => {
    expect(rules(routed())).toMatchObject({ action: "archive", reason: "past_date" });
  });

  it("keeps it while still asking, once confirmed, while its day is ahead, or for money", () => {
    expect(rules(routed({ checking: { ...ended, done: null, open: { field: "title", mode: "confirm", ordinal: 1 } } }))).toMatchObject({ action: "keep" });
    expect(rules(routed({ unconfirmed: false }))).toMatchObject({ action: "keep" });
    expect(rules(routed({ extracted: { title: "Sports day", dueDate: "2026-11-20" } }))).toMatchObject({ action: "keep", why: "future_date" });
    expect(rules(routed({ kind: "bill" }))).toMatchObject({ action: "keep", why: "money_or_health" });
  });
});

describe("what is left for the model", () => {
  it("is only a waiting item with no day, that has waited two days, with words to go on", () => {
    expect(rules(item({ extracted: { title: "Bring a costume", dateText: "next Friday" } }))).toEqual({ action: "keep", why: "nothing_to_go_on", askAi: true });
    expect(rules(item({ createdAt: "2026-11-02T20:00:00Z", extracted: { title: "Bring a costume" } }))).toEqual({ action: "keep", why: "too_fresh", askAi: false });
    expect(rules(item({ kind: "bill", extracted: { title: "Bill" } }))).toMatchObject({ askAi: false });
  });
});

describe("a model's verdict counts only once checked against the item", () => {
  const subject = item({ extracted: { title: "Sports day", dateText: "Sports day on 5th October 2026" } });
  const facts = tidyFacts(subject);
  const check = (verdict: Partial<TidyVerdict>, over: { it?: TidyItem; reconciliation?: HomeSendReconciliation | null; newer?: Map<string, string> } = {}) =>
    checkVerdict({ item: "T1", stale: true, reason: "past_date", cited: ["dateText"], date: "2026-10-05", newer: null, ...verdict }, over.it ?? subject, {
      today: TODAY,
      facts: tidyFacts(over.it ?? subject),
      newerLabels: over.newer ?? new Map(),
      reconciliation: over.reconciliation ?? null,
    });

  it("shows only the item's own fields", () => {
    expect(facts.map((fact) => fact.id)).toEqual(["title", "dateText", "sent"]);
  });

  it("accepts a past day written in what it cites", () => {
    expect(check({})).toEqual({ ok: true, reason: "past_date", evidence: [{ field: "dateText", value: "2026-10-05" }] });
  });

  it("rejects a day the item never wrote", () => {
    expect(check({ date: "2026-10-06" })).toEqual({ ok: false, why: "unsupported_date" });
    expect(check({ date: "5 Oct" })).toEqual({ ok: false, why: "unsupported_date" });
  });

  it("rejects a field that was never shown, citing nothing, or citing only when it was sent", () => {
    expect(check({ cited: ["body"] })).toEqual({ ok: false, why: "unknown_field" });
    expect(check({ cited: [] })).toEqual({ ok: false, why: "nothing_cited" });
    const sentOnly = item({ createdAt: "2026-10-05T05:00:00Z", extracted: { title: "Sports day" } });
    expect(check({ cited: ["sent"] }, { it: sentOnly })).toEqual({ ok: false, why: "unsupported_date" });
  });

  it("rejects a day that is not past, or a year the item does not say", () => {
    const ahead = item({ extracted: { title: "Annual day", dateText: "Annual day on 20 November 2026" } });
    expect(check({ date: "2026-11-20" }, { it: ahead })).toEqual({ ok: false, why: "not_past" });
    expect(check({ date: "2025-10-05" })).toEqual({ ok: false, why: "wrong_year" });
    const noYear = item({ createdAt: "2026-09-28T05:00:00Z", extracted: { title: "Sports day", dateText: "on 5th October" } });
    expect(check({ date: "2025-10-05" }, { it: noYear })).toEqual({ ok: false, why: "wrong_year" });
    expect(check({ date: "2026-10-05" }, { it: noYear })).toMatchObject({ ok: true });
  });

  it("superseded needs a newer item it was shown", () => {
    expect(check({ reason: "superseded", cited: [], date: null, newer: "N1.1" })).toEqual({ ok: false, why: "unknown_newer" });
    expect(check({ reason: "superseded", cited: [], date: null, newer: "N1.1" }, { newer: new Map([["N1.1", "i9"]]) })).toEqual({ ok: true, reason: "superseded", evidence: [{ field: "newer", value: "i9" }] });
  });

  it("cancelled needs the item to say so, and nothing on record to cancel", () => {
    const off = item({ extracted: { title: "Swimming class", notes: "Saturday's class is cancelled" } });
    expect(check({ reason: "cancelled", cited: ["notes"], date: null }, { it: off })).toMatchObject({ ok: true, reason: "cancelled" });
    expect(check({ reason: "cancelled", cited: ["title"], date: null }, { it: off })).toEqual({ ok: false, why: "not_cancelled" });
    expect(check({ reason: "cancelled", cited: ["notes"], date: null }, { it: off, reconciliation: duplicate })).toEqual({ ok: false, why: "on_record" });
  });

  it("keeps on 'still applies', an unknown reason, and any money or health item", () => {
    expect(check({ stale: false })).toEqual({ ok: false, why: "kept" });
    expect(check({ reason: "duplicate" })).toEqual({ ok: false, why: "unknown_reason" });
    expect(check({}, { it: { ...subject, kind: "bill" } })).toEqual({ ok: false, why: "money_or_health" });
  });
});

describe("the day's summary", () => {
  it("groups reasons in a fixed order", () => {
    expect(countByGroup([{ reason: "superseded" }, { reason: "past_date" }, { reason: "past_date" }, { reason: "already_recorded" }])).toEqual([
      { group: "past", count: 2 },
      { group: "duplicate", count: 1 },
      { group: "superseded", count: 1 },
    ]);
  });
});
