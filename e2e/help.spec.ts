import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

import { FAQ, GUIDE } from "../packages/core/src/help/guide";
import { answerQuestion } from "../packages/core/src/help/search";

import { streamed } from "./streaming";

/**
 * The help centre is for signed-in members.
 *
 * Signed out, every way to its words is closed: the page redirects to
 * sign-in (and back afterwards), its search action is refused, no client
 * chunk a visitor can download carries the guide's text, and no public page
 * links to it except through sign-in. What stays public — the landing page,
 * sign-in and sign-up, password reset, terms and privacy — still loads.
 *
 * Signed in, it works: the page, its search, and headers that keep it out of
 * shared caches and search engines. That half needs a real Supabase project
 * (E2E_SUPABASE_URL, E2E_SUPABASE_PUBLISHABLE_KEY and
 * E2E_SUPABASE_SERVICE_ROLE_KEY); without one it is skipped and says so.
 */

const SENTINELS = [
  FAQ[0]!.answer.slice(0, 50),
  GUIDE[0]!.summary.slice(0, 50),
  GUIDE.find((section) => section.id === "privacy")!.body[0]!.slice(0, 50),
];

function hasGuideText(text: string): string | undefined {
  return SENTINELS.find((sentinel) => text.includes(sentinel));
}

// --- Signed out ----------------------------------------------------------------

test("a signed-out visitor asking for the guide is sent to sign-in, and the response carries none of it", async ({ request }) => {
  for (const path of ["/help", "/help/anything"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(307);
    expect(new URL(response.headers().location!, "http://x").pathname + new URL(response.headers().location!, "http://x").search, path).toBe(`/sign-in?next=${encodeURIComponent(path)}`);
    expect(hasGuideText(await response.text()), path).toBeUndefined();
  }
});

test("a signed-out browser lands on sign-in with the guide as where to return", async ({ page }) => {
  await page.goto("/help");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fhelp$/);
  expect(hasGuideText(await page.content())).toBeUndefined();
});

test("the guide's search refuses a caller with no session", async ({ request }) => {
  // A server action is a POST to the page with a Next-Action header; without a
  // session it never reaches the action, and nothing of the guide comes back.
  const response = await request.post("/help", {
    maxRedirects: 0,
    headers: { "Next-Action": "0".repeat(42), "Content-Type": "text/plain;charset=UTF-8" },
    data: JSON.stringify(["en", "what does WonderHome do?"]),
  });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toMatch(/\/sign-in\?next=%2Fhelp$/);
  expect(hasGuideText(await response.text())).toBeUndefined();
});

const PUBLIC_PAGES = ["/", "/legal", "/sign-in", "/sign-up", "/forgot-password", "/reset-password"];

test("what stays public still loads signed out, and none of it links straight to the guide", async ({ page }) => {
  for (const path of PUBLIC_PAGES) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    expect(new URL(page.url()).pathname, path).toBe(path);
    await expect(page.locator('a[href="/help"], a[href^="/help#"]'), path).toHaveCount(0);
  }
});

test("no client chunk a signed-out visitor downloads carries the guide's words", async ({ page, request }) => {
  const scripts = new Set<string>();
  page.on("response", (response) => {
    if (response.url().includes("/_next/static/") && response.url().endsWith(".js")) scripts.add(response.url());
  });
  for (const path of PUBLIC_PAGES) await page.goto(path, { waitUntil: "networkidle" });

  expect(scripts.size).toBeGreaterThan(0);
  for (const url of scripts) {
    const text = await (await request.get(url)).text();
    expect(hasGuideText(text), url).toBeUndefined();
  }
});

test("the landing page points a visitor at contact, and at the guide only through sign-in", async ({ page, isMobile }) => {
  await page.goto("/");
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();

  const nav = page.getByRole("navigation", { name: "Landing" }).first();
  await expect(nav.getByRole("link", { name: "Contact" })).toHaveAttribute("href", "#contact");
  await expect(page.getByRole("link", { name: "User guide (sign in)" })).toHaveAttribute("href", "/sign-in?next=%2Fhelp");
});

