import { describe, expect, it } from "vitest";

import { converse, resolveDeterministicIntent } from "./engine";
import { composeRoster, isFamilyOverviewQuestion, isRosterQuestion } from "./roster";

const people = [
  { id: "k", displayName: "Kunal Chakrabarty", memberType: "adult" as const },
  { id: "u", displayName: "Upasana Chakraborty", memberType: "adult" as const, relationship: "Wife" },
  { id: "a", displayName: "Asmi Chakraborty", memberType: "child" as const, nickname: "Mishti" },
  { id: "m", displayName: "Manan", memberType: "child" as const },
  { id: "r", displayName: "Rekha", memberType: "helper" as const },
];

describe("who is in the household", () => {
  it.each(["Who are the family members?", "who is in my family", "Who lives here", "tell me about my family members", "who are the members of our family", "how many people are in our family"])(
    "reads %s as a roster question",
    (utterance) => {
      expect(isRosterQuestion(utterance)).toBe(true);
      const intent = resolveDeterministicIntent(utterance, { actorMemberId: "k", channel: "text" });
      expect(intent.action).toBe("ask_status");
      expect(intent.parameters.scope).toBe("people");
    },
  );

  it.each([
    "who are the family members in this household?",
    "Who all live in this house",
    "who lives at home",
    "list all the family members",
    "name everyone in the family",
    "who all are in our family",
  ])("reads %s as a roster question too (HomeBrain 4.0 §3.1)", (utterance) => {
    expect(isRosterQuestion(utterance)).toBe(true);
  });

  it("reads the sentence Gemini passed on once the engine has cleaned it (the owner's report, 2026-10-18)", async () => {
    const result = await converse({
      utterance: "Okay, so. Okay, who are the family members in this household?",
      channel: "voice",
      actor: { memberId: "k", roles: ["head"], memberType: "adult" },
      pending: null,
      autonomyFor: () => "observe",
      entitledFor: () => true,
      sessionId: "s",
    });
    expect(result.kind).toBe("reply");
    if (result.kind === "reply") {
      expect(result.intent.action).toBe("ask_status");
      expect(result.intent.parameters.scope).toBe("people");
    }
  });

  it.each(["what does Manan like to eat", "who is picking up Asmi", "plan a family dinner", "who lives in Pune", "list the groceries"])("leaves %s alone", (utterance) => {
    expect(isRosterQuestion(utterance)).toBe(false);
  });

  it("names every active person, the newest child included, and the pets", () => {
    const text = composeRoster(people, { viewerMemberId: "k", householdName: "Asmi Family", pets: [{ name: "Rowdy", species: "Cat" }] });
    for (const name of ["Kunal Chakrabarty", "Upasana Chakraborty", "Asmi Chakraborty", "Manan", "Rekha", "Rowdy"]) expect(text).toContain(name);
    expect(text).toContain("4 people in the family, and 1 househelper");
    expect(text).toContain("**Kunal Chakrabarty** — you");
    expect(text).toContain("(Mishti)");
  });
});

describe("what do you know about the family (the owner, 2026-10-21)", () => {
  it.each(["what do you know about the family", "What do you know about my family?", "Okay, what do you know about our family?", "tell me about us", "Tell me everything about the household", "what can you tell me about the whole family"])(
    "reads %s as the family, by rules — never as what's going on",
    (utterance) => {
      expect(isFamilyOverviewQuestion(utterance)).toBe(true);
      const intent = resolveDeterministicIntent(utterance, { actorMemberId: "k", channel: "text" });
      expect(intent.action).toBe("ask_status");
      expect(intent.parameters).toMatchObject({ scope: "people", overview: true });
    },
  );

  it.each(["what do you know about the family's food preferences?", "what do you know about the family calendar", "what do you know about Asmi?", "tell me about the family dinner"])("leaves %s to its own answer", (utterance) => {
    expect(isFamilyOverviewQuestion(utterance)).toBe(false);
  });

  it("names everyone, each at a glance, then what needs someone with where to see it", () => {
    const text = composeRoster(people, {
      viewerMemberId: "k",
      householdName: "Asmi Family",
      glances: new Map([["a", "likes Indian food; next: Sports Day (Sat 26 Sep)"]]),
      attention: { count: 3, urgent: 2 },
    });
    expect(text).toContain("- **Asmi Chakraborty** (Mishti) — likes Indian food; next: Sports Day (Sat 26 Sep)");
    expect(text).toContain("- **Upasana Chakraborty** — wife");
    expect(text).toContain("- **Kunal Chakrabarty** — you");
    expect(text).toContain("Around the home, 3 things need someone (2 urgent) — see [Home](/).");
    expect(text.indexOf("Rekha")).toBeLessThan(text.indexOf("Around the home"));
    expect(text).not.toMatch(/\b\d{4}-\d{2}-\d{2}\b|suggested:/);
  });

  it("says plainly when nothing needs anyone", () => {
    expect(composeRoster(people, { viewerMemberId: "k", householdName: "", attention: { count: 0, urgent: 0 } })).toContain("Around the home, nothing needs anyone right now — see [Home](/).");
  });
});
