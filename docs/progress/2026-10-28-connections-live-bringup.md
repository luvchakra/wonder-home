# Connections framework — live bring-up and the partial-index fix (2026-10-28)

## What happened
The Connections framework (slices 1–3, PRs #408–#410) plus the Connect-school
redesign (#411), the REST connector + tester (#412) and the pick-a-connection
Test on Connect school (#414) all merged and deployed. Bringing it live on the
production Supabase project surfaced two issues, both now resolved.

## 1. Migrations weren't live
`20261028130000_connections_adult_write` and `20261028140000_portal_connection_fetch`
were not on the live project — the Supabase MCP `apply_migration` approval kept
timing out in the cloud session. The owner ran the SQL by hand in the Supabase SQL
Editor (now the standing fallback, per CLAUDE.md "Applying a migration to the live
project"). `list_migrations` does not record editor-run SQL, so live migration
history is behind the files for these; the **schema** is correct.

## 2. Partial unique indexes broke the worker's upserts (the real bug)
`20261028140000` created two unique indexes as **partial** (`where connection_id
is not null`):
- `portal_sessions_connection (connection_id)`
- `portal_fetch_cursors_connection_unique (connection_id, scrape_url, item_hash)`

The portal worker upserts into both keyed only on the columns (`on conflict
(connection_id)` / `(connection_id, scrape_url, item_hash)`), with no matching
WHERE predicate. Postgres can't use a partial unique index as that ON CONFLICT
arbiter, so every connection fetch died at `connectionSessionStore.save` with
`42P10`. CI never caught it: `test:db` exercises RLS, not the worker's upserts.

Fix: `20261028150000_portal_connection_unique_nonpartial.sql` drops and recreates
both indexes non-partial. NULLs stay distinct in a unique index, so the many
integration rows (`connection_id IS NULL`) still never collide. Applied live by
hand; shipped as a migration for fresh databases.

Regression: `scripts/test-connections-rls.mjs` now upserts a session and a cursor
twice via `on conflict` and asserts one row each — this fails with the partial
index (42P10) and passes with the fix.

## Also found: the Fly worker was stale
`enqueue_connection_fetch_job` landing live wasn't enough — the first live fetch
failed with `readSchoolPortalCredentials failed: 22P02` because the **portal
worker on Fly** (app `wonder-home`, region `sin`) was running a build from before
the connection path (#410). There is no CI auto-deploy for the worker; the owner
ran `fly deploy`. A suggested follow-up task tracks adding a GitHub Actions deploy
so the worker never goes stale again.

## Verified
- Live indexes are non-partial (`pg_indexes`).
- End-to-end: enqueued a fetch for the household's "Secret Sauce" (saucedemo.com)
  connection → job `done` in 19s, `portal_sessions.state = connected`, result
  `{filed: 0, pages: []}` (no "Pages to read" configured yet, so nothing to file).
- `test-connections-rls.mjs` green (7/7) against a fresh DB with all migrations;
  `lint:migrations` green (186).

## Where the code lives
- Migration: `supabase/migrations/20261028150000_portal_connection_unique_nonpartial.sql`
- Test: `scripts/test-connections-rls.mjs`
- Worker path: `apps/portal-worker/src/run-job.ts` (`runConnectionFetchJob`),
  core repos `packages/core/src/portals/{session,cursor}-repository.ts`.

## Open
- To pull real data, a connection needs "Pages to read" entries; with none, a
  fetch files nothing (as seen: `filed: 0`). Extraction + filing to HomeSend is
  built (08-033 slice 5); `apps/portal-worker/README.md` predates it and is stale.
- Worker CI auto-deploy (suggested task).
