import { describe, expect, it } from "vitest";

import { normaliseUtterance } from "./normalise";

const canon = (text: string) => normaliseUtterance(text).canonical;

describe("normaliseUtterance", () => {
  it("takes off what Gemini passed on word for word (the owner's report, 2026-10-18)", () => {
    expect(canon("Okay, so. Okay, who are the family members in this household?")).toBe("Who are the family members in this household?");
  });

  it("takes off any number of spoken lead-ins and their punctuation", () => {
    expect(canon("Um, okay — what's for dinner?")).toBe("What's for dinner?");
    expect(canon("Hey WonderHome, add milk")).toBe("Add milk");
    expect(canon("ok so add eggs to the list")).toBe("Add eggs to the list");
    expect(canon("Alright. Okay. Remind me to call mum")).toBe("Remind me to call mum");
  });

  it("says a word said twice once", () => {
    expect(canon("Can you can you add bread")).toBe("Can you add bread");
    expect(canon("Add the the milk")).toBe("Add the milk");
  });

  it("unwraps a polite wrapper when a question follows it", () => {
    expect(canon("Can you tell me who is in my family?")).toBe("Who is in my family?");
    expect(canon("I want to know what bills are due")).toBe("What bills are due");
    expect(canon("Do you know when Asmi's exam is?")).toBe("When Asmi's exam is?");
  });

  it("drops a polite tail but keeps the question mark", () => {
    expect(canon("Add milk please")).toBe("Add milk");
    expect(canon("What is on today, thanks?")).toBe("What is on today?");
  });

  it("keeps the \"now\" of \"not now\", which is an answer, not a tail (HT-166)", () => {
    expect(canon("not now")).toBe("not now");
    expect(canon("Not now, thanks")).toBe("Not now");
    expect(canon("Add milk now")).toBe("Add milk");
  });

  it("never strips a word that starts a real sentence", () => {
    expect(canon("Soup for dinner tonight")).toBe("Soup for dinner tonight");
    expect(canon("Right now we are out of milk")).toBe("Right now we are out of milk");
    expect(canon("Okra is running low")).toBe("Okra is running low");
    expect(canon("Hindi class is on Friday")).toBe("Hindi class is on Friday");
  });

  it("leaves a short reply exactly as it was said", () => {
    expect(canon("Okay")).toBe("Okay");
    expect(canon("ok.")).toBe("ok.");
    expect(canon("Yes")).toBe("Yes");
    expect(canon("okay okay")).toBe("okay");
  });

  it("never touches a word that changes meaning", () => {
    expect(canon("Okay, don't add milk")).toBe("Don't add milk");
    expect(canon("So, not milk, almond milk")).toBe("Not milk, almond milk");
  });

  it("notices a request to look again", () => {
    expect(normaliseUtterance("Okay, but you can can you check WonderHome database and find out?").deeper).toBe(true);
    expect(normaliseUtterance("Can you look in the records again?").deeper).toBe(true);
    expect(normaliseUtterance("Check the milk").deeper).toBe(false);
    expect(normaliseUtterance("Who is in my family?").deeper).toBe(false);
  });

  it("reads a plan said as news as the plan (the owner's report, 2026-10-18)", () => {
    expect(canon("Okay I am planning a movie night on Friday this week")).toBe("Plan a movie night on Friday this week");
    expect(canon("We're planning a picnic on Sunday")).toBe("Plan a picnic on Sunday");
    expect(canon("Let's plan a dinner on Saturday")).toBe("Plan a dinner on Saturday");
    expect(canon("I am planting tomatoes")).toBe("I am planting tomatoes");
  });

  it("says what it took off", () => {
    expect(normaliseUtterance("Okay, so. Okay, who is here?").stripped).toEqual(["okay so", "okay"]);
  });
});
