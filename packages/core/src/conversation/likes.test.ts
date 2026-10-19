import { describe, expect, it } from "vitest";

import { composeFamilyLikes, composeLikes, likesRecordsFrom, personNamed, readLikesQuestion } from "./likes";

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
    // Asking the assistant about itself: nothing on record answers it.
    expect(readLikesQuestion("What do you like?")).toBeNull();
    expect(readLikesQuestion("What do you know about the weather?")).toBeNull();
  });

  // The owner, 2026-10-19: asked "what do you know about the preferences in
  // food and family?", the assistant said it had no such record while
  // HomeBrain Review listed fourteen. Everyone's is a question too.
  it.each([
    ["What do you know about the preferences in food and family?", true],
    ["Okay, what do you know about the preferences in food and family?", true],
    ["What does the family like to eat?", true],
    ["What does the family like?", false],
    ["What do the kids like to eat?", true],
    ["What does everyone like?", false],
    ["What are the family's food preferences?", true],
    ["What are our food preferences?", true],
    ["What are everyone's likes and dislikes?", false],
    ["Who likes what?", false],
    ["What food preferences do you have on record?", true],
    ["What have I told you about what people like to eat?", true],
    ["List everyone's food preferences", true],
    ["Could you tell me what the family likes to eat?", true],
  ])("%s is about the whole family", (said, food) => {
    expect(readLikesQuestion(said)).toEqual({ name: null, food });
  });

  it("still reads one person by name, including \"what do you know about\" them", () => {
    expect(readLikesQuestion("What do you know about Asmi's food preferences?")).toEqual({ name: "Asmi", food: true });
    expect(readLikesQuestion("What have I told you about Manan's likes?")).toEqual({ name: "Manan", food: false });
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
    expect(told.text).toContain("Upasana likes Italian food (you told me; not registered yet)");
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

describe("everyone's likes, person by person (the owner, 2026-10-19)", () => {
  const family = [
    { id: "k", displayName: "Kunal Chakrabarty" },
    { id: "u", displayName: "Upasana Chakraborty" },
    { id: "a", displayName: "Asmi", nickname: "Ash" },
    { id: "m", displayName: "Manan" },
  ];
  const records = likesRecordsFrom(
    [
      { memberId: "a", category: "preference", key: "pref.asmi.indian", value: { statement: "Asmi likes Indian food" }, status: "learned" },
      { memberId: "a", category: "preference", key: "pref.asmi.assamese", value: { statement: "Asmi doesn't like Assamese food." }, status: "learned" },
      { memberId: "m", category: "preference", key: "pref.manan.home", value: { statement: "Manan likes home-cooked food" }, status: "confirmed" },
      { memberId: null, category: "preference", key: "pref.household.spicy", value: { statement: "The family likes food mildly spiced" }, status: "learned" },
      { memberId: null, category: "routine", key: "routine.bedtime", value: { statement: "Bedtime is 9pm" }, status: "learned" },
      { memberId: "k", category: "preference", key: "pref.kunal.none", value: {}, status: "learned" },
    ],
    [
      { memberId: "u", kind: "dislike", subject: "mushrooms" },
      { memberId: null, kind: "ethical", subject: "beef" },
    ],
  );

  it("says each person's records under their name, in the household's order, then the household's own", () => {
    const told = composeFamilyLikes({ name: null, food: true }, family, records);
    expect(told.count).toBe(6);
    expect(told.memberIds).toEqual(["u", "a", "m"]);
    expect(told.text).toMatch(/Here's what's on record about what the family likes to eat:/);
    expect(told.text.indexOf("**Upasana Chakraborty**")).toBeLessThan(told.text.indexOf("**Asmi**"));
    expect(told.text.indexOf("**Asmi**")).toBeLessThan(told.text.indexOf("**Manan**"));
    expect(told.text).toContain("- Doesn't like mushrooms");
    expect(told.text).toContain("- Asmi likes Indian food (you told me; not registered yet)");
    expect(told.text).toContain("- Asmi doesn't like Assamese food (you told me; not registered yet)");
    expect(told.text).toContain("- Manan likes home-cooked food\n");
    expect(told.text).toContain("**The household**\n- The family likes food mildly spiced (you told me; not registered yet)\n- Doesn't eat, by choice: beef");
    // Not a preference, and nobody's; and a person with nothing on record has no heading.
    expect(told.text).not.toContain("Bedtime");
    expect(told.text).not.toContain("**Kunal");
    expect(told.health).toBe(false);
  });

  it("says plainly when nothing is on record for anyone", () => {
    const told = composeFamilyLikes({ name: null, food: false }, family, []);
    expect(told.count).toBe(0);
    expect(told.text).toMatch(/^Nothing about what the family likes is on record yet\. Tell me — "Kunal likes Italian food"/);
  });

  it("marks an allergy anywhere in the family as health", () => {
    expect(composeFamilyLikes({ name: null, food: true }, family, [{ kind: "food", memberId: "m", preference: "allergy", subject: "peanuts" }]).health).toBe(true);
    expect(composeFamilyLikes({ name: null, food: true }, family, [{ kind: "food", memberId: null, preference: "medical", subject: "sugar" }]).health).toBe(true);
  });
});
