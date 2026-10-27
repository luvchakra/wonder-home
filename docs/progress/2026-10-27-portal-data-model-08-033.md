# 2026-10-27 — Portal fetch: data model (08-033, slice 2)

Builds on slice 1 (the engine core, PR #390). This slice is the persistence the
generic portal fetcher needs, with the access model each piece deserves.

## Built
**Migration `20261027160000_portal_fetch.sql`** (applied live + verified on the
`wonderhome` project; advisors clean):
- **`portal_scrape_urls`** — the post-auth pages a household has WonderHome read.
  Connection config: an Admin manages it (`wh.admin_households()` set-form
  insert/update/delete), members may see which pages are tracked (child-gated via
  `wh.may_see_child`). Unique per `(integration_id, url)`.
- **`portal_sessions`** — the persisted browser session (cookies/tokens) so
  scheduled runs reuse a login. A **credential**: no select policy, all grants
  revoked from `authenticated`/`anon` (deny-all), so only the worker reads/writes
  it with the service role. `portal_session_status(household)` (SECURITY DEFINER,
  Admin-only) returns the connection *state* (`connected` / `reconnect_needed` /
  `never`) and reason, **never** the session blob.
- **`portal_fetch_cursors`** — hashes of items already filed, so a twice-daily run
  never re-files. Operational; deny-all for `authenticated`, worker-only.

**Repositories** (`packages/core/src/portals/`):
- `scrape-url-repository.ts` — list / add / enable / remove; **validates the page is
  same-site as the portal (SSRF) before any write**, and re-adding a disabled page
  re-enables it.
- `session-repository.ts` — `portalSessionStore` (a `SessionStore` for
  `ensureSession`, backed by the admin client), `setPortalSessionState`,
  `portalSessionStatus` (via the RPC).
- `cursor-repository.ts` — `loadSeenHashes` / `recordSeen` (admin client; pairs with
  `dedupe.selectNew`).

**Knowledge registry** — the three tables registered (excluded: config / credential /
operational).

## Verified
- `scripts/test-portal-fetch-rls.mjs` **6/6**: an Admin adds a page and a non-admin
  cannot; members see tracked pages, another household sees nothing; the session blob
  is unreadable from a browser (`permission denied`) but readable by the service role;
  the status RPC gives the state, never the blob, and nothing to a non-admin; cursors
  are unreadable to `authenticated`; an Admin can remove a page.
- Per-row-helper RLS guard **5/5**; portals vitest **27** (incl. a scrape-url
  SSRF-reject unit test); core typecheck clean; `lint:migrations` (179),
  `lint:knowledge` (175 tables), `lint:boundaries`, `lint:secrets` clean.
- Live: all three tables present, RLS on; `portal_scrape_urls` 4 policies,
  `portal_sessions`/`portal_fetch_cursors` deny-all (intended); security advisors show
  nothing new beyond the accepted `*_status` SECURITY DEFINER pattern and the
  intentional two deny-all tables.

## Open / next slices
- Playwright implementation of the `PortalPage`/`PortalBrowser` ports (+ a mock-portal
  integration test, kept out of the PR unit run).
- Fly `bom` worker + Supabase job queue + the governed internal filing endpoint.
- HomeBrain extraction wiring (validated; always-confirm default via HomeSend — owner
  confirmed the default, 2026-10-27).
- `loop-learning` provider adapter (precise login + task/channel/report reads).
- Connect-school UI: scrape-URL list + advanced hints + real Test/Fetch + reconnect.
- **KMS/Vault hardening** of the session blob **and** the existing portal password
  (one story, so all portal secrets move to envelope encryption together).

## Where the code lives
- `supabase/migrations/20261027160000_portal_fetch.sql`
- `packages/core/src/portals/{scrape-url,session,cursor}-repository.ts` (+ test)
- `packages/core/src/knowledge/registry.ts`
- `scripts/test-portal-fetch-rls.mjs`
