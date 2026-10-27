import type { PortalAdapter, PortalBrowser, PortalCredentials, PortalPage, SessionState } from "./adapter";
import type { LoginHints } from "./adapter";

/**
 * The self-healing session (story 08-033) — "reconnect and re-authenticate if the
 * session expires", with no human in the loop (Loop Learning has no OTP;
 * portals that demand one surface for reconnection rather than being bypassed).
 *
 * Every fetch calls `ensureSession` first, so no caller ever reasons about auth:
 *  1. Reuse the stored session — if the page is already signed in, that's the
 *     cheapest path and nothing else happens.
 *  2. Otherwise log in again automatically with the stored sign-in, saving the
 *     new session so the next run starts cheap again.
 *  3. Bounded retries with backoff for transient failures; a bad password or a
 *     verification demand stops and asks the owner to reconnect — it never loops
 *     (which could lock the account).
 *
 * Routine expiry is handled silently and leaves the connection `connected`; only
 * a real, unrecoverable failure moves it to `reconnect_needed`.
 */

export type ConnectionState = "connected" | "reconnect_needed";
export type ReconnectReason = "bad_password" | "verification" | "login_failed";

export interface SessionStore {
  load(): Promise<SessionState | null>;
  save(session: SessionState): Promise<void>;
}

export type EnsureSessionDeps = {
  browser: PortalBrowser;
  adapter: PortalAdapter;
  store: SessionStore;
  /** Reads the household's sign-in (service-role / KMS decrypt); called only when a login is needed. */
  credentials: () => Promise<PortalCredentials>;
  portalUrl: string;
  hints?: LoginHints;
  /** Notified whenever the connection's state is (re)settled. */
  onState?: (state: ConnectionState, reason?: ReconnectReason) => void | Promise<void>;
  maxAttempts?: number;
  backoffMs?: (attempt: number) => number;
  sleep?: (ms: number) => Promise<void>;
};

export type EnsureSessionResult =
  | { ok: true; page: PortalPage; reAuthenticated: boolean }
  | { ok: false; state: "reconnect_needed"; reason: ReconnectReason };

const DEFAULT_MAX_ATTEMPTS = 3;
const defaultBackoff = (attempt: number) => Math.min(30_000, 1000 * 2 ** (attempt - 1));
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function ensureSession(deps: EnsureSessionDeps): Promise<EnsureSessionResult> {
  const {
    browser,
    adapter,
    store,
    credentials,
    portalUrl,
    hints,
    onState,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    backoffMs = defaultBackoff,
    sleep = defaultSleep,
  } = deps;

  const saved = await store.load();
  const page = await browser.open(portalUrl, saved);

  // 1. Reuse — the common, cheap path.
  if (await adapter.isAuthenticated(page)) {
    await onState?.("connected");
    return { ok: true, page, reAuthenticated: false };
  }

  // 2. Auto re-login, bounded.
  const creds = await credentials();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await adapter.login(page, creds, hints);
    switch (result.status) {
      case "authenticated": {
        await store.save(await browser.exportSession());
        await onState?.("connected");
        return { ok: true, page, reAuthenticated: true };
      }
      case "invalid_credentials":
        await onState?.("reconnect_needed", "bad_password");
        return { ok: false, state: "reconnect_needed", reason: "bad_password" };
      case "verification_required":
        await onState?.("reconnect_needed", "verification");
        return { ok: false, state: "reconnect_needed", reason: "verification" };
      case "transient":
        if (attempt < maxAttempts) await sleep(backoffMs(attempt));
        break;
    }
  }

  await onState?.("reconnect_needed", "login_failed");
  return { ok: false, state: "reconnect_needed", reason: "login_failed" };
}
