import { expect, test } from "@playwright/test";

/**
 * Shell smoke tests. These guard the contract in
 * design/UI-MOCKUP-IMPLEMENTATION-SPEC.md: five primary information areas,
 * present at every viewport, each reachable and each announcing itself.
 */

const AREAS = [
  { label: "Home", path: "/", heading: "Home" },
  { label: "Today", path: "/today", heading: "Today" },
  { label: "AI", path: "/ai", heading: "WonderHome AI" },
  { label: "Family", path: "/family", heading: "Our Family" },
  { label: "More", path: "/more", heading: "More" },
];

test("the five primary areas are reachable and mark themselves current", async ({ page }) => {
  for (const area of AREAS) {
    await page.goto(area.path);
    await expect(page.getByRole("heading", { level: 1, name: area.heading })).toBeVisible();

    const current = page.getByRole("navigation", { name: "Primary" }).getByRole("link", {
      name: area.label,
      includeHidden: false,
    });
    await expect(current.first()).toHaveAttribute("aria-current", "page");
  }
});

test("keyboard users reach main content before the navigation", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
});

test("empty states say what happens next instead of 'no data'", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("heading", { level: 2, name: "Nothing to show yet" });
  await expect(card).toBeVisible();
  await expect(page.getByText(/module 0\d/i).first()).toBeVisible();
});
