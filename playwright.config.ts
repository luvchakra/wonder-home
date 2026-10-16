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

/**
 * CI sets PLAYWRIGHT_CHANNEL=chrome to drive the Google Chrome the runner
 * image already has, instead of downloading Chromium and its system
 * libraries on every run. A channel and an executable path are exclusive.
 */
const channel = process.env.PLAYWRIGHT_CHANNEL || undefined;
const launch = channel ? { channel } : { launchOptions: { executablePath } };

/**
 * The project the app under test talks to. E2E never touches production
 * data: by default it is a placeholder URL, against which every request
 * without a session is answered locally, which is all today's specs need.
 * A dedicated test project can be named with E2E_SUPABASE_URL and
 * E2E_SUPABASE_PUBLISHABLE_KEY; the live project is refused outright.
 *
 * These are set on the server Playwright starts, so they win over whatever a
 * developer's apps/web/.env.local holds (Next.js never overrides a variable
 * that is already set). Server-side keys that could reach a real service are
 * blanked for the same reason.
 */
const PRODUCTION_PROJECT_REFS = ["kqxndableyysxqhxiorz"];
const supabaseUrl = process.env.E2E_SUPABASE_URL || "https://ci.placeholder.supabase.co";
if (PRODUCTION_PROJECT_REFS.some((ref) => supabaseUrl.includes(ref))) {
  throw new Error(`E2E refuses to run against the production Supabase project (${supabaseUrl}).`);
}
const serverEnv = {
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.E2E_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_ci_placeholder_key",
  SUPABASE_SERVICE_ROLE_KEY: "",
  WONDERHOME_AI_KEY: "",
};

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
  // Playwright defaults to half the cores; the specs are short and mostly
  // wait on the server, so CI's four cores all get a worker.
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], ...launch } },
    // The API-only specs never open a page, so a second viewport would run
    // the identical requests twice (164 of 432 tests). They run once, on mobile.
    {
      name: "desktop",
      testIgnore: /(api-contract|domains)\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], ...launch },
    },
  ],
  webServer: {
    // E2E_SKIP_BUILD is set by callers that already ran `npm run build`
    // themselves (the nightly workflow, and `npm run verify` locally) —
    // without it, this command builds first, under serverEnv, which is what
    // a local `npm run test:e2e -- <spec files>` wants (docs/CI.md).
    command: process.env.E2E_SKIP_BUILD
      ? `npm run start -w apps/web -- --port ${PORT}`
      : `npm run build -w apps/web && npm run start -w apps/web -- --port ${PORT}`,
    env: serverEnv,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
