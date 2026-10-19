import { describe, expect, it } from "vitest";

import {
  checkRelationship,
  inverseOf,
  relationsOf,
  relationshipSentences,
  sexOf,
  suggestRelationships,
  type Relationship,
  type RelationshipPerson,
} from "./relationships";

const people: RelationshipPerson[] = [
  { id: "kunal", displayName: "Kunal", memberType: "adult", gender: "Male", dateOfBirth: "1985-02-11" },
  { id: "upasana", displayName: "Upasana", memberType: "adult", gender: "Female", dateOfBirth: "1987-06-03" },
  { id: "asmi", displayName: "Asmi", memberType: "child", gender: "Girl", dateOfBirth: "2016-12-09" },
  { id: "manan", displayName: "Manan", memberType: "child", gender: null, dateOfBirth: "2019-08-02" },
  { id: "rekha", displayName: "Rekha", memberType: "helper", gender: "Female", dateOfBirth: null },
];
const father: Relationship = { id: "r1", memberId: "kunal", relation: "father", relatedMemberId: "asmi" };
const wife: Relationship = { id: "r2", memberId: "upasana", relation: "wife", relatedMemberId: "kunal" };

describe("the other way round", () => {
  it("is worded from the other person's gender, and neutral when it is not on record", () => {
    expect(inverseOf("father", { gender: "Girl" })).toBe("daughter");
    expect(inverseOf("father", { gender: null })).toBe("child");
    expect(inverseOf("wife", { gender: "Male" })).toBe("husband");
    expect(inverseOf("sister", { gender: "Prefer not to say" })).toBe("sibling");
    expect(inverseOf("grandmother", { gender: "boy" })).toBe("grandson");
    expect(inverseOf("guardian", { gender: null })).toBe("ward");
  });

  it("is not guessed where a language has no neutral word, nor for the household's own words", () => {
    expect(inverseOf("uncle", { gender: null })).toBeNull();
    expect(inverseOf("uncle", { gender: "Female" })).toBe("niece");
    expect(inverseOf("mother_in_law", { gender: "Male" })).toBe("son_in_law");
    expect(inverseOf("godmother", { gender: "Female" })).toBeNull();
  });

  it("reads only a plain female or male word as a sex", () => {
    expect(sexOf("Female")).toBe("female");
    expect(sexOf(" girl ")).toBe("female");
    expect(sexOf("Male")).toBe("male");
    expect(sexOf("Non-binary")).toBeNull();
    expect(sexOf(null)).toBeNull();
  });
});

describe("a row is checked before it is kept", () => {
  it("keeps a plain, new row", () => {
    expect(checkRelationship({ memberId: "upasana", relation: "mother", relatedMemberId: "manan" }, people, [father, wife])).toBeNull();
  });

  it("refuses the same person twice, a helper, and a missing or overlong relation", () => {
    expect(checkRelationship({ memberId: "kunal", relation: "father", relatedMemberId: "kunal" }, people, [])).toEqual({ code: "same_person" });
    expect(checkRelationship({ memberId: "rekha", relation: "aunt", relatedMemberId: "asmi" }, people, [])).toEqual({ code: "not_family", memberId: "rekha" });
    expect(checkRelationship({ memberId: "kunal", relation: "  ", relatedMemberId: "asmi" }, people, [])).toEqual({ code: "relation_missing" });
    expect(checkRelationship({ memberId: "kunal", relation: "x".repeat(41), relatedMemberId: "asmi" }, people, [])).toEqual({ code: "relation_too_long" });
  });

  it("relates a pair once, whichever way round, but a row may be changed in place", () => {
    expect(checkRelationship({ memberId: "asmi", relation: "daughter", relatedMemberId: "kunal" }, people, [father])).toEqual({ code: "already_related", existing: father });
    expect(checkRelationship({ id: "r1", memberId: "kunal", relation: "parent", relatedMemberId: "asmi" }, people, [father])).toBeNull();
  });

  it("never has a parent, grandparent or in-law parent younger than the person, or a child older", () => {
    // Each refusal names the real elder: Upasana is older than Asmi; Kunal is older than Asmi.
    expect(checkRelationship({ memberId: "asmi", relation: "mother", relatedMemberId: "upasana" }, people, [])).toEqual({ code: "age", elder: "upasana", younger: "asmi" });
    expect(checkRelationship({ memberId: "kunal", relation: "son", relatedMemberId: "asmi" }, people, [])).toEqual({ code: "age", elder: "kunal", younger: "asmi" });
    // A sibling, or the household's own word, has no age rule.
    expect(checkRelationship({ memberId: "manan", relation: "brother", relatedMemberId: "asmi" }, people, [])).toBeNull();
    expect(checkRelationship({ memberId: "manan", relation: "godparent", relatedMemberId: "kunal" }, people, [])).toBeNull();
  });
});

describe("suggestions are offered, never assumed", () => {
  it("offers a child's guardians as parents and the children as siblings, elder first", () => {
    const suggested = suggestRelationships(people, [], [
      { guardianMemberId: "kunal", childMemberId: "asmi" },
      { guardianMemberId: "upasana", childMemberId: "asmi" },
    ]);
    expect(suggested).toEqual([
      { memberId: "kunal", relation: "father", relatedMemberId: "asmi", because: "guardian" },
      { memberId: "upasana", relation: "mother", relatedMemberId: "asmi", because: "guardian" },
      { memberId: "asmi", relation: "sister", relatedMemberId: "manan", because: "children" },
    ]);
  });

  it("never offers a pair already related, either way round, or a helper", () => {
    const suggested = suggestRelationships(people, [father, { id: "r3", memberId: "manan", relation: "brother", relatedMemberId: "asmi" }], [
      { guardianMemberId: "kunal", childMemberId: "asmi" },
      { guardianMemberId: "rekha", childMemberId: "manan" },
    ]);
    expect(suggested).toEqual([]);
  });
});

describe("what one person is to the family", () => {
  it("collects their rows both ways round", () => {
    expect(relationsOf("kunal", [father, wife], people)).toEqual([
      { relation: "father", otherId: "asmi" },
      { relation: "husband", otherId: "upasana" },
    ]);
    expect(relationsOf("asmi", [father], people)).toEqual([{ relation: "daughter", otherId: "kunal" }]);
  });

  it("says each row as plain English for HomeBrain's facts", () => {
    expect(relationshipSentences([father, wife, { id: "r4", memberId: "upasana", relation: "godmother", relatedMemberId: "manan" }], people).map((entry) => entry.text)).toEqual([
      "Kunal is Asmi's father, and Asmi is Kunal's daughter.",
      "Upasana is Kunal's wife, and Kunal is Upasana's husband.",
      "Upasana is Manan's godmother.",
    ]);
  });
});
