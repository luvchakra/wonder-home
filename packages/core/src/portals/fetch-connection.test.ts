import { describe, expect, it, vi } from "vitest";

import type { PortalAdapter, PortalBrowser, PortalPage, SessionState } from "./adapter";
import {
  fetchConnection,
  type PortalCursorStore,
  type PortalExtractor,
  type PortalFiler,
  type RawPortalItem,
  type ScrapeTarget,
} from "./fetch-connection";
import type { SessionStore } from "./ensure-session";

const PORTAL = "https://portal.example.com/login";
const HOMEWORK = "https://portal.example.com/task/list";
const NOTICES = "https://portal.example.com/channel/42";
const LOGOUT = "https://portal.example.com/logout";

const authed: PortalAdapter = { id: "t", matches: () => true, isAuthenticated: async () => true, login: async () => ({ status: "authenticated" }) };
const dead: PortalAdapter = { id: "t", matches: () => true, isAuthenticated: async () => false, login: async () => ({ status: "invalid_credentials" }) };

class FakePage implements PortalPage {
  url = "https://portal.example.com/home";
  constructor(
    private readonly text: Record<string, string> = {},
    private readonly throwOn: Set<string> = new Set(),
    /** target url -> the auth-wall url it bounces to (a stale session) */
    private readonly redirects: Record<string, string> = {},
    /** how many times the redirect fires before the target serves normally */
    private redirectTimes = Number.POSITIVE_INFINITY,
  ) {}
  async goto(url: string) {
    if (this.throwOn.has(url)) throw new Error("navigation failed");
    if (this.redirects[url] && this.redirectTimes > 0) {
      this.redirectTimes -= 1;
      this.url = this.redirects[url]!;
      return;
    }
    this.url = url;
  }
  currentUrl() {
    return this.url;
  }
  async textContent() {
    return this.text[this.url] ?? "";
  }
  async has() {
    return false;
  }
  async fill() {}
  async click() {}
}

class FakeBrowser implements PortalBrowser {
  constructor(private readonly page: PortalPage) {}
  async open() {
    return this.page;
  }
  async exportSession(): Promise<SessionState> {
    return { storage: "s" };
  }
  async close() {}
}

const memStore = (): SessionStore => ({ load: async () => null, save: async () => {} });

function memCursors(): PortalCursorStore {
  const seen = new Map<string, Set<string>>();
  return {
    async loadSeen(url) {
      return new Set(seen.get(url) ?? []);
    },
    async recordSeen(url, hashes) {
      const set = seen.get(url) ?? new Set<string>();
      for (const h of hashes) set.add(h);
      seen.set(url, set);
    },
  };
}

const item = (over: Partial<RawPortalItem>): RawPortalItem => ({ title: "Maths worksheet", kind: "homework", sourceUrl: HOMEWORK, ...over });

function harness(opts: {
  adapter?: PortalAdapter;
  page?: FakePage;
  targets: ScrapeTarget[];
  itemsByUrl: Record<string, RawPortalItem[]>;
  cursors?: PortalCursorStore;
}) {
  const filed: RawPortalItem[][] = [];
  const filer: PortalFiler = { file: async ({ items }) => void filed.push(items) };
  const extractor: PortalExtractor = { extract: async ({ target }) => opts.itemsByUrl[target.url] ?? [] };
  const credentials = vi.fn(async () => ({ username: "u", password: "p" }));
  const cursors = opts.cursors ?? memCursors();
  const run = () =>
    fetchConnection({
      connectionId: "c1",
      portalUrl: PORTAL,
      browser: new FakeBrowser(opts.page ?? new FakePage({})),
      adapter: opts.adapter ?? authed,
      store: memStore(),
      credentials,
      targets: opts.targets,
      extractor,
      filer,
      cursors,
    });
  return { run, filed, credentials, cursors };
}

