import { expect, test } from "@playwright/test";
import { open } from "./streaming";

/**
 * The new landing (owner, 2026-11-07): the default for signed-out visitors.
 * `?landing=classic` previews the classic page the portal can switch back to.
 */

test("the new landing opens with one clear call to action above the fold", async ({ page }) => {
  await open(page, "/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Home runs better");
  const cta = page.getByRole("main").getByRole("link", { name: /Get started free/ }).first();
  await expect(cta).toBeVisible();
  const box = await cta.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await cta.click();
  await expect(page).toHaveURL(/\/sign-up/);
});

test("it never scrolls sideways, and the questions open", async ({ page }) => {
  await open(page, "/");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  const first = page.locator("details").first();
  await page.locator("summary", { hasText: "What is WonderHome?" }).first().click();
  await expect(first).toHaveAttribute("open", "");
});

test("the classic landing is still there, unchanged, and the new one is the default", async ({ page }) => {
  await open(page, "/?landing=classic");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("WonderHome takes care");
  await open(page, "/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Home runs better");
});
