import { expect, test } from "@playwright/test";

import { FAQ, GUIDE } from "../packages/core/src/help/guide";
import { answerQuestion } from "../packages/core/src/help/search";

/**
 * The help centre.
 *
 * Deliberately readable signed out: somebody who cannot get in is exactly the
 * person who needs it, and nothing in the guide is about a particular
 * household. That is asserted here rather than assumed, because "the help page
 * needs a login" is the kind of regression a route-policy edit makes quietly.
 *
 * The rest is about the guide's own links being sound: every anchor an answer
 * or an FAQ entry can produce must land on a section that exists, because a
 * help page whose links go nowhere is worse than no help page.
 */

test("an anonymous visitor can read the whole guide", async ({ page }) => {
  await page.goto("/help");

  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole("heading", { name: "Get help", level: 1 })).toBeVisible();
  // A section from the guide itself, so this fails if the page renders a
  // frame with nothing in it.
  await expect(page.getByText(FAQ[0]!.question).first()).toBeVisible();
});

test("the landing page's Help link opens the guide, with no sign-in in between", async ({ page, isMobile }) => {
  // The whole point of a public guide: a visitor who has not signed up can get
  // to it in one click. A redirect through /sign-in here would defeat it even
  // though the guide itself is reachable. Tracked via actual main-frame
  // navigations rather than every network response, because Next prefetches
  // other on-screen links (Sign In among them) regardless of what was clicked.
  await page.goto("/");

  if (isMobile) {
    await page.getByRole("button", { name: "Open menu" }).click();
  }

  const navigations: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname);
  });

  const nav = page.getByRole("navigation", { name: "Landing" }).first();
  await nav.getByRole("link", { name: "Help" }).click();
  await page.waitForURL(/\/help$/);

  await expect(page.getByRole("heading", { name: "Get help", level: 1 })).toBeVisible();
  expect(navigations.filter((path) => path.startsWith("/sign-in")), "it navigated via sign-in").toEqual([]);
});

test("the landing footer's guide link opens it too", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: "User guide", exact: true }).click();
  await expect(page).toHaveURL(/\/help$/);
});

test("a signed-out reader is offered the way in, not a link that bounces them", async ({ page }) => {
  await page.goto("/help");

  await expect(page.getByRole("link", { name: "Get started" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Talk to WonderHome" })).toHaveCount(0);
});

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
