import { describe, expect, it } from "vitest";

import type { HouseholdContextItem } from "../context/types";
import type { HomeSendExtraction } from "../homesend/items";
import type { IntakePerson } from "./intake/resolve";
import { fillFromHistory, nextOnDay, usualBill } from "./history-fill";
import { childrenAtSchool, resolveGaps, usable } from "./memory-resolve";
import type { HouseholdRule } from "./rules";
import { fillSubject } from "./subject-fill";

function item(entityType: string, entityId: string, attributes: Record<string, unknown>, extra: Partial<HouseholdContextItem> = {}): HouseholdContextItem {
  return {
    id: `${entityType}:${entityId}`,
    householdId: "h1",
    domain: "people",
    entityType,
    entityId,
    subjectMemberIds: [],
    summary: "",
    need: "",
    attributes,
    source: { type: "t", sourceId: entityId, capturedAt: null },
    evidence: [],
    confidence: 1,
    confirmed: true,
    privacyClass: "general",
    validFrom: null,
    validUntil: null,
    freshnessAt: "2026-11-01T00:00:00Z",
    freshness: "current",
    tier: 1,
    aliases: [String(attributes.displayName ?? attributes.title ?? "")],
    relatedEntityIds: [],
    authority: 3,
    ...extra,
  };
}

const anya = item("member", "anya", { displayName: "Anya Rao", memberType: "child", schoolNames: ["Greenwood High"], schoolGrades: ["5B"] });
const kabir = item("member", "kabir", { displayName: "Kabir Rao", memberType: "child", schoolNames: ["Greenwood High"], schoolGrades: ["2"] });
const meera = item("member", "meera", { displayName: "Meera Rao", memberType: "child", schoolNames: ["Lakeside School"] });
const bill = (id: string, dueOn: string | null, amountMinor: number | null, extra: Record<string, unknown> = {}) =>
  item("bill", id, { title: "Electricity", payee: "BESCOM Ltd.", kind: "electricity", amountMinor, currency: "INR", dueOn, status: "paid", ...extra });
const people = [anya, kabir, meera];
const person = (memberId: string, displayName: string): IntakePerson => ({ memberId, displayName, memberType: "child" });
const kids = [person("anya", "Anya Rao"), person("kabir", "Kabir Rao"), person("meera", "Meera Rao")];

const reading = (over: Partial<HomeSendExtraction>): HomeSendExtraction => ({
  title: "Electricity bill",
  notes: null,
  billKind: null,
  payee: null,
  amount: null,
  currency: null,
  dueDate: null,
  schoolKind: null,
  subject: null,
  quantity: null,
  unit: null,
  category: null,
  healthRecordType: null,
  documentDate: null,
  subjectMemberName: null,
  secondary: null,
  ...over,
});

const rule = (over: Partial<HouseholdRule>): HouseholdRule => ({
  id: "r1",
  kind: "sender_area",
  key: "sender:billing@bescom.in",
  valueMemberId: null,
  valueText: "bill",
  learnedByMemberId: null,
  learnedFromItemId: null,
  learnedAt: "2026-11-03T10:00:00Z",
  mixed: false,
  source: "answer",
  times: 1,
  ...over,
});

