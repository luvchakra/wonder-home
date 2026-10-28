import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import type { PortalBrowser, PortalPage, SessionState } from "@wonderhome/core/portals/adapter";

/**
 * The real browser behind the engine's `PortalBrowser`/`PortalPage` ports
 * (story 08-033). Everything the engine reasons about — login, self-healing
 * session, reading pages — is written against the ports in core and tested with
 * fakes; this is the one place Playwright is touched, so it stays out of the web
 * bundle and the engine's tests.
 *
 * One Chromium process is reused across jobs; each `open` gets a fresh context
 * (never shared cookies between households), seeded from the persisted session
 * when there is one. `goto`/`click` wait for the SPA to settle so the rendered
 * text is there to read.
 */

const NAV_TIMEOUT_MS = 45_000;
const SETTLE_MS = 1_500;
const CONTENT_MS = 10_000;

export type PlaywrightBrowserOptions = {
  /** Route through the egress proxy for real portals (e.g. process.env.HTTPS_PROXY); omit for localhost. */
  proxyServer?: string;
  userAgent?: string;
  locale?: string;
  timezoneId?: string;
};

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

class PlaywrightPage implements PortalPage {
  constructor(private readonly page: Page) {}

  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });
    await this.settle();
  }

  currentUrl(): string {
    return this.page.url();
  }

  async textContent(): Promise<string> {
    return (await this.page.evaluate(() => document.body?.innerText ?? "")) ?? "";
  }

  async has(selector: string): Promise<boolean> {
    return (await this.page.locator(selector).count()) > 0;
  }

  async fill(selector: string, value: string): Promise<void> {
    await this.page.fill(selector, value, { timeout: NAV_TIMEOUT_MS });
  }

  async type(selector: string, value: string): Promise<void> {
    // Clear, then type key by key so a controlled (React/Vue) input actually
    // captures the value — a plain fill can leave the component's state empty.
    const field = this.page.locator(selector).first();
    await field.click({ timeout: NAV_TIMEOUT_MS });
    await field.fill("", { timeout: NAV_TIMEOUT_MS });
    await field.pressSequentially(value, { delay: 15, timeout: NAV_TIMEOUT_MS });
  }

  async click(selector: string): Promise<void> {
    await this.page.click(selector, { timeout: NAV_TIMEOUT_MS });
    await this.settle();
  }

  async waitForGone(selector: string, timeoutMs = 15_000): Promise<void> {
    await this.page.locator(selector).first().waitFor({ state: "detached", timeout: timeoutMs }).catch(() => {});
  }

  private async settle(): Promise<void> {
    await this.page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT_MS }).catch(() => {});
    // A single-page app (a chat/portal) often paints its real text only after
    // the first data call resolves, which can be after networkidle. Give the
    // body a bounded chance to fill before we read it, so a deep link doesn't
    // read an empty shell. Bounded, so a genuinely sparse page still returns.
    await this.page
      .waitForFunction(() => (document.body?.innerText ?? "").trim().length > 40, undefined, { timeout: CONTENT_MS })
      .catch(() => {});
    await this.page.waitForTimeout(SETTLE_MS);
  }
}

export type ManagedPortalBrowser = PortalBrowser & { shutdown(): Promise<void> };

export function createPlaywrightBrowser(options: PlaywrightBrowserOptions = {}): ManagedPortalBrowser {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  async function ensureBrowser(): Promise<Browser> {
    if (!browser) {
      browser = await chromium.launch({
        headless: true,
        proxy: options.proxyServer ? { server: options.proxyServer } : undefined,
      });
    }
    return browser;
  }

  async function closeContext(): Promise<void> {
    if (context) {
      await context.close().catch(() => {});
      context = null;
    }
  }

  return {
    async open(url: string, session: SessionState | null): Promise<PortalPage> {
      const launched = await ensureBrowser();
      await closeContext();
      context = await launched.newContext({
        storageState: session ? JSON.parse(session.storage) : undefined,
        userAgent: options.userAgent ?? DEFAULT_UA,
        viewport: { width: 1280, height: 900 },
        locale: options.locale ?? "en-IN",
        timezoneId: options.timezoneId ?? "Asia/Kolkata",
      });
      const page = await context.newPage();
      const portalPage = new PlaywrightPage(page);
      await portalPage.goto(url);
      return portalPage;
    },

    async exportSession(): Promise<SessionState> {
      if (!context) throw new Error("no browser context to export a session from");
      const state = await context.storageState();
      return { storage: JSON.stringify(state) };
    },

    async close(): Promise<void> {
      await closeContext();
    },

    async shutdown(): Promise<void> {
      await closeContext();
      if (browser) {
        await browser.close().catch(() => {});
        browser = null;
      }
    },
  };
}
