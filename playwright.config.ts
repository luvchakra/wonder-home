import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke configuration (story 00-005).
 *
 * Mobile-first is a product requirement, not a nicety, so the default project
 * is a phone viewport; desktop runs the same specs to prove the shell keeps its
 * information hierarchy at both sizes.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * Some sandboxes ship a pinned Chromium that does not match this Playwright
 * release's expected build number. PLAYWRIGHT_CHROMIUM_PATH points at that
 * binary so the suite runs there without re-downloading; CI leaves it unset and
 * uses `playwright install`.
 *
 * When it is unset we look for a pinned build ourselves, because the failure
 * it prevents is a quiet one: the specs that only use `request` still pass, so
 * a run can report green while every spec that needs a browser never opened
 * one. On a machine with a normal install there is nothing to find and this
 * costs one directory read.
 */
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || findPinnedChromium();

function findPinnedChromium(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root) return undefined;

  try {
    const build = readdirSync(root)
      .filter((entry) => /^chromium-\d+$/.test(entry))
      .sort()
      .pop();
    if (!build) return undefined;

    const binary = join(root, build, "chrome-linux", "chrome");
    return existsSync(binary) ? binary : undefined;
  } catch {
    return undefined;
  }
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: { executablePath } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
  ],
  webServer: {
    command: `npm run build -w apps/web && npm run start -w apps/web -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