describe("decision 3: a bill's blanks from the payee's history", () => {
  it("takes the median amount and the usual day, and marks it Checking", () => {
    const items = [bill("b1", "2026-08-14", 120000), bill("b2", "2026-09-15", 140000), bill("b3", "2026-10-16", 130000)];
    const filled = fillFromHistory({ kind: "bill", extracted: reading({ payee: "Bescom" }), items, rules: [], receivedAt: "2026-11-02T08:00:00Z" });
    expect(filled.extracted?.amount).toBe(1300);
    expect(filled.extracted?.currency).toBe("INR");
    expect(filled.extracted?.dueDate).toBe("2026-11-15");
    expect(filled.checking).toBe(true);
    expect(filled.fields).toEqual(expect.arrayContaining(["amount", "date"]));
    // "Why?" is evidence, and never says the amount (it may reach WhatsApp).
    expect(filled.why.join(" ")).toMatch(/usual, from its last 3 bills/);
    expect(filled.why.join(" ")).not.toMatch(/1300|1,300|₹/);
  });

  it("keeps what the bill itself said", () => {
    const items = [bill("b1", "2026-08-14", 120000), bill("b2", "2026-09-15", 140000)];
    const filled = fillFromHistory({ kind: "bill", extracted: reading({ payee: "Bescom", amount: 999, currency: "INR", dueDate: "2026-11-20" }), items, rules: [], receivedAt: "2026-11-02T08:00:00Z" });
    expect(filled.extracted?.amount).toBe(999);
    expect(filled.extracted?.dueDate).toBe("2026-11-20");
    expect(filled.checking).toBe(false);
  });

  it("leaves it blank with no history, or with only one past bill", () => {
    const none = fillFromHistory({ kind: "bill", extracted: reading({ payee: "Airtel" }), items: [bill("b1", "2026-08-14", 120000)], rules: [], receivedAt: "2026-11-02T08:00:00Z" });
    expect(none.extracted?.amount).toBeNull();
    expect(none.checking).toBe(false);
    const one = fillFromHistory({ kind: "bill", extracted: reading({ payee: "Bescom" }), items: [bill("b1", "2026-08-14", 120000)], rules: [], receivedAt: "2026-11-02T08:00:00Z" });
    expect(one.extracted?.amount).toBeNull();
    expect(one.extracted?.dueDate).toBeNull();
  });

  it("counts paid months, and never mixes currencies", () => {
    const items = [bill("b1", "2026-10-05", 100000), item("bill_payment", "b1:2026-09", { amountMinor: 110000, currency: "INR" })];
    expect(usualBill("BESCOM", items, "2026-11-02")?.amount).toEqual({ value: 1050, currency: "INR", count: 2 });
    const mixed = [bill("b1", "2026-10-05", 100000), bill("b2", "2026-09-05", 100000, { currency: "USD" })];
    expect(usualBill("BESCOM", mixed, "2026-11-02")?.amount).toBeNull();
  });

  it("moves the usual day to next month when it has passed, inside short months", () => {
    expect(nextOnDay("2026-11-20", 15)).toBe("2026-12-15");
    expect(nextOnDay("2027-02-02", 31)).toBe("2027-02-28");
    expect(nextOnDay("2026-12-31", 5)).toBe("2027-01-05");
  });

  it("takes the payee from this sender's earlier bills, then its usual amount", () => {
    const items = [bill("b1", "2026-08-14", 120000), bill("b2", "2026-09-15", 140000)];
    const history = { children: [], payees: [{ name: "BESCOM Ltd.", itemId: "i1" }, { name: "Bescom", itemId: "i2" }] };
    const filled = fillFromHistory({ kind: "bill", extracted: reading({}), items, rules: [], sender: "billing@bescom.in", history, receivedAt: "2026-11-02T08:00:00Z" });
    expect(filled.extracted?.payee).toBe("BESCOM Ltd.");
    expect(filled.extracted?.amount).toBe(1300);
    expect(filled.why[0]).toMatch(/earlier bills from billing@bescom.in/);
  });

  it("does not take a payee when the sender's bills had two", () => {
    const history = { children: [], payees: [{ name: "BESCOM", itemId: "i1" }, { name: "Airtel", itemId: "i2" }] };
    expect(usable(resolveGaps({ kind: "bill", fields: ["payee"], sender: "x@y.in", history }, { items: [], rules: [] }), "payee")).toBeNull();
  });

  it("fills a bill's category and an unknown item's kind from rules", () => {
    const rules = [rule({}), rule({ id: "r2", kind: "vendor_category", key: "vendor:bescom", valueText: "electricity" })];
    const filled = fillFromHistory({ kind: "unknown", extracted: reading({ payee: "BESCOM" }), items: [], rules, sender: "billing@bescom.in", receivedAt: "2026-11-02T08:00:00Z" });
    expect(filled.kind).toBe("bill");
    expect(filled.extracted?.billKind).toBe("electricity");
    expect(filled.checking).toBe(false);
  });

  it("never fills anything for a health document", () => {
    const filled = fillFromHistory({ kind: "health_document", extracted: reading({ title: "Blood test" }), items: [bill("b1", null, 1), bill("b2", null, 1)], rules: [], receivedAt: "2026-11-02T08:00:00Z" });
    expect(filled.fields).toEqual([]);
  });

  it("names a grocery and a place the household's own way", () => {
    const items = [item("consumable", "c1", { title: "Atta (wheat flour)" }), item("place", "p1", { title: "Nani's house", status: "saved" })];
    const rules = [rule({ kind: "place_alias", key: "place:nani's", valueText: "Nani's house" })];
    expect(fillFromHistory({ kind: "grocery_item", extracted: reading({ title: "atta" }), items, rules: [], receivedAt: "2026-11-02T08:00:00Z" }).extracted?.title).toBe("Atta (wheat flour)");
    expect(fillFromHistory({ kind: "event", extracted: reading({ title: "Lunch", location: "nani's" }), items, rules, receivedAt: "2026-11-02T08:00:00Z" }).extracted?.location).toBe("Nani's house");
  });
});

