import { describe, expect, it } from "vitest";

import { composeLikes, personNamed, readLikesQuestion } from "./likes";

const people = [
  { id: "u", displayName: "Upasana Chakraborty" },
  { id: "k", displayName: "Kunal Chakrabarty" },
  { id: "a", displayName: "Asmi", nickname: "Ash" },
];

describe("a question about what someone likes (the owner, 2026-10-18)", () => {
  it.each([
    ["What does Upasana like in food?", "Upasana", true],
    ["What does Upasana like? In food.", "Upasana", true],
    ["what does Asmi not like", "Asmi", false],
    ["What are Kunal's food preferences?", "Kunal", true],
    ["Tell me what Upasana likes", "Upasana", false],
    ["Okay, can you tell me what Upasana likes to eat?", "Upasana", true],
  ])("%s", (said, name, food) => {
    expect(readLikesQuestion(said)).toEqual({ name, food });
  });

  it("leaves other questions alone", () => {
    expect(readLikesQuestion("what do we need from the shop")).toBeNull();
    expect(readLikesQuestion("what does the electricity bill come to")).toBeNull();
    expect(readLikesQuestion("what's for dinner")).toBeNull();
  });

  it("names a person by full name, first name or nickname, and asks when two fit", () => {
    expect(personNamed("upasana", people)?.id).toBe("u");
    expect(personNamed("Ash", people)?.id).toBe("a");
    expect(personNamed("Chakraborty", people)).toBeNull();
    expect(personNamed("the electricity bill", people)).toBeNull();
  });
});

describe("the answer comes from every record about the person", () => {
  const upasana = people[0]!;

  it("says what HomeTalk was told, marking what nobody confirmed, and the Meals screen's preferences", () => {
    const told = composeLikes({ name: "Upasana", food: true }, upasana, [
      { kind: "memory", memberId: "u", statement: "Upasana likes Italian food", confirmed: false },
      { kind: "food", memberId: "u", preference: "dislike", subject: "mushrooms" },
      { kind: "food", memberId: "k", preference: "preference", subject: "North Indian" },
    ]);
    expect(told.count).toBe(2);
    expect(told.text).toContain("Upasana likes Italian food (you told me; not confirmed yet)");
    expect(told.text).toContain("Doesn't like mushrooms");
    expect(told.text).not.toContain("North Indian");
  });

  it("finds her in a statement kept under someone else, and says only her part", () => {
    const told = composeLikes({ name: "Upasana", food: true }, upasana, [
      { kind: "memory", memberId: "k", statement: "Kunal likes North Indian food; Upasana likes Italian and French food", confirmed: true },
    ]);
    expect(told.text).toContain("Upasana likes Italian and French food");
    expect(told.text).not.toContain("North Indian");
  });

  it("says plainly when nothing is on record, and how to tell it", () => {
    const told = composeLikes({ name: "Upasana", food: true }, upasana, []);
    expect(told.count).toBe(0);
    expect(told.text).toMatch(/Nothing about what Upasana likes to eat is on record yet/);
  });

  it("marks an allergy or a medical avoidance as health", () => {
    expect(composeLikes({ name: "Asmi", food: true }, people[2]!, [{ kind: "food", memberId: "a", preference: "allergy", subject: "peanuts" }]).health).toBe(true);
  });
});
