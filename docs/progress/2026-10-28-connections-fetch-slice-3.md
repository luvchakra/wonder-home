# 2026-10-28 — Connections framework: generic connection fetch + Test (slice 3)

Makes a browser-automation **connection** fetchable by any module, and adds a
**Test connection** per connection (owner, 2026-10-28: "not limited to school,
generic, any module"; "give option to test connection for each connection").

## What was built

**Engine, keyed by connection (additive).** Migration
`20261028140000_portal_connection_fetch`: `connection_id` added beside
`integration_id` (now nullable) on `portal_scrape_urls`, `portal_sessions`,
`portal_fetch_cursors`, `portal_fetch_jobs` — so the school integration path keeps
working while any connection can be fetched. New: `portal_connection_status`
(member-readable), `enqueue_connection_fetch_job` (adult auth), `claim_portal_fetch_job`
now also returns `connection_id`, and `enqueue_all_portal_fetch_jobs` sweeps
connected browser-automation connections too. Adults manage a connection's pages.

**Core.** Connection-keyed variants added beside the integration ones:
`listConnectionScrapeUrls` / `addConnectionScrapeUrl` (scrape-url-repository),
`connectionSessionStore` / `setConnectionSessionState` / `connectionSessionStatus`
(session-repository), `connectionCursorStore` (cursor-repository),
`latestConnectionFetchJob` (job-repository).

**Worker.** `runConnectionFetchJob` resolves a connection's sign-in from its
params (url/username) + `connection_secrets` (password), resolves the adapter from
the URL, and runs the same governed `fetchConnection`. `index.ts` routes a claimed
job to the connection path or the legacy integration path by which id it carries.

**UI.** On the Connections page, a browser-automation connection now shows, inline:
a **Test connection** button (enqueues a fetch and polls the outcome — "Connected —
it works." / "That didn't work. <reason>"), a reconnect banner, and **Pages to
read** (add / stop / remove). `connection-actions.ts`: test, fetch-status poll,
add/remove/enable page. `manage.connections.*` strings in all 8 languages.

## Verified
- core + web + worker typecheck; i18n parity (7/7); ESLint; `lint:migrations` (185);
  registry unit test. Web build green.
- `test-connections-rls.mjs` extended: an adult adds a connection page, a child can't,
  members (incl. child) can see them.
- Engine proven end-to-end against a non-blocking test site (the-internet.herokuapp.com):
  login + read a post-auth page succeeds.

## Open / needs the owner
- Migrations `20261028130000` (slice-2 adult-write) and `20261028140000` (this slice)
  are **not yet applied live** — the Supabase approval prompt kept timing out. They
  must be applied (in that order) for connection writes to be adult-scoped and for
  Test/Fetch to work in production. CI `test:db` validates both on a fresh DB.

## Next (owner asks, separate slices)
- Redesign the Connect-school page minimally around connections (drop the demo
  portal + inline credentials; point at a connection).
- A **REST** connector type with a request/response tester.

## Where the code lives
`supabase/migrations/20261028140000_portal_connection_fetch.sql`,
`packages/core/src/portals/{scrape-url,session,cursor,job}-repository.ts`,
`apps/portal-worker/src/{run-job,queue,index}.ts`,
`apps/web/app/(auth)/connection-actions.ts`,
`apps/web/app/_components/connections-manager.tsx`,
`apps/web/app/household/connections/page.tsx`,
`packages/core/src/i18n/messages/areas/household/*.ts`.
