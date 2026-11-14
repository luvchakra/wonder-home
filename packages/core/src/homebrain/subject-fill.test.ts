import { describe, expect, it } from "vitest";

import type { HouseholdContextItem } from "../context/types";
import { fillSubject } from "./subject-fill";
import type { HouseholdRule } from "./rules";

const member = (id: string, name: string, type: string, schools: string[] = []): HouseholdContextItem =>
  ({ id: `member:${id}`, entityType: "member", entityId: id, attributes: { displayName: name, memberType: type, ...(schools.length ? { schoolNames: schools } : {}) }, aliases: [name], subjectMemberIds: [id] }) as unknown as HouseholdContextItem;
const items = [member("anya", "Anya", "child", ["Greenwood High"]), member("kabir", "Kabir", "child", ["Lakeside"])];
const candidates = [
  { memberId: "anya", displayName: "Anya", memberType: "child" as const },
  { memberId: "kabir", displayName: "Kabir", memberType: "child" as const },
];
const asked = { said: null, selected: null, candidates, question: "Who is this for — Anya or Kabir?" };
const rule: HouseholdRule = { id: "r1", kind: "sender_child", key: "sender:class2@lakeside.example", valueMemberId: "kabir", valueText: null, learnedByMemberId: null, learnedFromItemId: null, learnedAt: "2026-11-03T00:00:00Z", mixed: false, source: "answer", times: 1 };

describe("who it is for, before HomeSend asks", () => {
  it("a sender the household taught fills it", () => {
    expect(fillSubject("school_item", asked, { items, rules: [rule], sender: "class2@lakeside.example", text: "PTM on Friday" }).selected?.memberId).toBe("kabir");
  });
  it("a mixed sender is still asked", () => {
    expect(fillSubject("school_item", asked, { items, rules: [{ ...rule, mixed: true }], sender: "class2@lakeside.example", text: "PTM" }).question).toBe(asked.question);
  });
  it("a health document is still asked, whatever the rules say", () => {
    const person: HouseholdRule = { ...rule, kind: "sender_person" };
    expect(fillSubject("health_document", asked, { items, rules: [person], sender: "class2@lakeside.example", text: "report" }).question).toBe(asked.question);
  });
});
