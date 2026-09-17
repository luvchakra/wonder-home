import { expect, test } from "@playwright/test";

/**
 * Shell smoke tests. These guard the contract in
 * design/UI-MOCKUP-IMPLEMENTATION-SPEC.md — five primary information areas,
 * present at every viewport — and the route gate armed in story 00-008.
 *
 * Only Home and AI are reachable anonymously today. The personal areas are
 * gated, and gain signed-in coverage when module 01 lands authentication.
 */

const PUBLIC_AREAS = [
  { label: "Home", path: "/", heading: "WonderHome" },
  { label: "AI", path: "/ai", heading: "WonderHome AI" },
];

const GATED_AREAS = ["/today", "/family", "/more", "/household/home", "/household/school"];

test("public areas render the shell and mark themselves current", async ({ page }) => {
  for (const area of PUBLIC_AREAS) {
    await page.goto(area.path);
    await expect(page.getByRole("heading", { level: 1, name: area.heading })).toBeVisible();

    const link = page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: area.label });
    await expect(link.first()).toHaveAttribute("aria-current", "page");
  }
});

test("all five primary areas are offered in the navigation", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Primary" }).first();

  for (const label of ["Home", "Today", "AI", "Family", "More"]) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
});

test("a personal area sends an anonymous visitor to sign in, remembering the destination", async ({
  page,
}) => {
  for (const path of GATED_AREAS) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/sign-in\\?next=${encodeURIComponent(path).replace("/", "%2F")}`));
  }
});

test("keyboard users reach main content before the navigation", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
});

test("empty states say what happens next instead of 'no data'", async ({ page }) => {
  // Home now greets a signed-out visitor, so the rule is checked on a public
  // area that still has nothing to show.
  await page.goto("/ai");
  await expect(page.getByRole("heading", { level: 2, name: "Nothing to show yet" })).toBeVisible();
  await expect(page.getByText(/module 0\d/i).first()).toBeVisible();
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
