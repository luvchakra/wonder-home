# What runs where, and why

Pull requests get fast checks only, so a merge waits minutes, not tens of minutes.
The full browser suite runs every night against a fresh build.
A red nightly is fixed before other work merges.

| Where | When | What | Workflow |
|---|---|---|---|
| Pull request | every push to a PR branch | typecheck; ESLint on the changed app files; unit tests related to the changed core files; secret scan, P0 security suite and the deterministic AI evaluation; repo lints (migrations, PostgREST embeds, import boundaries, tracker, brand); DB/RLS tests when migrations change; a production build when app code changes. **No E2E.** | `.github/workflows/ci.yml` |
| Push to `main` | every merge | the same jobs, with **every** unit test and the **whole** lint; DB/RLS tests and the build always run. Saves the caches pull requests read. **No E2E.** | `.github/workflows/ci.yml` |
| Nightly | 02:17 IST (20:47 UTC), and by hand | the **full** Playwright suite (mobile and desktop) against a fresh build of `main` | `.github/workflows/e2e-nightly.yml` |
| Your machine | before merging something risky | the spec files that cover it, against a local build | `npm run test:e2e -- <spec files>` |

## Pull request CI (`ci.yml`)

`scripts/ci-scope.mjs` reads the diff and decides what runs. It has its own tests in `scripts/ci-and-e2e.test.mjs`.
The jobs run in parallel:

- **typecheck**: `npm run typecheck`, with tsc's incremental cache restored from `main`.
- **lint**:
  - ESLint on the changed files under `apps/web`, with the content-keyed cache from `main`;
  - the repository's own static lints, which are whole-repo and take about a second together.
- **unit-tests**:
  - `vitest related` on the changed `packages/core` files, run from `packages/core`;
  - the `scripts/` node tests when `scripts/` changed.

  Every unit test lives in `packages/core`, and core tests never import the app, so a change to `apps/web` alone has no related unit test. Typecheck and lint still cover it.
- **security**:
  - the secret scan;
  - the P0 security suite;
  - `npm run eval`, the deterministic golden-household gates. An Unsafe Action Rate above zero is a release blocker (CLAUDE.md).

  The repo has no dependency audit, and none was added.
- **db-tests**: the schema and RLS authorization suite. It runs only when `supabase/` or its test scripts change. It stays on PRs because authorization tests are P0 release blockers.
- **build**: `npm run build` when app code changes. It catches a change that cannot build before it merges, so it never spends a Vercel deployment slot failing (CLAUDE.md, build-slot budget).
- **ci**: the single required check. It passes when every job passed or was skipped on purpose.

**A full run** means every unit test and the whole ESLint run. It happens on every push to `main`, and on a pull request that touches any of these:
- any `package.json` or `package-lock.json`;
- any `tsconfig*.json`;
- Vitest, ESLint, Next.js, PostCSS or Playwright config;
- `vercel.json`;
- `.github/`;
- `scripts/ci-scope.mjs` itself.

Deleting a `packages/core` file also forces a full unit run, because `vitest related` cannot follow an import to a file that no longer exists.

## Nightly E2E (`e2e-nightly.yml`)

1. **Clean up** (`scripts/e2e-cleanup.mjs`). The script:
   - removes E2E accounts left by earlier runs: emails on `@e2e.wonderhome-test.internal`, older than two hours. This happens only when a dedicated test project is configured as the `E2E_SUPABASE_URL` / `E2E_SUPABASE_SERVICE_ROLE_KEY` repository secrets;
   - refuses the production project outright.

   Today's suite needs none of this. It runs against a placeholder Supabase URL and creates nothing anywhere, so this step logs "nothing to clean". Any spec that starts creating real data must:
   - create its accounts on that email domain;
   - reset any shared setting it changes in the same script, so a run killed halfway cannot break the next one.
2. **Plan** (`scripts/e2e-plan.mjs`). The planner splits the suite into parts by **measured time**, not file count:
   - The times come from `e2e/timings.json`.
   - The whole run is one part while it fits 25 minutes.
   - Past that, a spec that alone reaches the target gets a part of its own, and the rest are balanced longest-first.
   - A spec with no timing yet counts as the slowest known one.
   - Each part gets a time budget of three times its estimate, between 10 and 60 minutes.
3. **Run** each part against a fresh `npm run build`, with no build cache restored. The run uses:
   - one retry;
   - traces kept for every failure;
   - the budget passed as `--global-timeout`. When it runs out, Playwright stops starting tests and still writes its reports. Nothing is hard-killed.
4. **Summarize** (`scripts/e2e-report.mjs`). Each part's summary lists **passed / failed / flaky / skipped / not run**:
   - A test that passed only on retry is **flaky**. It is named in the summary and as a warning annotation, because it needs a root cause.
   - A test the budget never reached is **not run**, and fails the part.
   - Skipped means skipped on purpose (`test.skip`).
5. **Keep** the artifacts:
   - each part's HTML report, traces and JSON results (`e2e-<part>`, kept 14 days);
   - the night's measured seconds per spec (`timings`). Copy them into `e2e/timings.json` when the suite's shape changes.
6. **Alert.** The repository has no chat or paging integration. A failed scheduled run alerts the way GitHub does: an email to whoever last changed the workflow's schedule.

**Start it by hand:**
- GitHub → Actions → **E2E nightly** → **Run workflow**. Optionally list spec files (`e2e/auth.spec.ts e2e/session.spec.ts`) or change the split target.
- From a session: the GitHub `run_workflow` action on `e2e-nightly.yml` with `ref: main`.

**Measured on 2026-10-16:**
- Fresh build: 70 s.
- Full suite: 304 tests in 39 s on 4 workers, so one part.
- On a GitHub runner, the whole nightly is a few minutes.

## Local E2E before a risky merge

```bash
npm run test:e2e -- e2e/auth.spec.ts e2e/session.spec.ts             # build, then run these specs, mobile and desktop
npm run test:e2e -- e2e/auth.spec.ts --project=mobile               # one viewport
```

The command:
- builds the app first;
- serves it on port 3100;
- runs the named specs.

`playwright.config.ts` pins that server to the placeholder Supabase project and blanks `SUPABASE_SERVICE_ROLE_KEY` and `WONDERHOME_AI_KEY`. So your `apps/web/.env.local`, which points at the live project, can never turn a local E2E run into requests against production data. It refuses the production project even if asked. If a server is already listening on 3100, Playwright reuses it, so stop your own server first.

**Run the affected specs this way before merging:**
- sign-in or session changes (`auth`, `session`, `identity`);
- permissions and role changes;
- database migrations;
- payments;
- a new cross-feature flow;
- a change to the app shell or navigation (`shell`, `landing`, `help`).

## Rules

- Never skip, disable or delete a test to make CI green.
- A red nightly is fixed before other work merges. Find the root cause; "flaky" is not one.
- A test that is flaky in the nightly gets a root-cause fix, not a higher retry count.
- Tests run on GitHub Actions or locally, never on Vercel (CLAUDE.md, build-slot budget).
