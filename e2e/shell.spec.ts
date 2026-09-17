import { expect, test } from "@playwright/test";

/**
 * Shell smoke tests. These guard the contract in design/UI-UX-REQUIREMENTS-v3.md
 * — five primary information areas, present at every viewport — and the route
 * gate armed in story 00-008.
 *
 * Signed out, "/" is the landing page. Every personal area, the AI assistant
 * included, is gated and remembers where the visitor was going.
 */
const GATED_AREAS = [
  "/today",
  "/ai",
  "/family",
  "/more",
  "/household",
  "/household/home",
  "/household/members",
  "/household/responsibilities",
  "/household/integrations",
  "/school",
  "/groceries",
  "/meals",
  "/bills",
  "/househelper",
  "/notifications",
  "/certification",
  "/settings",
];

test("a personal area sends an anonymous visitor to sign in, remembering the destination", async ({ page }) => {
  for (const path of GATED_AREAS) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(path).replace(/\//g, "%2F")}$`));
  }
});

test("the old school route still lands somewhere sensible", async ({ page }) => {
  await page.goto("/household/school");
  // Gated first; a signed-in member is then redirected on to /school.
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fhousehold%2Fschool/);
});

test("keyboard users reach main content before anything else", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
});

test("the sign-in screen carries the brand and one task", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back!" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  // No product navigation on a signed-out screen.
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
});

test("every response carries the baseline security headers", async ({ page }) => {
  const response = await page.goto("/");
  const headers = response?.headers() ?? {};

  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers).not.toHaveProperty("x-powered-by");
});

test("the app is installable: a manifest and an icon are served", async ({ request }) => {
  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  expect(await manifest.json()).toMatchObject({ name: "WonderHome", display: "standalone" });

  const icon = await request.get("/icon.svg");
  expect(icon.status()).toBe(200);
});
