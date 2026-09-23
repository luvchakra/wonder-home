import { describe, expect, it } from "vitest";

import { applyFreshness } from "../context/freshness";
import { buildContextItems } from "../context/builders";
import type { HouseholdMember } from "../identity/households";
import { resolveIntakePeople } from "./resolve";

/** Story 08-009: a school notice for a child the household has not added yet. */

const NOW = new Date("2026-09-23T06:00:00Z");

function member(id: string, displayName: string, memberType: HouseholdMember["memberType"]): HouseholdMember {
  return {
    id, displayName, memberType, status: "active", roles: [], isOwner: false, dateOfBirth: null, nickname: null, relationship: null,
    occupation: null, schoolOrWorkLocation: null, specialOccasionLabel: null, specialOccasionDate: null, gender: null, notes: null, avatarUrl: null,
  };
}

function subjectFor(members: HouseholdMember[], names: string[]) {
  const items = applyFreshness(buildContextItems({ members }, { householdId: "h", householdName: "Home", timezone: "Asia/Kolkata", now: NOW, viewerMemberId: "kunal" }), NOW);
  return resolveIntakePeople({ kind: "school_item", entities: [], references: names.map((text) => ({ text, candidates: [], confidence: 0 })) }, items, { viewerMemberId: "kunal" }).subject;
}

const parent = member("kunal", "Kunal Mehta", "adult");

describe("a notice naming a child who is not on record", () => {
  it("with no children at all, says who it named, so the review can offer to add them", () => {
    expect(subjectFor([parent], ["Aarav"])).toMatchObject({ said: "Aarav", selected: null, candidates: [], unknown: true, question: null });
  });

  it("with one child on record, never assumes it is that child", () => {
    const subject = subjectFor([parent, member("asmi", "Asmi", "child")], ["Aarav"]);
    expect(subject.selected).toBeNull();
    expect(subject).toMatchObject({ said: "Aarav", unknown: true });
    expect(subject.candidates.map((kid) => kid.displayName)).toEqual(["Asmi"]);
    expect(subject.question).toMatch(/Aarav isn't one of your children on record/);
  });

  it("a teacher's name is not taken for the child", () => {
    const subject = subjectFor([parent, member("asmi", "Asmi", "child")], ["Mr. Rao", "Dr Mehta", "Principal Singh"]);
    expect(subject.unknown).toBeUndefined();
    expect(subject.selected?.displayName).toBe("Asmi");
  });

  it("a name that is on record still resolves as before", () => {
    const subject = subjectFor([parent, member("asmi", "Asmi", "child"), member("manan", "Manan", "child")], ["Manan"]);
    expect(subject).toMatchObject({ said: "Manan", selected: { displayName: "Manan" } });
    expect(subject.unknown).toBeUndefined();
  });

  it("a named child who is on record wins over an unknown name beside them", () => {
    const subject = subjectFor([parent, member("asmi", "Asmi", "child")], ["Aarav", "Asmi"]);
    expect(subject.selected?.displayName).toBe("Asmi");
    expect(subject.unknown).toBeUndefined();
  });
});
