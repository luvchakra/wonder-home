import { describe, expect, it } from "vitest";

import { isMixed, lessonsFrom, mergeLesson, phraseKey, placeKey, ruleFor, safeRuleText, vendorKey, type HouseholdRule } from "./rules";

const rule = (over: Partial<HouseholdRule>): HouseholdRule => ({
  id: "r1",
  kind: "sender_child",
  key: "sender:notices@greenwood.edu",
  valueMemberId: "anya",
  valueText: null,
  learnedByMemberId: "mum",
  learnedFromItemId: null,
  learnedAt: "2026-11-03T10:00:00Z",
  mixed: false,
  source: "answer",
  times: 1,
  ...over,
});

describe("household rules: keys", () => {
  it("normalizes vendors without legal noise", () => {
    expect(vendorKey("BESCOM Ltd.")).toBe("vendor:bescom");
    expect(vendorKey("The Tata Power Company Limited")).toBe("vendor:tata power");
    expect(vendorKey("")).toBeNull();
  });
  it("normalizes phrases and places", () => {
    expect(phraseKey("  Atta ")).toBe("phrase:atta");
    expect(placeKey("Nani's")).toBe("place:nani's");
    expect(phraseKey("x")).toBeNull();
  });
});

describe("household rules: a rule never carries money, approval or permission", () => {
  it.each(["₹1,200", "Rs 500", "1,20,000", "450.50", "approve payments", "pay now", "admin", "OTP 4321"])("refuses %s", (value) => {
    expect(safeRuleText(value)).toBeNull();
  });
  it.each(["Atta (wheat flour)", "electricity", "Nani's house", "Toor dal 1 kg"])("keeps %s", (value) => {
    expect(safeRuleText(value)).toBe(value);
  });
  it("learns nothing from a date, an amount or a title", () => {
    for (const field of ["date", "amount", "title"] as const) {
      expect(lessonsFrom({ kind: "bill", field, sender: "billing@bescom.in", vendor: "BESCOM", to: { text: "1200" } })).toEqual([]);
    }
  });
  it("never learns a category that is an amount", () => {
    expect(lessonsFrom({ kind: "bill", field: "category", vendor: "BESCOM", to: { text: "₹2,000" } })).toEqual([]);
  });
});

describe("household rules: lessons", () => {
  it("a child's item from an outside sender teaches sender_child, as 14-066 did", () => {
    expect(lessonsFrom({ kind: "school_item", field: "person", sender: "Greenwood <notices@greenwood.edu>", to: { memberId: "anya", memberType: "child" } })).toEqual([
      { kind: "sender_child", key: "sender:notices@greenwood.edu", valueMemberId: "anya", valueText: null },
    ]);
  });
  it("a child's item said to be for an adult teaches nothing", () => {
    expect(lessonsFrom({ kind: "school_item", field: "person", sender: "notices@greenwood.edu", to: { memberId: "dad", memberType: "adult" } })).toEqual([]);
  });
  it("an event or a bill teaches sender_person", () => {
    expect(lessonsFrom({ kind: "event", field: "person", sender: "coach@club.in", to: { memberId: "dad", memberType: "adult" } })[0]?.kind).toBe("sender_person");
  });
  it("a health document never teaches who it is for", () => {
    expect(lessonsFrom({ kind: "health_document", field: "person", sender: "reports@lab.in", to: { memberId: "gran" } })).toEqual([]);
  });
  it("no outside sender, no sender rule", () => {
    expect(lessonsFrom({ kind: "event", field: "person", sender: null, to: { memberId: "dad" } })).toEqual([]);
  });
  it("teaches a sender's area, only a real kind", () => {
    expect(lessonsFrom({ kind: "unknown", field: "area", sender: "billing@bescom.in", to: { text: "bill" } })).toEqual([{ kind: "sender_area", key: "sender:billing@bescom.in", valueMemberId: null, valueText: "bill" }]);
    expect(lessonsFrom({ kind: "unknown", field: "area", sender: "billing@bescom.in", to: { text: "unknown" } })).toEqual([]);
  });
  it("teaches a phrase only when it differs from the item's own name", () => {
    expect(lessonsFrom({ kind: "grocery_item", field: "item", phrase: "atta", to: { text: "Atta (wheat flour)" } })).toEqual([{ kind: "phrase_item", key: "phrase:atta", valueMemberId: null, valueText: "Atta (wheat flour)" }]);
    expect(lessonsFrom({ kind: "grocery_item", field: "item", phrase: "Milk", to: { text: "milk" } })).toEqual([]);
  });
  it("teaches a place alias and a vendor category", () => {
    expect(lessonsFrom({ kind: "event", field: "place", phrase: "nani's", to: { text: "Nani's house" } })[0]?.kind).toBe("place_alias");
    expect(lessonsFrom({ kind: "bill", field: "category", vendor: "BESCOM Ltd", to: { text: "electricity" } })[0]).toMatchObject({ kind: "vendor_category", key: "vendor:bescom" });
  });
});

describe("household rules: mixed", () => {
  it("the same value again counts up; a different value makes it mixed for good", () => {
    const lesson = { kind: "sender_child" as const, key: "sender:a@b.in", valueMemberId: "anya", valueText: null };
    expect(mergeLesson(null, lesson)).toEqual({ mixed: false, times: 1 });
    expect(mergeLesson({ valueMemberId: "anya", valueText: null, mixed: false, times: 2 }, lesson)).toEqual({ mixed: false, times: 3 });
    expect(mergeLesson({ valueMemberId: "kabir", valueText: null, mixed: false, times: 2 }, lesson)).toEqual({ mixed: true, times: 2 });
    expect(mergeLesson({ valueMemberId: "anya", valueText: null, mixed: true, times: 2 }, lesson).mixed).toBe(true);
  });
  it("a mixed rule settles nothing and says so", () => {
    const rules = [rule({ mixed: true })];
    expect(ruleFor(rules, "sender_child", "sender:notices@greenwood.edu")).toBeNull();
    expect(isMixed(rules, "sender_child", "sender:notices@greenwood.edu")).toBe(true);
  });
});
