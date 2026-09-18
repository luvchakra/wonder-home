import { describe, expect, it } from "vitest";

import { FAQ, GUIDE } from "./guide";
import { answerQuestion, CONFIDENCE_FLOOR, scoreSection, terms } from "./search";

describe("reading a question", () => {
  it("drops the words every question contains", () => {
    expect(terms("How do I pay a bill?")).toEqual(["pay", "bill"]);
  });

  it("treats a plural as the same question as its singular", () => {
    expect(terms("notifications")).toEqual(terms("notification"));
  });

  it("survives punctuation and an empty question", () => {
    expect(terms("  ?!  ")).toEqual([]);
  });
});

describe("answering from the guide", () => {
  const ask = (question: string) => answerQuestion(question);

  it("sends a money question to the money section", () => {
    const answer = ask("can it pay my bills automatically?");

    expect(answer.confident).toBe(true);
    expect(answer.sectionId).toBe("bills");
  });

  it("sends a question about a child's homework to the school section", () => {
    expect(ask("who can see my child's homework?").sectionId).toMatch(/school|household-and-roles/);
  });

  it("prefers a written FAQ answer when one matches", () => {
    const answer = ask("is my family's data used to train AI models?");

    expect(answer.confident).toBe(true);
    expect(answer.reply).toBe("No, not by default.");
    expect(answer.sectionId).toBe("privacy");
  });

  it("answers the password question with the reset instructions", () => {
    const answer = ask("I forgot my password");

    expect(answer.reply).toContain("Forgot password?");
    expect(answer.sectionId).toBe("accounts");
  });

  it("finds the bring-your-own-key section", () => {
    expect(ask("can I use my own anthropic api key?").sectionId).toBe("ai-key");
  });

  it("says it does not know rather than guessing", () => {
    const answer = ask("what is the airspeed velocity of an unladen swallow");

    expect(answer.confident).toBe(false);
    expect(answer.reply).toContain("could not find that in the guide");
    expect(answer.alsoSee).toEqual([]);
  });

  it("does not claim an answer for an empty question", () => {
    expect(ask("   ").confident).toBe(false);
  });

  it("always points at a section that exists", () => {
    const ids = new Set(GUIDE.map((section) => section.id));

    for (const question of [
      "how do notifications work",
      "what can the assistant do",
      "who is the head of family",
      "nonsense question about nothing at all",
    ]) {
      const answer = answerQuestion(question);
      expect(ids.has(answer.sectionId), `${question} → ${answer.sectionId}`).toBe(true);
      for (const also of answer.alsoSee) expect(ids.has(also.id)).toBe(true);
    }
  });

  it("never offers the section it just answered from as further reading", () => {
    const answer = ask("can WonderHome spend money without asking?");
    expect(answer.alsoSee.map((entry) => entry.id)).not.toContain(answer.sectionId);
  });
});

describe("the guide itself", () => {
  it("has a unique id for every section, so links cannot collide", () => {
    const ids = GUIDE.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every FAQ entry points at a section that exists", () => {
    const ids = new Set(GUIDE.map((section) => section.id));
    for (const entry of FAQ) {
      expect(ids.has(entry.section), `${entry.question} → ${entry.section}`).toBe(true);
    }
  });

  it("every section says something, so no link lands on an empty heading", () => {
    for (const section of GUIDE) {
      expect(section.body.length, section.id).toBeGreaterThan(0);
      expect(section.summary.length, section.id).toBeGreaterThan(10);
    }
  });

  it("scores a section above the floor for its own title", () => {
    for (const section of GUIDE) {
      const weights = new Map<string, number>();
      expect(scoreSection(section.title, section, weights), section.id).toBeGreaterThan(
        CONFIDENCE_FLOOR,
      );
    }
  });
});
