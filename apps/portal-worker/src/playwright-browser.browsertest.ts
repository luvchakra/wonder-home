/**
 * A real-browser smoke test for the Playwright adapter (story 08-033): it runs
 * actual Chromium against a tiny local mock portal and drives it through the
 * engine's `ensureSession` + `GenericAdapter`, proving login, session export and
 * session *reuse* work end to end. It launches a browser, so it is NOT part of
 * the PR unit run — run it with `npm run test:browser -w @wonderhome/portal-worker`
 * (needs the bundled Chromium).
 */
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";

import { ensureSession, type SessionStore } from "@wonderhome/core/portals/ensure-session";
import { GenericAdapter } from "@wonderhome/core/portals/generic-adapter";

import { createPlaywrightBrowser, type ManagedPortalBrowser } from "./playwright-browser.js";

const USER = "parent@example.test";
const PASS = "s3cret-pw";

let server: Server;
let base = "";
let browser: ManagedPortalBrowser;

function authed(cookie: string | undefined): boolean {
  return (cookie ?? "").includes("sid=ok");
}

before(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "/";
    const cookie = req.headers.cookie;
    if (url.startsWith("/login") && req.method === "GET") {
      if (authed(cookie)) {
        res.writeHead(302, { location: "/home" });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end(`<!doctype html><form method="post" action="/login">
        <input name="username" type="text" />
        <input name="password" type="password" />
        <button type="submit">Sign in</button></form>`);
      return;
    }
    if (url === "/login" && req.method === "POST") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const params = new URLSearchParams(body);
        if (params.get("username") === USER && params.get("password") === PASS) {
          res.writeHead(302, { location: "/home", "set-cookie": "sid=ok; Path=/" });
        } else {
          res.writeHead(200, { "content-type": "text/html" });
          res.end("<!doctype html><p>Invalid password. Please try again.</p>");
          return;
        }
        res.end();
      });
      return;
    }
    if (url === "/home" && req.method === "GET") {
      if (!authed(cookie)) {
        res.writeHead(302, { location: "/login" });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end('<!doctype html><div id="home">Welcome back</div>');
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (addr && typeof addr === "object") base = `http://127.0.0.1:${addr.port}`;
  browser = createPlaywrightBrowser();
});

function memStore(): SessionStore & { saved: { storage: string } | null } {
  let saved: { storage: string } | null = null;
  return {
    async load() {
      return saved;
    },
    async save(s) {
      saved = s;
    },
    get saved() {
      return saved;
    },
  };
}

test("logs in with a real browser, then reuses the exported session", async () => {
  const store = memStore();
  const creds = { username: USER, password: PASS };

  const first = await ensureSession({ browser, adapter: GenericAdapter, store, credentials: async () => creds, portalUrl: `${base}/login` });
  assert.equal(first.ok, true);
  assert.equal(first.ok && first.reAuthenticated, true);
  assert.ok(store.saved, "a session was persisted");

  // Fresh ensureSession seeded with the saved session must reuse it (cookie), no re-login.
  const second = await ensureSession({ browser, adapter: GenericAdapter, store, credentials: async () => creds, portalUrl: `${base}/login` });
  assert.equal(second.ok, true);
  assert.equal(second.ok && second.reAuthenticated, false);
});

test("a wrong password ends as reconnect_needed", async () => {
  const store = memStore();
  const result = await ensureSession({
    browser,
    adapter: GenericAdapter,
    store,
    credentials: async () => ({ username: USER, password: "nope" }),
    portalUrl: `${base}/login`,
  });
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "bad_password");
});

after(async () => {
  await browser?.shutdown().catch(() => {});
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
