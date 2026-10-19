import { describe, expect, it } from "vitest";

import type { Relationship, RelationshipPerson } from "../identity/relationships";
import { composeRelations, readRelationQuestion } from "./relations";
import { resolveDeterministicIntent } from "./engine";

const people: (RelationshipPerson & { nickname?: string | null })[] = [
  { id: "kunal", displayName: "Kunal Chakrabarty", memberType: "adult", gender: "Male", dateOfBirth: "1985-02-11" },
  { id: "upasana", displayName: "Upasana Chakraborty", memberType: "adult", gender: "Female", dateOfBirth: "1987-06-03" },
  { id: "asmi", displayName: "Asmi Chakraborty", memberType: "child", gender: "Girl", dateOfBirth: "2016-12-09", nickname: "Ash" },
  { id: "manan", displayName: "Manan", memberType: "child", gender: null, dateOfBirth: "2019-08-02" },
];
const rows: Relationship[] = [
  { id: "r1", memberId: "kunal", relation: "father", relatedMemberId: "asmi" },
  { id: "r2", memberId: "upasana", relation: "wife", relatedMemberId: "kunal" },
  { id: "r3", memberId: "upasana", relation: "mother", relatedMemberId: "asmi" },
];

describe("reading a question about how people are related", () => {
  it.each([
    ["Who is Asmi's father?", { kind: "of", name: "Asmi", word: "father" }],
    ["who are Manan's grandparents", { kind: "of", name: "Manan", word: "grandparents" }],
    ["Who is the mother of Asmi?", { kind: "of", name: "Asmi", word: "mother" }],
    ["Does Asmi have a brother?", { kind: "of", name: "Asmi", word: "brother" }],
    ["How is Upasana related to Manan?", { kind: "between", first: "Upasana", second: "Manan" }],
    ["What is Kunal to Asmi?", { kind: "between", first: "Kunal", second: "Asmi" }],
    ["How are Kunal and Upasana related?", { kind: "between", first: "Kunal", second: "Upasana" }],
    ["Okay, how is the family related?", { kind: "all" }],
    ["Show me the family tree", { kind: "all" }],
  ] as const)("%s", (question, reading) => {
    expect(readRelationQuestion(question)).toEqual(reading);
  });

  it("leaves other questions alone", () => {
    expect(readRelationQuestion("Who is in the family?")).toBeNull();
    expect(readRelationQuestion("What does Asmi like?")).toBeNull();
    expect(readRelationQuestion("Who is your father?")).toBeNull();
  });

  it("is a question to the rules, never a fact to remember", () => {
    for (const question of ["Who is Asmi's father?", "How is Upasana related to Manan?", "How is the family related?"]) {
      const intent = resolveDeterministicIntent(question, { actorMemberId: "kunal", channel: "text" });
      expect(intent.action, question).toBe("ask_status");
      expect(intent.parameters.scope, question).toBe("relations");
    }
  });
});

describe("the answer comes from every row, both ways round", () => {
  it("names who someone's relation is, from rows written either way", () => {
    expect(composeRelations({ kind: "of", name: "Asmi", word: "father" }, people, rows).text).toBe("Kunal Chakrabarty is Asmi's father.");
    expect(composeRelations({ kind: "of", name: "Ash", word: "parents" }, people, rows).text).toBe("- Kunal Chakrabarty is Asmi's father\n- Upasana Chakraborty is Asmi's mother");
    // "Upasana is wife of Kunal" answers who Upasana's husband is too.
    expect(composeRelations({ kind: "of", name: "Upasana", word: "husband" }, people, rows).text).toBe("Kunal Chakrabarty is Upasana's husband.");
  });

  it("says plainly what is missing, and where to add it", () => {
    expect(composeRelations({ kind: "of", name: "Manan", word: "father" }, people, rows).text).toMatch(/^No one is recorded as Manan's father yet\. An Admin can add it under Manage Household → Members & roles → Relationships\.$/);
    expect(composeRelations({ kind: "between", first: "Kunal", second: "Manan" }, people, rows).text).toMatch(/^How Kunal and Manan are related isn't on record yet\./);
    expect(composeRelations({ kind: "of", name: "Priya", word: "father" }, people, rows).text).toMatch(/I don't know who Priya is/);
  });

  it("says how two people are related, each way round", () => {
    expect(composeRelations({ kind: "between", first: "Asmi", second: "Kunal" }, people, rows).text).toBe("Asmi Chakraborty is Kunal's daughter, and Kunal Chakrabarty is Asmi's father.");
  });

  it("lists the whole family's rows", () => {
    const told = composeRelations({ kind: "all" }, people, rows);
    expect(told.text).toBe(
      "Here's how the family is related:\n\n- Kunal Chakrabarty is Asmi Chakraborty's father, and Asmi Chakraborty is Kunal Chakrabarty's daughter\n- Upasana Chakraborty is Kunal Chakrabarty's wife, and Kunal Chakrabarty is Upasana Chakraborty's husband\n- Upasana Chakraborty is Asmi Chakraborty's mother, and Asmi Chakraborty is Upasana Chakraborty's daughter",
    );
    expect(told.memberIds.sort()).toEqual(["asmi", "kunal", "upasana"]);
    expect(composeRelations({ kind: "all" }, people, []).text).toMatch(/isn't on record yet/);
  });
});
