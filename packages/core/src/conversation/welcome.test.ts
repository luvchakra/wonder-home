import { describe, expect, it } from "vitest";

import { en } from "../i18n/messages/en";
import { translator } from "../i18n/translate";
import { answerWelcome, isNothing, isSkip, nextTopic, welcomeMemory, welcomeOpening, welcomeQuestion } from "./welcome";

const t = translator("en", en);
const household = { name: "Kunal", people: ["Kunal", "Upasana", "Asmi", "Manan"], helpers: ["Rita"], pets: ["Bruno"] };

describe("the welcome's opening", () => {
  it("welcomes by name, says who is home, how to talk, then asks one question", () => {
    const [about, howTo, question] = welcomeOpening(t, "en", household);
    expect(about).toContain("Welcome to the WonderHome family, Kunal!");
    expect(about).toContain("Kunal, Upasana, Asmi, and Manan");
    expect(about).toContain("And Bruno, of course.");
    expect(about).toContain("Rita helps around the home.");
    expect(howTo).toMatch(/type a message here, tap the mic to say one thing, or start a live conversation/);
    expect(question).toBe("What does your family love to eat? Favourite dishes, cuisines, anything.");
  });

  it("says nothing about pets or helpers a household does not have", () => {
    const [about] = welcomeOpening(t, "en", { name: "Asha", people: ["Asha"], helpers: [], pets: [] });
    expect(about).not.toMatch(/of course|helps around/);
  });
});

describe("the questions", () => {
  it("go food, dislikes, together, pets, and then end", () => {
    expect(nextTopic("food")).toBe("dislikes");
    expect(nextTopic("dislikes")).toBe("together");
    expect(nextTopic("together")).toBe("pets");
    expect(nextTopic("pets")).toBeNull();
  });

  it("ask about the household's own pets by name, or whether there are any", () => {
    expect(welcomeQuestion(t, "en", "pets", { pets: ["Bruno"] })).toContain("Tell me about Bruno.");
    expect(welcomeQuestion(t, "en", "pets", { pets: ["Bruno", "Mia"] })).toContain("Bruno and Mia");
    expect(welcomeQuestion(t, "en", "pets", { pets: [] })).toBe("Any pets at home, or one on the way?");
  });
});

describe("an answer", () => {
  it("is kept as said, under its topic, and the next question follows", () => {
    const step = answerWelcome({ topic: "food", answer: "Paneer, dal and pasta", sessionId: "s1", household }, { t, language: "en", english: t });
    expect(step.memory).toMatchObject({ key: "household.welcome.food", value: { statement: "The family loves to eat: Paneer, dal and pasta", said: "Paneer, dal and pasta" }, status: "confirmed" });
    expect(step.topic).toBe("dislikes");
    expect(step.reply).toBe("Got it, I'll remember that. Is there anything someone doesn't eat or doesn't like? An allergy, or a food someone avoids?");
  });

  it("of nothing keeps nothing, and moves on", () => {
    expect(isNothing("Nope.")).toBe(true);
    const step = answerWelcome({ topic: "dislikes", answer: "nothing", sessionId: "s1", household }, { t, language: "en", english: t });
    expect(step.memory).toBeNull();
    expect(step.reply.startsWith("Okay, nothing to note there.")).toBe(true);
    expect(step.topic).toBe("together");
  });

  it("to the last question ends the welcome", () => {
    const step = answerWelcome({ topic: "pets", answer: "Bruno eats twice a day", sessionId: "s1", household }, { t, language: "en", english: t });
    expect(step.topic).toBeNull();
    expect(step.reply).toContain("under HomeBrain");
  });

  it("of skip ends the welcome without keeping anything", () => {
    expect(isSkip("Skip")).toBe(true);
    expect(isSkip("not now!")).toBe(true);
    expect(isSkip("skip the onions")).toBe(false);
    expect(isSkip("छोड़ो")).toBe(true);
    expect(isSkip("वगळा")).toBe(true);
    expect(isSkip("Überspringen")).toBe(true);
    expect(isSkip("saltar")).toBe(true);
    expect(isSkip("Passer")).toBe(true);
    expect(isSkip("跳过")).toBe(true);
    expect(isSkip("تخطي")).toBe(true);
    const step = answerWelcome({ topic: "food", answer: "later", sessionId: "s1", household }, { t, language: "en", english: t });
    expect(step).toMatchObject({ topic: null, memory: null, reply: "No problem, we can do this another time. What would you like to do first?" });
  });

  it("is never longer than a belief may be", () => {
    expect(welcomeMemory("together", "x".repeat(1000), "s1")?.value).toMatchObject({ said: "x".repeat(280) });
  });
});
