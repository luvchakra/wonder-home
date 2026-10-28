/**
 * The ports and provider contract for the generic portal fetcher (story 08-033).
 *
 * The engine (login, self-healing session, scrape) is written against these
 * interfaces, never against Playwright directly, so every rule can be tested
 * with deterministic fakes — no real browser, no network, no live credentials in
 * CI ("ports and deterministic mocks first", CLAUDE.md). A thin Playwright
 * implementation of `PortalBrowser`/`PortalPage` is a later slice; swapping the
 * runner (Fly → elsewhere) never touches this file.
 */

export type PortalCredentials = { username: string; password: string };

/**
 * A URL that means "not signed in" — a login page, or a logout / session-expired
 * page the app bounced us to when the session was stale. Landing on one of these
 * after navigating to a post-auth page is the signal that a reused session has
 * died (Playwright's persisted storage keeps cookies + localStorage but not
 * sessionStorage, where some SPAs hold the token), so the engine re-logs-in
 * rather than reading and filing the logged-out page.
 */
const AUTH_WALL_PATH = /\b(login|signin|sign-in|logon|logout|signout|sign-out|session[-_]?expired|auth)\b/i;

export function looksLikeAuthWall(url: string): boolean {
  return AUTH_WALL_PATH.test(url);
}

/** Optional per-connection selectors for portals the generic heuristics can't read. */
export type LoginHints = {
  usernameSelector?: string;
  passwordSelector?: string;
  submitSelector?: string;
  /** A selector present only when signed in. */
  signedInSelector?: string;
  /** A selector present only when a login error is shown. */
  loginErrorSelector?: string;
};

/** The opaque persisted browser session (storageState JSON: cookies + storage). */
export type SessionState = { storage: string };

/** The page operations the engine needs — the browser port. */
export interface PortalPage {
  goto(url: string): Promise<void>;
  currentUrl(): string;
  /** Visible text of the rendered page, for heuristics and extraction. */
  textContent(): Promise<string>;
  /** Whether at least one element matches the selector. */
  has(selector: string): Promise<boolean>;
  fill(selector: string, value: string): Promise<void>;
  click(selector: string): Promise<void>;
}

/** A browser context that can be seeded from, and exported to, a persisted session. */
export interface PortalBrowser {
  /** Open a context (optionally seeded with a prior session) and a page at `url`. */
  open(url: string, session: SessionState | null): Promise<PortalPage>;
  /** The current context's storage state, to persist for next time. */
  exportSession(): Promise<SessionState>;
  close(): Promise<void>;
}

/** The outcome of one login attempt, distinguished so the engine knows whether to retry. */
export type LoginResult =
  | { status: "authenticated" }
  | { status: "invalid_credentials" }
  | { status: "verification_required" } // OTP / captcha / device check
  | { status: "transient" }; // timeout / network / unknown — safe to retry

/** A portal provider: generic by default, precise for known sites. */
export interface PortalAdapter {
  id: string;
  /** Claim a portal URL (e.g. a known host). The generic adapter claims everything. */
  matches(portalUrl: string): boolean;
  /** Is this page in a signed-in state? */
  isAuthenticated(page: PortalPage): Promise<boolean>;
  /** Attempt a sign-in on the current page. */
  login(page: PortalPage, credentials: PortalCredentials, hints?: LoginHints): Promise<LoginResult>;
}
