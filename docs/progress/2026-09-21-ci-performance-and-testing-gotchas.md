# CI/CD performance pass, and locking in what this session learned the hard way

## Why

Mid-session, CI turnaround and token spend on repeated debugging were both
worth cutting. Two things prompted this: a request to speed up the CI/CD
pipeline, and a request to turn this session's own recurring friction
(RLS-test gotchas re-derived more than once, a wasted session chasing a
sign-up-form rejection that was never an app bug) into checks and docs so a
future session doesn't rediscover them from scratch.

## What was done

### CI/CD speed

- **Fixed a double Next.js production build.** `playwright.config.ts`'s
  `webServer.command` always ran `npm run build` itself, even when the
  caller (CI's `build-and-e2e` job, and local `npm run verify`) had already
  built the app as a prior explicit step — every e2e run silently rebuilt
  the whole app a second time. Gated behind a new `E2E_SKIP_BUILD` env var:
  set it, and the command only starts the already-built server. Unset (bare
  `npm run test:e2e` during local dev), it still builds first, so that
  workflow is unaffected. Local measurement: ~36.9s for e2e with the build
  skipped vs. a redundant ~25s extra build without it.
- **Cache Playwright's Chromium binary in CI.** `build-and-e2e` now caches
  `~/.cache/ms-playwright` keyed on the installed `@playwright/test`
  version, so `npx playwright install --with-deps chromium` is a no-op
  after the first run per version.
- **Cache `node_modules` across all install-dependency jobs** (`lint`,
  `unit-tests`, `db-tests`, `build-and-e2e`), keyed on
  `hashFiles('package-lock.json')`. The subtlety: `npm ci` unconditionally
  deletes `node_modules` and reinstalls from scratch, so caching the
  directory alongside an unconditional `npm ci` call buys nothing — the
  cache has to make the `npm ci` step itself conditional
  (`if: steps.node-modules-cache.outputs.cache-hit != 'true'`) so it's
  skipped entirely on a hit. Caught this before shipping it, not after.
- **Split unit tests into their own parallel job** (`unit-tests`), instead
  of running inside `lint-and-unit` (renamed `lint`) after linting
  completed. It now runs in parallel with `lint`, `db-tests` and
  `build-and-e2e` rather than serially after `lint`.
- **Raised `test:db` concurrency from 1 to 4**
  (`node --test --test-concurrency=4`). Locally de-risked by reading
  `supabase/tests/supabase-shim.sql`, which handles the one real race this
  could hit — concurrent test-database builds creating the same
  cluster-wide Postgres roles — via `duplicate_object` exception catching,
  and by running it clean at concurrency 1/4/8 in this sandbox. That local
  verification wasn't the whole story: this PR's own CI run hit the race
  for real (`db-tests` failed on `duplicate key value violates unique
  constraint "pg_authid_rolname_index"`, 21 test files' `create role anon`
  racing on CI's colder, differently-scheduled Postgres container). Under
  true concurrency, two sessions can both pass `CREATE ROLE`'s existence
  check before either commits, so the loser hits the raw
  `unique_violation` from the catalog index instead of the clean
  `duplicate_object` the check normally produces — the shim's exception
  handlers only caught the latter. Fixed by catching
  `duplicate_object or unique_violation` in all three role-creation
  blocks; re-verified with 5 consecutive local runs at concurrency 8 (235
  pass each time) before trusting it again.
- **`ci` gate job** now depends on `[lint, unit-tests, db-tests,
  build-and-e2e]` (previously `[lint-and-unit, db-tests, build-and-e2e]`),
  keeping the single aggregating gate that insulates branch protection from
  job renames/splits.
- **Investigated `next build --turbopack` and did not adopt it.** Measured
  25.7s (webpack) vs. 26.2s (turbopack) locally — no measurable benefit, so
  changing the production build tool wasn't worth the unproven deployment
  risk. Documented as investigated-but-not-adopted rather than silently
  dropped, so a future session doesn't re-run the same experiment.

### Long-term fixes for this session's own friction

- **`deniedForUpdate` helper in `scripts/lib/db.mjs`**, plus a doc comment
  at the top of that file recording two gotchas that bit real test files
  more than once this session:
  1. An `UPDATE` with no matching RLS policy does not throw — Postgres
     just matches and changes zero rows. `deniedForProfile`'s try/catch
     can't see that; it needs a follow-up privileged read to prove nothing
     actually changed. `deniedForUpdate(profileId, updateSql, checkSql,
     expectedUnchanged, options)` does exactly that and is now the
     required helper for "this update should be refused" assertions.
  2. All tests in one `*-rls.mjs` file share a single database built once
     in that file's `before()` — there's no per-test isolation, so test
     *order* inside a file is part of its correctness. A mutation an
     earlier test makes (granting a role, changing a member's status)
     persists for every later test in the same file.
  - Refactored all 5 existing call sites that had the first gotcha's
    anti-pattern by hand (`test-identity-rls.mjs`, `test-agent-runs-rls.mjs`,
    `test-feature-flags-rls.mjs`, `test-conversation-rls.mjs`,
    `test-family-rls.mjs`) onto the new helper, rather than adding it and
    leaving the old call sites as a second, inconsistent pattern.
- **`scripts/qa-test-user.mjs`** — a `create`/`delete` CLI that makes an
  already-confirmed test account directly via `auth.admin.createUser`
  (the service-role key already in `apps/web/.env.local`), for live
  browser verification without touching the public sign-up form. The
  public form rejects sandboxed test-email domains like `.test` and
  `example.com` outright — that's Supabase Auth's own validation, not an
  app bug, but it looks exactly like one from the browser, and chasing it
  cost a whole earlier session before the fix was "don't use that form for
  testing." `npm run qa:test-user` is the package.json alias. Documented in
  a new "Verifying UI changes in a browser" section in `CLAUDE.md` — the
  document every future session reads first — not just here, so the fix is
  actually discoverable next build onwards.

### One more environment gotcha found while re-running the gate

Re-running the full verify gate against all of the above, `npm run test:db`
failed outright — all 256 subtests, `role "root" does not exist` on every
`psql` call. Not a regression: this sandbox's local Postgres cluster had
lost the ad-hoc `root` superuser role that `psql`'s peer-auth default
depends on here (this environment runs as OS user `root`, with no `PGUSER`
set) — likely wiped by a mid-session cluster reset. CI is unaffected: the
`db-tests` job always sets `PGUSER=postgres` explicitly against its own
Postgres service container. Fixed locally with `sudo -u postgres psql -d
postgres -c "CREATE ROLE root WITH LOGIN SUPERUSER;"`, then re-ran the full
gate clean. Not written up as a code or doc change — it's sandbox state,
not a repository concern — but recorded here so a future session hitting
the same "role root does not exist" error on this exact message
recognizes it immediately as local Postgres setup, not a real failure.

## Verified

Full `npm run verify` chain run clean after all of the above, in order:
`typecheck`, `lint`, `lint:migrations`, `lint:embeds`, `lint:boundaries`,
`lint:secrets`, `tracker -- --check`, `brand -- --check`, `security`,
`test` (43 pass), `test:db` (235 pass), `build`, and
`E2E_SKIP_BUILD=1 test:e2e` (256 pass). Exit code 0 end to end.

The CI workflow's structural changes (job rename/split, `actions/cache`
behavior, the concurrency bump) are only provable by an actual GitHub
Actions run — this is the first PR against the restructured `ci.yml`, and
its own CI run is the real validation of job naming and the `ci` gate's
aggregation.

## What's still open

- No code changes here beyond CI config and test-support scripts — no
  migration, no UI change, no story marked Done in the trackers.
- The CI timing improvement itself (before/after wall-clock on an actual
  Actions run) will only be visible once this PR's own CI run completes
  and a later PR's run can be compared against it.

## Where the code lives

- `playwright.config.ts` — `E2E_SKIP_BUILD` gate
- `package.json` — `test:db` concurrency, `qa:test-user` script, `verify`
  chain sets `E2E_SKIP_BUILD=1` for its own e2e step
- `.github/workflows/ci.yml` — job split, node_modules cache, Playwright
  browser cache, updated `ci` gate `needs:`
- `scripts/lib/db.mjs` — `deniedForUpdate` + the two-gotcha doc comment
- `scripts/test-identity-rls.mjs`, `scripts/test-agent-runs-rls.mjs`,
  `scripts/test-feature-flags-rls.mjs`, `scripts/test-conversation-rls.mjs`,
  `scripts/test-family-rls.mjs` — refactored onto `deniedForUpdate`
- `scripts/qa-test-user.mjs` — new
- `CLAUDE.md` — new "Verifying UI changes in a browser" section
