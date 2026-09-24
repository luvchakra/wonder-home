# CI runs only what a change can affect

**Date:** 2026-09-24 · **Kind:** infrastructure

## What was done

Every PR used to run the whole pipeline, including docs-only PRs:
- lint, typecheck and the static lints;
- the security suite and the AI evaluation;
- about 2,600 unit tests and about 480 database tests;
- a production build and about 430 end-to-end tests.

A new `changes` job in `.github/workflows/ci.yml` now classifies the PR's
files, and each job runs only when its area changed.

| Change touches | lint job | unit-tests | db-tests | build-and-e2e |
|---|---|---|---|---|
| docs only (`docs/`, `backlogs/`, `tracking/`, `design/`, `architecture/`, `database/`, `*.md`) | tracker check only | skipped | skipped | skipped |
| `supabase/migrations` or the database test scripts | full | — | runs | — |
| `apps/`, `packages/`, `scripts/`, package/TS config | full | runs | — | runs, unless only `*.test.*` files changed |
| `.github/` (CI itself) | everything | everything | everything | everything |

A push to `main` always runs everything. Skipping is only a convenience on
pull requests; it is never how `main` is checked.

The single required `ci` check accepts a job that was skipped on purpose.
It fails when the `changes` job itself failed, so a broken classifier can
never pass a PR with nothing run. The lint job always runs, and its code
steps (including the P0 security suite and the eval) run for every code
change, so those gates still apply to every PR that changes code.

## Verified

- The classifier was run locally against real history:
  - PR #147 (docs-only): nothing but the tracker check.
  - PR #146 (the full story): every job.
  - A migration-only change: lint and database tests.
  - A unit-test-only change: lint and unit tests.
  - A UI-only change: lint, unit tests, and build plus e2e.
- The YAML parses.
- This PR changes `.github/`, so it ran everything.

## Where

`.github/workflows/ci.yml`, in the `changes` job and each job's `if:`.

## Follow-up: less repeated work inside each job

Nothing below removes a test. It removes work that was repeated.

- **Database suite: migrate once, copy per file.** Each of the 35 RLS test
  files used to replay all 85 migrations into its own database, which took
  about 10 s each.
  - `scripts/setup-test-db.mjs` now builds one template database, named by a
    hash of the migrations and the shim, and each file's database is a copy
    of it (`create database … template …`).
  - `npm run test:db` builds the template first, so files starting together
    never race to build it.
  - A changed migration changes the hash, so a stale schema is never reused.
  - Locally the 477 tests went from 72 s to 42 s, including the one-time
    template build.
- **Browser suite: API specs run once.** `api-contract.spec.ts` and
  `domains.spec.ts` never open a page. They ran in both the mobile and the
  desktop project, so 164 identical requests were made twice. The desktop
  project now ignores them.
  - The suite went from 432 tests to 268, and every spec still runs at
    least once.
  - Locally: 268 passed in 40 s.
- **Unit tests are unchanged.** 2,600 tests take about 35 s in their own
  parallel job and are not on the critical path, so removing any would buy
  no CI time.
