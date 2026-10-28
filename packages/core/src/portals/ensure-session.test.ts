import { describe, expect, it, vi } from "vitest";

import type { PortalBrowser, PortalCredentials, PortalPage, SessionState } from "./adapter";
import { ensureSession, type ConnectionState, type ReconnectReason, type SessionStore } from "./ensure-session";
import { GenericAdapter } from "./generic-adapter";

const LOGIN_URL = "https://portal.example.com/login";
const APP_URL = "https://portal.example.com/home";
const CORRECT: PortalCredentials = { username: "parent@example.test", password: "s3cret" };

/** A scriptable login page: a real-looking form that signs in when the right creds are filled. */
class FakePage implements PortalPage {
  url: string;
  clicks = 0;
  private mode: "login" | "authed";
  private filled: Record<string, string> = {};
  private text = "";

  constructor(
    private readonly opts: { startAuthed: boolean; outcome?: "verify" | "transient"; transientBefore?: number } = { startAuthed: false },
  ) {
    this.mode = opts.startAuthed ? "authed" : "login";
    this.url = opts.startAuthed ? APP_URL : LOGIN_URL;
  }

  async goto(url: string) {
    this.url = url;
  }
  currentUrl() {
    return this.url;
  }
  async textContent() {
    return this.text;
  }
  async has(selector: string) {
    if (this.mode === "authed") return selector === "#home";
    if (selector === 'input[type="password"]') return true;
    if (selector === 'input[type="email"]') return true;
    return selector.startsWith("button");
  }
  async fill(selector: string, value: string) {
    this.filled[selector] = value;
  }
  async click() {
    this.clicks += 1;
    if (this.opts.outcome === "verify") {
      this.text = "Please enter the one-time verification code we sent you.";
      return;
    }
    if (this.opts.transientBefore && this.clicks <= this.opts.transientBefore) {
      this.text = "loading…"; // no error, not signed in → transient
      return;
    }
    const ok = this.filled['input[type="email"]'] === CORRECT.username && this.filled['input[type="password"]'] === CORRECT.password;
    if (ok) {
      this.mode = "authed";
      this.url = APP_URL;
      this.text = "Welcome back";
    } else {
      this.text = "Invalid password. Please try again.";
    }
  }
}

class FakeBrowser implements PortalBrowser {
  page: FakePage;
  exports = 0;
  constructor(page: FakePage) {
    this.page = page;
  }
  async open(): Promise<PortalPage> {
    return this.page;
  }
  async exportSession(): Promise<SessionState> {
    this.exports += 1;
    return { storage: `state-${this.exports}` };
  }
  async close() {}
}

function memStore(initial: SessionState | null = null): SessionStore & { value: SessionState | null } {
  let value = initial;
  return {
    async load() {
      return value;
    },
    async save(s) {
      value = s;
    },
    get value() {
      return value;
    },
  };
}

function harness(page: FakePage, store = memStore(), credsValue = CORRECT) {
  const states: { state: ConnectionState; reason?: ReconnectReason }[] = [];
  const browser = new FakeBrowser(page);
  const credentials = vi.fn(async () => credsValue);
  const sleep = vi.fn(async () => {});
  const run = () =>
    ensureSession({
      browser,
      adapter: GenericAdapter,
      store,
      credentials,
      portalUrl: LOGIN_URL,
      onState: (state, reason) => {
        states.push({ state, reason });
      },
      sleep,
    });
  return { run, states, browser, credentials, sleep, store };
}

describe("ensureSession", () => {
  it("reuses a valid session without logging in", async () => {
    const h = harness(new FakePage({ startAuthed: true }));
    const result = await h.run();
    expect(result).toMatchObject({ ok: true, reAuthenticated: false });
    expect(h.credentials).not.toHaveBeenCalled();
    expect(h.states).toEqual([{ state: "connected", reason: undefined }]);
    expect(h.browser.exports).toBe(0); // nothing re-saved
  });

  it("re-authenticates automatically when the session has expired", async () => {
    const h = harness(new FakePage({ startAuthed: false }));
    const result = await h.run();
    expect(result).toMatchObject({ ok: true, reAuthenticated: true });
    expect(h.credentials).toHaveBeenCalledOnce();
    expect(h.store.value).toEqual({ storage: "state-1" }); // new session persisted
    expect(h.states.at(-1)).toEqual({ state: "connected", reason: undefined });
  });

  it("stops and asks to reconnect on a bad password — no retry loop", async () => {
    const h = harness(new FakePage({ startAuthed: false }), memStore(), { username: CORRECT.username, password: "wrong" });
    const result = await h.run();
    expect(result).toMatchObject({ ok: false, state: "reconnect_needed", reason: "bad_password" });
    expect(h.store.value).toBeNull(); // nothing saved
    expect(h.sleep).not.toHaveBeenCalled();
  });

  it("surfaces a verification demand as reconnect_needed, never bypasses it", async () => {
    const h = harness(new FakePage({ startAuthed: false, outcome: "verify" }));
    const result = await h.run();
    expect(result).toMatchObject({ ok: false, state: "reconnect_needed", reason: "verification" });
  });

  it("retries transient failures with backoff, then succeeds", async () => {
    const page = new FakePage({ startAuthed: false, transientBefore: 1 });
    const h = harness(page);
    const result = await h.run();
    expect(result).toMatchObject({ ok: true, reAuthenticated: true });
    expect(page.clicks).toBe(2); // first transient, second ok
    expect(h.sleep).toHaveBeenCalledOnce();
  });

  it("gives up as reconnect_needed after exhausting attempts", async () => {
    const page = new FakePage({ startAuthed: false, transientBefore: 99 });
    const h = harness(page);
    const result = await h.run();
    expect(result).toMatchObject({ ok: false, state: "reconnect_needed", reason: "login_failed" });
    expect(page.clicks).toBe(3); // default maxAttempts
    expect(h.sleep).toHaveBeenCalledTimes(2); // backoff between attempts, not after the last
  });
});
