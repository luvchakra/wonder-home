import { describe, expect, it } from "vitest";
import type { HouseholdContextItem } from "../context/types";
import { inferSubject, keyLabel, learnable, namesSchool, senderKey, type LearnedDefault } from "./learned";
import type { SubjectResolution } from "./resolve";

function member(id: string, name: string, memberType: "child" | "adult" | "helper", schoolNames?: string[]): HouseholdContextItem {
  return {
    domain: "people",
    entityType: "member",
    entityId: id,
    summary: `${name} is ${memberType}.`,
    privacyClass: "general",
    tier: 1,
    attributes: { displayName: name, memberType, ...(schoolNames ? { schoolNames } : {}) },
    source: { type: "household_members" },
  } as unknown as HouseholdContextItem;
}

const asmi = { memberId: "asmi", displayName: "Asmi", memberType: "child" as const };
const manan = { memberId: "manan", displayName: "Manan", memberType: "child" as const };
const ask: SubjectResolution = { said: null, selected: null, candidates: [asmi, manan], question: "Who is this for — Asmi or Manan?" };

function learned(key: string, valueMemberId: string, mixed = false): LearnedDefault {
  return { id: `l-${key}`, kind: "sender_child", key, valueMemberId, learnedByMemberId: "kunal", learnedFromItemId: "i1", learnedAt: "2026-11-01T00:00:00Z", mixed };
}

describe("senderKey", () => {
  it("keeps the address from a named From, lower-cased", () => {
    expect(senderKey("Greenwood High <Notices@Greenwood.edu>")).toBe("sender:notices@greenwood.edu");
    expect(senderKey("notices@greenwood.edu")).toBe("sender:notices@greenwood.edu");
    expect(keyLabel("sender:notices@greenwood.edu")).toBe("notices@greenwood.edu");
  });
  it("keeps a channel sender's name, and nothing for no sender", () => {
    expect(senderKey("  Class 3B   Teacher ")).toBe("sender:class 3b teacher");
    expect(senderKey(null)).toBeNull();
    expect(senderKey("")).toBeNull();
  });
});

describe("namesSchool", () => {
  it("matches whole words, ignoring case", () => {
    expect(namesSchool("Greenwood High School: Sports Day on Saturday", "Greenwood High")).toBe(true);
    expect(namesSchool("Evergreenwood Highlands", "Greenwood High")).toBe(false);
  });
});

describe("inferSubject", () => {
  const items = [member("asmi", "Asmi", "child", ["Greenwood High"]), member("manan", "Manan", "child", ["Lakeside School"]), member("kunal", "Kunal", "adult")];

  it("takes the child whose school the notice names", () => {
    const out = inferSubject("school_item", ask, { items, learned: [], sender: null, text: "Lakeside School — Science fair on Friday" });
    expect(out.selected?.memberId).toBe("manan");
    expect(out.question).toBeNull();
    expect(out.basis).toBe("school");
  });

  it("takes the child this sender's items were for before", () => {
    const sameSchool = [member("asmi", "Asmi", "child", ["Greenwood High"]), member("manan", "Manan", "child", ["Greenwood High"])];
    const out = inferSubject("school_item", ask, { items: sameSchool, learned: [learned("sender:3b@greenwood.edu", "asmi")], sender: "Class 3B <3B@greenwood.edu>", text: "Greenwood High: bring crayons" });
    expect(out.selected?.memberId).toBe("asmi");
    expect(out.basis).toBe("learned");
  });

  it("asks again when the sender's items went to two children", () => {
    const sameSchool = [member("asmi", "Asmi", "child", ["Greenwood High"]), member("manan", "Manan", "child", ["Greenwood High"])];
    const out = inferSubject("school_item", ask, { items: sameSchool, learned: [learned("sender:office@greenwood.edu", "asmi", true)], sender: "office@greenwood.edu", text: "Holiday on Monday" });
    expect(out).toBe(ask);
  });

  it("takes the only child with a school on record, for a school notice only", () => {
    const one = [member("asmi", "Asmi", "child", ["Greenwood High"]), member("manan", "Manan", "child")];
    expect(inferSubject("school_item", ask, { items: one, learned: [], sender: null, text: "Bring crayons" }).selected?.memberId).toBe("asmi");
    // A class outside school is not settled by who goes to school.
    expect(inferSubject("activity_item", ask, { items: one, learned: [], sender: null, text: "Swimming moved" })).toBe(ask);
  });

  it("never overrides a name the content used, an unknown child or a health document", () => {
    const named = { ...ask, said: "A." };
    expect(inferSubject("school_item", named, { items, learned: [], sender: null, text: "Lakeside School" })).toBe(named);
    const unknown = { ...ask, unknown: true, said: "Riya" };
    expect(inferSubject("school_item", unknown, { items, learned: [], sender: null, text: "Lakeside School" })).toBe(unknown);
    expect(inferSubject("health_document", ask, { items, learned: [learned("sender:clinic@x.in", "asmi")], sender: "clinic@x.in", text: "" })).toBe(ask);
  });

  it("never picks somebody outside the candidates or not in this household", () => {
    // Learned for a child of another household (or one since removed): not a candidate, not chosen.
    const out = inferSubject("school_item", ask, { items, learned: [learned("sender:x@y.edu", "someone-else")], sender: "x@y.edu", text: "Bring crayons" });
    expect(out).toBe(ask);
    // A candidate who is no longer on record isn't chosen by school either.
    const gone = inferSubject("school_item", ask, { items: [member("asmi", "Asmi", "child")], learned: [], sender: null, text: "Lakeside School" });
    expect(gone.selected).toBeNull();
  });

  it("leaves a settled subject alone", () => {
    const settled = { said: "Asmi", selected: asmi, candidates: [asmi], question: null };
    expect(inferSubject("school_item", settled, { items, learned: [], sender: null, text: "Lakeside School" })).toBe(settled);
  });
});

describe("learnable", () => {
  it("learns an outside sender's child for a child's kind only", () => {
    expect(learnable("school_item", "3b@greenwood.edu", { memberId: "asmi", memberType: "child" })).toEqual({ kind: "sender_child", key: "sender:3b@greenwood.edu", valueMemberId: "asmi" });
    expect(learnable("bill", "bills@power.in", { memberId: "asmi", memberType: "child" })).toBeNull();
    expect(learnable("health_document", "clinic@x.in", { memberId: "asmi", memberType: "child" })).toBeNull();
    expect(learnable("school_item", "3b@greenwood.edu", { memberId: "kunal", memberType: "adult" })).toBeNull();
    expect(learnable("school_item", null, { memberId: "asmi", memberType: "child" })).toBeNull();
  });
});