describe("fetchConnection", () => {
  const targets: ScrapeTarget[] = [
    { url: HOMEWORK, kind: "homework", childMemberId: null },
    { url: NOTICES, kind: "messages", childMemberId: null },
  ];

  it("reads each page and files the fresh items", async () => {
    const h = harness({
      page: new FakePage({ [HOMEWORK]: "x", [NOTICES]: "y" }),
      targets,
      itemsByUrl: {
        [HOMEWORK]: [item({ title: "Maths worksheet" }), item({ title: "Science reading" })],
        [NOTICES]: [item({ title: "Sports day notice", kind: "messages", sourceUrl: NOTICES })],
      },
    });
    const result = await h.run();
    expect(result).toMatchObject({ ok: true, state: "connected", reAuthenticated: false, filed: 3 });
    expect(result.ok && result.targets).toEqual([
      { url: HOMEWORK, finalUrl: HOMEWORK, chars: 1, read: 2, fresh: 2 },
      { url: NOTICES, finalUrl: NOTICES, chars: 1, read: 1, fresh: 1 },
    ]);
    expect(h.filed.flat()).toHaveLength(3);
  });

  it("files nothing on a second run — the cursor remembers", async () => {
    const cursors = memCursors();
    const opts = {
      targets: [targets[0]!],
      itemsByUrl: { [HOMEWORK]: [item({ title: "Maths worksheet" })] },
      cursors,
      page: new FakePage({ [HOMEWORK]: "x" }),
    };
    await harness(opts).run();
    const second = await harness({ ...opts, page: new FakePage({ [HOMEWORK]: "x" }) }).run();
    expect(second).toMatchObject({ filed: 0 });
    expect(second.ok && second.targets[0]).toEqual({ url: HOMEWORK, finalUrl: HOMEWORK, chars: 1, read: 1, fresh: 0 });
  });

  it("collapses duplicates within one page", async () => {
    const h = harness({
      page: new FakePage({ [HOMEWORK]: "x" }),
      targets: [targets[0]!],
      itemsByUrl: { [HOMEWORK]: [item({ title: "Maths worksheet" }), item({ title: "maths worksheet" })] },
    });
    const result = await h.run();
    expect(result).toMatchObject({ filed: 1 });
  });

  it("ends as reconnect_needed when the session can't be established — nothing filed", async () => {
    const h = harness({ adapter: dead, page: new FakePage({ [HOMEWORK]: "x" }), targets, itemsByUrl: { [HOMEWORK]: [item({})] } });
    const result = await h.run();
    expect(result).toMatchObject({ ok: false, state: "reconnect_needed", reason: "bad_password" });
    expect(h.filed).toHaveLength(0);
  });

  it("re-logs in and retries when a reused session bounced to an auth wall", async () => {
    const h = harness({
      // Reused session looks authed, but the channel bounces to /logout once;
      // after the in-context re-login it serves the real page.
      adapter: authed,
      page: new FakePage({ [NOTICES]: "Homework for today" }, new Set(), { [NOTICES]: LOGOUT }, 1),
      targets: [{ url: NOTICES, kind: "messages", childMemberId: null }],
      itemsByUrl: { [NOTICES]: [item({ title: "Homework", kind: "messages", sourceUrl: NOTICES })] },
    });
    const result = await h.run();
    expect(result).toMatchObject({ ok: true, state: "connected", reAuthenticated: true, filed: 1 });
    expect(result.ok && result.targets[0]).toMatchObject({ url: NOTICES, finalUrl: NOTICES, fresh: 1 });
    expect(h.credentials).toHaveBeenCalled();
    expect(h.filed.flat()).toHaveLength(1);
  });

  it("re-logs in when the adapter reports signed-out even without a URL change", async () => {
    // A portal that renders a login form in-place (no redirect): the URL stays a
    // normal content path, so detection has to come from the adapter, not the URL.
    const INBOX = "https://portal.example.com/inbox";
    let reloggedIn = false;
    const inPlaceLogin: PortalAdapter = {
      id: "t",
      matches: () => true,
      isAuthenticated: async (page) => reloggedIn || page.currentUrl() !== INBOX,
      login: async () => {
        reloggedIn = true;
        return { status: "authenticated" };
      },
    };
    const filed: RawPortalItem[][] = [];
    const credentials = vi.fn(async () => ({ username: "u", password: "p" }));
    const result = await fetchConnection({
      connectionId: "c1",
      portalUrl: PORTAL,
      browser: new FakeBrowser(new FakePage({ [INBOX]: "Homework for today" })),
      adapter: inPlaceLogin,
      store: memStore(),
      credentials,
      targets: [{ url: INBOX, kind: "messages", childMemberId: null }],
      extractor: { extract: async () => [item({ sourceUrl: INBOX })] },
      filer: { file: async ({ items }) => void filed.push(items) },
      cursors: memCursors(),
    });
    expect(result).toMatchObject({ ok: true, state: "connected", reAuthenticated: true, filed: 1 });
    expect(result.ok && result.targets[0]).toMatchObject({ url: INBOX, finalUrl: INBOX, read: 1, fresh: 1 });
    expect(result.ok && result.targets[0]).not.toHaveProperty("error");
    expect(credentials).toHaveBeenCalled();
    expect(filed.flat()).toHaveLength(1);
  });

  it("never files a logged-out page — a wall that can't re-login is reconnect_needed", async () => {
    const onState = vi.fn();
    const page = new FakePage({ [LOGOUT]: "Session expired!" }, new Set(), { [NOTICES]: LOGOUT });
    const filed: RawPortalItem[][] = [];
    // Reused session passes the base check, but the real page bounces to /logout
    // and the stored password no longer works, so re-login fails.
    const reuseThenCantRelogin: PortalAdapter = {
      id: "t",
      matches: () => true,
      isAuthenticated: async () => true,
      login: async () => ({ status: "invalid_credentials" }),
    };
    const result = await fetchConnection({
      connectionId: "c1",
      portalUrl: PORTAL,
      browser: new FakeBrowser(page),
      adapter: reuseThenCantRelogin,
      store: memStore(),
      credentials: async () => ({ username: "u", password: "p" }),
      targets: [{ url: NOTICES, kind: "messages", childMemberId: null }],
      extractor: { extract: async () => [item({})] },
      filer: { file: async ({ items }) => void filed.push(items) },
      cursors: memCursors(),
      onState,
    });
    expect(result).toMatchObject({ ok: false, state: "reconnect_needed", reason: "bad_password" });
    expect(result.ok === false && result.targets?.[0]).toMatchObject({ finalUrl: LOGOUT, error: "auth_wall" });
    expect(filed).toHaveLength(0);
    expect(onState).toHaveBeenCalledWith("reconnect_needed", "bad_password");
  });

  it("isolates a page that fails — the others still file", async () => {
    const h = harness({
      page: new FakePage({ [NOTICES]: "y" }, new Set([HOMEWORK])),
      targets,
      itemsByUrl: { [NOTICES]: [item({ title: "Sports day", kind: "messages", sourceUrl: NOTICES })] },
    });
    const result = await h.run();
    expect(result.ok).toBe(true);
    expect(result.ok && result.targets[0]).toMatchObject({ url: HOMEWORK, error: "navigation failed" });
    expect(result.ok && result.targets[1]).toEqual({ url: NOTICES, finalUrl: NOTICES, chars: 1, read: 1, fresh: 1 });
    expect(result.ok && result.filed).toBe(1);
  });
});
