import { expect, test } from "@playwright/test";

import { FAQ, GUIDE } from "../packages/core/src/help/guide";
import { answerQuestion } from "../packages/core/src/help/search";

/**
 * The help centre.
 *
 * Signed out, it is gated like every other personal surface — checked in
 * shell.spec.ts along with the rest. What is worth proving here is that the
 * guide's own links are sound: every anchor an answer or an FAQ entry can
 * produce must land on a section that exists, because a help page whose
 * links go nowhere is worse than no help page.
 */

test("every FAQ entry links to a section the guide actually has", () => {
  const ids = new Set(GUIDE.map((section) => section.id));

  for (const entry of FAQ) {
    expect(ids.has(entry.section), `"${entry.question}" points at #${entry.section}`).toBe(true);
  }
});

test("every answer the assistant can give lands on a real section", () => {
  const ids = new Set(GUIDE.map((section) => section.id));

  // Every section's own title, every FAQ question, and a few things somebody
  // would plausibly type while stuck.
  const questions = [
    ...GUIDE.map((section) => section.title),
    ...FAQ.map((entry) => entry.question),
    "how do I stop it emailing me at night",
    "who can see the bills",
    "I am locked out",
    "",
  ];

  for (const question of questions) {
    const answer = answerQuestion(question);
    expect(ids.has(answer.sectionId), `"${question}" → #${answer.sectionId}`).toBe(true);
    for (const also of answer.alsoSee) {
      expect(ids.has(also.id), `"${question}" also → #${also.id}`).toBe(true);
    }
  }
});

test("the guide never promises something the product does not do", () => {
  // These are the claims the codebase is careful never to make. If one shows
  // up in the guide, the guide has drifted ahead of the product.
  const forbidden = [
    /we (?:can|will) pay your bills automatically/i,
    /connected to (?:google|gmail|outlook) (?:calendar|mail)/i,
    /your data (?:is|will be) used to train/i,
  ];

  const everything = GUIDE.flatMap((section) => [section.summary, ...section.body])
    .concat(FAQ.map((entry) => entry.answer))
    .join("\n");

  for (const pattern of forbidden) {
    expect(everything, `guide contains ${pattern}`).not.toMatch(pattern);
  }
});
