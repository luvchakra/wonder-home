import { expect, test } from "@playwright/test";

/**
 * The landing page (design/UI-UX-REQUIREMENTS-v3.md §25–§45): navigation,
 * CTAs, both ways in, responsive layout, and reduced-motion behaviour.
 */

test("the hero says what WonderHome is and offers the way in", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("Home runs smoother.");
  await expect(page.getByRole("link", { name: /Get Started Free/ }).first()).toBeVisible();
  await expect(page.getByText("No credit card required").first()).toBeVisible();
});

test("Get Started leads to sign-up and Sign In to sign-in — the product's own authentication", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("link", { name: /Get Started Free/ }).first().click();
  await expect(page).toHaveURL(/\/sign-up$/);
  await expect(page.getByRole("heading", { level: 1, name: "Create your account" })).toBeVisible();

  await page.goto("/");
  await page.getByRole("link", { name: "Sign In" }).first().click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("every story section the requirements call for is on the page", async ({ page }) => {
  await page.goto("/");

  for (const id of ["why", "solution", "features", "families", "security", "stories", "pricing", "contact"]) {
    await expect(page.locator(`#${id}`)).toHaveCount(1);
  }
  await expect(page.getByRole("heading", { name: /Modern life is beautiful/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Meet WonderHome/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Your home is private/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /A brighter tomorrow/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Talk to the people building it/ })).toBeVisible();
});

test("nothing on the page offers a video, because there is no video", async ({ page }) => {
  await page.goto("/");

  // The approved sheets showed a "Watch Video" call to action. There is no
  // video, and a button that opens nothing is the thing this page avoids.
  await expect(page.getByRole("link", { name: /watch|video|play/i })).toHaveCount(0);
  await expect(page.locator("video")).toHaveCount(0);
});

test("every footer link goes somewhere that exists", async ({ page, request }) => {
  await page.goto("/");

  const footer = page.locator("footer");
  const hrefs = await footer.locator("a[href]").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href") ?? ""),
  );

  expect(hrefs.length).toBeGreaterThan(8);

  for (const href of hrefs) {
    if (href.startsWith("#")) {
      // An anchor has to land on something, or the link is decoration.
      await expect(page.locator(href), `footer anchor ${href}`).toHaveCount(1);
      continue;
    }

    // A gated page answers with a redirect to sign-in rather than a 404,
    // which is still a link that goes somewhere real.
    const response = await request.get(href, { maxRedirects: 0 });
    expect([200, 307, 308], `footer link ${href} → ${response.status()}`).toContain(
      response.status(),
    );
  }
});

test("the header navigation reaches each section", async ({ page, isMobile }) => {
  await page.goto("/");

  if (isMobile) {
    await page.getByRole("button", { name: "Open menu" }).click();
  }
  const nav = page.getByRole("navigation", { name: "Landing" }).first();
  await nav.getByRole("link", { name: "Pricing" }).click();
  await expect(page).toHaveURL(/#pricing$/);
});

test("pricing shows three plans and no invented prices", async ({ page }) => {
  await page.goto("/");
  const pricing = page.locator("#pricing");

  for (const plan of ["Free", "Pro", "Max"]) {
    await expect(pricing.getByRole("heading", { level: 3, name: plan })).toBeVisible();
  }
  // No amount is configured anywhere, so none may appear.
  await expect(pricing).not.toContainText(/[₹$€]\s?\d/);
});

test("placeholder stories are marked as illustrative", async ({ page }) => {
  await page.goto("/");
  const stories = page.locator("#stories");

  const figures = stories.locator("figure");
  await expect(figures).toHaveCount(3);
  await expect(stories.getByText("Illustrative", { exact: true })).toHaveCount(3);
});

test("content is readable before any motion has run", async ({ page }) => {
  // Scroll reveal must never hide information: the pricing heading exists in
  // the DOM with its text before it has scrolled into view.
  await page.goto("/");
  await expect(page.locator("#pricing h2")).toHaveText(/Start free/);
});

test("with reduced motion, everything is shown in place with no animation", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");

  const heading = page.locator("#why h2");
  await expect(heading).toBeVisible();

  const opacity = await heading.evaluate((element) => {
    const container = element.closest(".wh-reveal") as HTMLElement | null;
    return container ? getComputedStyle(container).opacity : "1";
  });
  expect(Number(opacity)).toBe(1);

  const floating = await page.locator(".wh-float").first().evaluate((element) => getComputedStyle(element).animationName);
  expect(floating).toBe("none");

  await context.close();
});

test("there is no horizontal overflow at phone width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto("/");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