// --- The guide's own links -------------------------------------------------------

test("every FAQ entry links to a section the guide actually has", () => {
  const ids = new Set(GUIDE.map((section) => section.id));
  for (const entry of FAQ) {
    expect(ids.has(entry.section), `"${entry.question}" points at #${entry.section}`).toBe(true);
  }
});

test("every answer the assistant can give lands on a real section", () => {
  const ids = new Set(GUIDE.map((section) => section.id));
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
    for (const also of answer.alsoSee) expect(ids.has(also.id), `"${question}" also → #${also.id}`).toBe(true);
  }
});

test("the guide never promises something the product does not do", () => {
  const forbidden = [
    /we (?:can|will) pay your bills automatically/i,
    /connected to (?:google|gmail|outlook) (?:calendar|mail)/i,
    /your data (?:is|will be) used to train/i,
  ];
  const everything = GUIDE.flatMap((section) => [section.summary, ...section.body])
    .concat(FAQ.map((entry) => entry.answer))
    .join("\n");
  for (const pattern of forbidden) expect(everything, `guide contains ${pattern}`).not.toMatch(pattern);
});

// --- Signed in -------------------------------------------------------------------

const url = process.env.E2E_SUPABASE_URL;
const anonKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
/** Every E2E account uses this domain, so scripts/e2e-cleanup.mjs can find what a killed run left. */
const E2E_EMAIL_DOMAIN = "e2e.wonderhome-test.internal";

test.describe("signed in", () => {
  test.skip(!url || !anonKey || !serviceKey, "needs a real Supabase project: E2E_SUPABASE_URL, _PUBLISHABLE_KEY, _SERVICE_ROLE_KEY");
  test.describe.configure({ mode: "serial" });

  let admin: SupabaseClient;
  let userId = "";
  let householdId = "";
  const email = `help-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${E2E_EMAIL_DOMAIN}`;
  const password = `E2e!${Math.random().toString(36).slice(2, 12)}`;

  test.beforeAll(async () => {
    admin = createClient(url!, serviceKey!, { auth: { persistSession: false } });
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: "E2E Help" } });
    if (created.error) throw created.error;
    userId = created.data.user.id;

    const asUser = createClient(url!, anonKey!, { auth: { persistSession: false } });
    const signedIn = await asUser.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    const household = await asUser
      .rpc("create_household", { p_household_name: "E2E Help household", p_display_name: "E2E Help", p_timezone: "Asia/Kolkata" })
      .select()
      .single();
    if (household.error) throw household.error;
    householdId = (household.data as { household_id: string }).household_id;
  });

  test.afterAll(async () => {
    if (householdId) await admin.from("households").delete().eq("id", householdId);
    if (userId) await admin.auth.admin.deleteUser(userId);
  });

  async function signIn(page: Page) {
    await page.goto("/help");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fhelp$/);
    await streamed(page);
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }

  test("after sign-in the visitor is returned to the guide, and its search answers", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.getByRole("heading", { name: "Get help", level: 1 }).first()).toBeVisible();
    await expect(page.getByText(FAQ[0]!.question).first()).toBeVisible();

    await page.getByRole("textbox", { name: "Ask a question about WonderHome" }).fill("who can see the bills");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(page.getByText(/^Read:/).first()).toBeVisible();
  });

  test("the signed-in guide is never cached publicly or indexed", async ({ page }) => {
    await signIn(page);
    await expect(page).toHaveURL(/\/help$/);
    const response = await page.request.get("/help", { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toMatch(/private/);
    expect(response.headers()["cache-control"]).toMatch(/no-store/);
    expect(response.headers()["x-robots-tag"]).toMatch(/noindex/);
    expect(await response.text()).toMatch(/<meta name="robots" content="noindex, nofollow"/);
  });
});
