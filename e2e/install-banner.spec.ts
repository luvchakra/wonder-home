import { devices, expect, test, type Page } from "@playwright/test";

/**
 * The install banner (story 00-011). The eligibility rules themselves are
 * unit-tested in `install-eligibility.test.ts`; these prove the wiring in a
 * real page: Chromium's install event is caught, the banner appears above
 * the page, Install opens the (stubbed) prompt, and every way of closing it
 * is remembered across a reload. A desktop never sees it.
 */

const STORAGE_KEY = "wonderhome:install-banner";

/**
 * A stand-in for Chromium's `beforeinstallprompt`: a real event, cancelable,
 * with `prompt()` and `userChoice`, answering `outcome`. The page's own
 * listener must call `preventDefault()` on it, which is recorded too.
 */
async function firePrompt(page: Page, outcome: "accepted" | "dismissed") {
  await page.evaluate((answer) => {
    const event = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string; platform: string }>;
    };
    const w = window as unknown as { __prompted: number; __defaultPrevented: boolean };
    w.__prompted ??= 0;
    event.prompt = async () => {
      w.__prompted += 1;
    };
    event.userChoice = Promise.resolve({ outcome: answer, platform: "web" });
    window.dispatchEvent(event);
    w.__defaultPrevented = event.defaultPrevented;
  }, outcome);
}

function bannerOf(page: Page) {
  return page.getByRole("region", { name: "Install the WonderHome app" });
}

/** Fires the event until the page has hydrated and caught it. */
async function showPromptBanner(page: Page, outcome: "accepted" | "dismissed" = "accepted") {
  await expect(async () => {
    await firePrompt(page, outcome);
    await expect(bannerOf(page)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

test.describe("on a phone with Chromium", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, "the banner is for phones and tablets");
  });

  test("the browser's install event brings the banner above the page, and Install opens the prompt", async ({ page }) => {
    await page.goto("/");
    await showPromptBanner(page, "accepted");

    const banner = bannerOf(page);
    expect(await page.evaluate(() => (window as unknown as { __defaultPrevented: boolean }).__defaultPrevented)).toBe(true);
    await expect(banner.getByText("WonderHome", { exact: true })).toBeVisible();
    await expect(banner.getByRole("button", { name: "Not now" })).toBeVisible();

    // In the flow above the header, not laid over it.
    const bannerBox = (await banner.boundingBox())!;
    const headerBox = (await page.locator("header").first().boundingBox())!;
    expect(bannerBox.y).toBeLessThanOrEqual(1);
    expect(headerBox.y).toBeGreaterThanOrEqual(bannerBox.y + bannerBox.height - 1);

    await banner.getByRole("button", { name: "Install" }).click();
    await expect(banner).toBeHidden();
    expect(await page.evaluate(() => (window as unknown as { __prompted: number }).__prompted)).toBe(1);
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toContain('"installed":true');

    // Installed is remembered: the next event on this browser is ignored.
    await page.reload();
    await page.waitForLoadState("networkidle");
    await firePrompt(page, "accepted");
    await page.waitForTimeout(500);
    await expect(bannerOf(page)).toHaveCount(0);
  });

  test("Not now hides it and keeps it away for fourteen days", async ({ page }) => {
    await page.goto("/sign-in");
    await showPromptBanner(page);

    await bannerOf(page).getByRole("button", { name: "Not now" }).click();
    await expect(bannerOf(page)).toHaveCount(0);

    const stored = JSON.parse((await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)) ?? "{}");
    const days = (stored.snoozedUntil - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await firePrompt(page, "accepted");
    await page.waitForTimeout(500);
    await expect(bannerOf(page)).toHaveCount(0);
  });

  test("declining the browser's own prompt snoozes it too", async ({ page }) => {
    await page.goto("/");
    await showPromptBanner(page, "dismissed");

    await bannerOf(page).getByRole("button", { name: "Install" }).click();
    await expect(bannerOf(page)).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toContain("snoozedUntil");
  });

  test("without the install event there is nothing to offer", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(bannerOf(page)).toHaveCount(0);
  });

  test("blocked storage still shows the banner and still closes it", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("blocked", "SecurityError");
        },
      });
    });
    await page.goto("/");
    await showPromptBanner(page);
    await bannerOf(page).getByRole("button", { name: "Not now" }).click();
    await expect(bannerOf(page)).toHaveCount(0);
  });

  test.describe("in Arabic", () => {
    test.use({ locale: "ar" });

    test("the banner speaks the visitor's language and lays out right to left", async ({ page }) => {
      await page.goto("/sign-in");
      await expect(async () => {
        await firePrompt(page, "accepted");
        await expect(page.getByRole("region", { name: "ثبّت تطبيق WonderHome" })).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 20_000 });

      const banner = page.getByRole("region", { name: "ثبّت تطبيق WonderHome" });
      await expect(banner).toHaveAttribute("dir", "rtl");
      await expect(banner).toHaveAttribute("lang", "ar");
      // Right to left: the close button sits at the start of the row — the left edge.
      const close = (await banner.getByRole("button", { name: "ليس الآن" }).boundingBox())!;
      const install = (await banner.getByRole("button", { name: "تثبيت" }).boundingBox())!;
      expect(close.x).toBeLessThan(install.x);
    });
  });
});

test.describe("on an iPhone with Safari", () => {
  const iPhone = devices["iPhone 13"];
  test.use({
    userAgent: iPhone.userAgent,
    viewport: iPhone.viewport,
    deviceScaleFactor: iPhone.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
  });

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "one run is enough; the desktop project only changes the browser chrome");
  });

  test("the banner explains the two taps, and \"I've added it\" is remembered", async ({ page }) => {
    await page.goto("/");
    const banner = bannerOf(page);
    await expect(banner).toBeVisible({ timeout: 20_000 });

    const howTo = banner.getByRole("button", { name: "How to" });
    await expect(howTo).toHaveAttribute("aria-expanded", "false");
    await howTo.click();
    await expect(howTo).toHaveAttribute("aria-expanded", "true");
    await expect(banner.getByText("Share in your browser.")).toBeVisible();
    await expect(banner.getByText("Choose “Add to Home Screen”.")).toBeVisible();

    await banner.getByRole("button", { name: "I’ve added it" }).click();
    await expect(banner).toHaveCount(0);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(bannerOf(page)).toHaveCount(0);
  });
});

test.describe("on a desktop", () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(isMobile, "the desktop project");
  });

  test("the banner never shows, even when the browser says the app is installable", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await firePrompt(page, "accepted");
    await page.waitForTimeout(800);
    await expect(bannerOf(page)).toHaveCount(0);
  });
});

test("the manifest lists itself as a related app, so an installed copy can be detected", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    prefer_related_applications: false,
    related_applications: [{ platform: "webapp", url: "https://home.wonderapps.biz/manifest.webmanifest" }],
  });
  const sizes = (manifest.icons as { sizes: string; purpose: string }[]).map((icon) => `${icon.sizes}:${icon.purpose}`);
  expect(sizes).toEqual(expect.arrayContaining(["192x192:any", "512x512:any", "512x512:maskable"]));
});