describe("which child: class, teacher, timetable, the sender's notices", () => {
  const memory = (extra: HouseholdContextItem[] = []) => ({ items: [...people, ...extra], rules: [] as HouseholdRule[] });
  const who = (text: string, extra: HouseholdContextItem[] = [], history = null as null | { children: { memberId: string; itemId: string }[]; payees: [] }) =>
    usable(resolveGaps({ kind: "school_item", fields: ["person"], text, candidates: kids, sender: "office@greenwood.edu", history }, memory(extra)), "person");

  it("the class it names", () => {
    expect(who("Class 5B picnic on Friday")?.value.memberId).toBe("anya");
    expect(who("Grade 2 sports day")?.value.memberId).toBe("kabir");
    expect(who("Class 5 picnic")).toBeNull();
  });

  it("a teacher only one child has", () => {
    const timetable = item("timetable_day", "anya:1", { weekday: 1, subjects: ["Maths"], teachers: ["Mrs. Iyer"] }, { subjectMemberIds: ["anya"] });
    const filled = who("Note from Mrs. Iyer: bring a ruler", [timetable]);
    expect(filled?.value.memberId).toBe("anya");
    expect(filled?.basis).toBe("teacher_named");
  });

  it("a subject on only one child's timetable", () => {
    const a = item("timetable_day", "anya:1", { weekday: 1, subjects: ["Maths", "Sanskrit"] }, { subjectMemberIds: ["anya"] });
    const k = item("timetable_day", "kabir:1", { weekday: 1, subjects: ["Maths"] }, { subjectMemberIds: ["kabir"] });
    expect(who("Sanskrit test on Monday", [a, k])?.value.memberId).toBe("anya");
    expect(who("Maths test on Monday", [a, k])).toBeNull();
  });

  it("every earlier notice from this sender was for one child", () => {
    const filled = who("PTM on Saturday", [], { children: [{ memberId: "kabir", itemId: "i1" }, { memberId: "kabir", itemId: "i2" }], payees: [] });
    expect(filled?.value.memberId).toBe("kabir");
    expect(filled?.basis).toBe("sender_history");
  });

  it("still unsure: every child at the school it names, else the sender's school", () => {
    const named = childrenAtSchool({ kind: "school_item", text: "Greenwood High: PTM on Saturday", candidates: kids }, memory());
    expect(named?.people.map((p) => p.memberId)).toEqual(["anya", "kabir"]);
    const bySender = childrenAtSchool({ kind: "school_item", text: "PTM on Saturday", candidates: kids, history: { children: [{ memberId: "anya", itemId: "i1" }, { memberId: "kabir", itemId: "i2" }], payees: [] } }, memory());
    expect(bySender?.people.map((p) => p.memberId)).toEqual(["anya", "kabir"]);
    // No school to place it at: asked as before.
    expect(childrenAtSchool({ kind: "school_item", text: "PTM on Saturday", candidates: kids }, memory())).toBeNull();
    // A class outside school is never spread.
    expect(childrenAtSchool({ kind: "activity_item", text: "Greenwood High", candidates: kids }, memory())).toBeNull();
  });

  it("fillSubject records it for each child, never when a rule was taught two", () => {
    const subject = { said: null, selected: null, candidates: kids, question: "Who is this for?", unknown: false } as never;
    const filled = fillSubject("school_item", subject, { items: people, rules: [], sender: "office@greenwood.edu", text: "Greenwood High: PTM on Saturday" });
    expect(filled.question).toBeNull();
    expect(filled.everyone?.map((p) => p.memberId)).toEqual(["anya", "kabir"]);
    const mixed = rule({ kind: "sender_child", key: "sender:office@greenwood.edu", valueMemberId: "anya", valueText: null, mixed: true });
    const asked = fillSubject("school_item", subject, { items: people, rules: [mixed], sender: "office@greenwood.edu", text: "Greenwood High: PTM on Saturday" });
    expect(asked.everyone).toBeUndefined();
  });
});
