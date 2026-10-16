# Fast pull-request CI, and the full E2E suite nightly

**Date:** 2026-10-16

## What was done

**Pull requests get fast checks only.** `ci.yml` is split into parallel jobs:
- **typecheck**;
- **lint**: ESLint on the changed `apps/web` files only, plus the repo's whole-repo static lints, which take about a second;
- **unit-tests**: `vitest related` on the changed `packages/core` files, plus the script tests when `scripts/` changed;
- **security**: secret scan, P0 security suite, deterministic AI evaluation;
- **db-tests**: only when migrations change;
- **build**: no browser.

`scripts/ci-scope.mjs` decides which run. A PR touching dependencies, any `tsconfig`, test, lint or build config, or `.github/` gets every unit test and the whole lint. **No E2E on pull requests.**

**Pushes to `main`** run every unit test, the whole lint, the DB tests and the build, and save the caches PRs read. No E2E.

**Nightly E2E** (`e2e-nightly.yml`) runs at 02:17 IST, with a manual trigger that takes optional spec files. In order:
1. Cleanup (`scripts/e2e-cleanup.mjs`). A no-op today, guarded against production.
2. Split into parts by measured time (`scripts/e2e-plan.mjs`, `e2e/timings.json`).
3. A fresh build per part.
4. The full suite, with one retry, traces on failure, and a per-part time budget passed as `--global-timeout`, so a part ends with a report rather than a kill.
5. A passed / failed / flaky / skipped / not run summary per part (`scripts/e2e-report.mjs`). Flaky tests are named for a root cause.
6. The HTML report and traces kept as artifacts.
7. The night's measured timings published.

**E2E can no longer reach production data from a laptop.** `playwright.config.ts` pins the server it starts to the placeholder Supabase project, blanks `SUPABASE_SERVICE_ROLE_KEY` and `WONDERHOME_AI_KEY`, and refuses the production project ref. Before, a local `npm run test:e2e` read `apps/web/.env.local` and sent the auth specs' reset requests to the live project.

**Docs.** `docs/CI.md` says what runs where and why. README points to it. CLAUDE.md gains "Where tests run", and a red nightly now holds merges.

No application code changed.

## Measured

Before: the PR CI's critical path was build-and-e2e at 85 s (build 16 s warm, Playwright 45 s), and the whole run took 1 m 44 s (PR #199).

Locally:
- fresh build: 70 s;
- full suite: 304 tests in 39 s, 296 passed and 8 skipped on purpose;
- the time budget at 12 s: 17 passed, 29 not run, summary FAILED, as intended;
- a local slice with `.env.local` present: 17 passed, and no production reference in the client bundle.

The new scripts have 15 tests in `scripts/ci-and-e2e.test.mjs`. After-timings and the first nightly's results are in the PR.

## Still open

- **No dedicated E2E Supabase project exists.** Specs that sign in for real would need one, set as the `E2E_SUPABASE_*` repository secrets. That is a person's call.
- **No chat or paging alert.** A failed nightly emails via GitHub's default.
- **The schedule assumes India time.** Change the cron in `e2e-nightly.yml` if not.
