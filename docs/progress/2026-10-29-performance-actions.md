# Performance page: action buttons

Date: 2026-10-29. Owner ask: buttons to take immediate action wherever possible. This is the first write surface on the platform-admin pages, so it is a fixed allowlist, not a console.

## What a tip card can do now
| Tip | Button | Kind |
|---|---|---|
| Table read in full | Refresh planner statistics (ANALYZE, that table) | runs; operator or owner |
| Table read in full | Copy: show this table's indexes | copy, read only |
| Slow query | Reset query statistics | runs; owner, password re-check |
| Connections idle in a transaction | End stuck connections (count shown first) | runs; owner, password re-check |
| Unused indexes | Copy: DROP INDEX CONCURRENTLY IF EXISTS for the largest unused ones | copy only |
| Duplicate indexes (new tip) | Copy: drop the duplicates, keeping one | copy only |
| Dead rows | Copy: VACUUM (ANALYZE) "public"."table" | copy only (VACUUM cannot run in a function) |
| Every tip | Create a task (story id, finding, fix, "applied through a migration PR") | copies text |
| Page header | Re-run the checks now | read only re-render; the page is never cached |

DDL is never run from the web. Missing-index fixes need to know the columns, which the figures do not give, so that tip offers the read-only index listing and the story id, not a guessed `CREATE INDEX`.

## Security model
- Migration `20261029230000_platform_performance_actions.sql`: `platform_perf_analyze`, `platform_perf_reset_statements`, `platform_perf_end_idle_sessions`, `platform_perf_last_runs`. SECURITY DEFINER, `search_path = ''`, `lock_timeout`/`statement_timeout` set on each; execute revoked from public/anon/authenticated and granted to `service_role` only; the shared guard and audit helpers are executable by nobody.
- Each function re-checks that the profile is active staff and that its role may run it (support none, operator analyze, owner everything). The app checks the same through `performance.maintain` and `performance.reset`.
- Table names must match an ordinary table in `public` in `pg_class` and are used only through `format('%I')`; anything else returns `unknown_table` and runs nothing. Minutes are 1 to 1440.
- End stuck connections is an allowlist: only the `authenticator` (PostgREST) login that is idle in a transaction for longer than the chosen time, never the caller's own backend and never postgres, supabase_admin, pgbouncer, storage, realtime or auth sessions. The preview is a dry run with no side effects and no audit row.
- Audit: every real run (ok or failed) writes `audit_events` with no household, event `platform.perf_action`, the actor, action, target, outcome, duration. Rate limit: one run per action and target per minute (refused runs write nothing). The card shows "Never run", "Last ran ..." or "Failed ...: reason" from that trail.
- App: the server action authorises again with `platformStaff(capability)`, validates input with zod, checks the password (re-authentication on a throwaway Supabase client, as the household step-up does) before the two destructive actions, and never echoes database text. Next's origin check covers CSRF.
- The household step-up (`security/step-up-repository.ts`) is keyed on a household member, so platform staff cannot use it; this uses the password check alone. Wrong-password attempts are limited by Supabase's own sign-in limit and logged, not recorded in a table.

## Verified
- `scripts/test-platform-performance-actions-rls.mjs` (9): anon/authenticated denied and helpers unexecutable; non-staff, suspended and unknown ids get nothing; support and operator cannot run owner actions; injection-style table names rejected and audited as failed; audit row written; rate limit; end-sessions kills only the `authenticator` session, leaves another role's session and its own backend alone. `scripts/test-platform-performance-rls.mjs` still passes (6).
- Vitest: snippet generator quoting and injection (`performance-actions.test.ts`), server action authorisation, password gate, preview, rate-limit wording (`actions.test.ts`). `npm run typecheck`, ESLint on the touched app files, `lint:migrations`, `lint:service-role`, `lint:boundaries`, `check:bundle`, `budget:bundle`, `tracker -- --check` green; `npm run build -w apps/web` green.

## Open
- The signed-in page was not driven in a browser (no platform staff row on the live project). Open it once after deploy at 360 px.
- `statement_timeout` set on a function does not re-arm a statement already running; ANALYZE-all stops itself after 20 seconds, and `lock_timeout` is enforced.
- Reset statistics could not be run on the live project without wiping its history; only its privilege was checked.
