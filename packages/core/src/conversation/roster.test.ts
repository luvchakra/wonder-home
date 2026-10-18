import { describe, expect, it } from "vitest";

import { converse, resolveDeterministicIntent } from "./engine";
import { composeRoster, isRosterQuestion } from "./roster";

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
