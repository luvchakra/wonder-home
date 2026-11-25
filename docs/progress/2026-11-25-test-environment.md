# A full test environment, separate from production

**Date:** 2026-11-25 · **Decision:** owner, 2026-11-25 ("not just test database but a full test environment, completely separate from Prod"; "instead of staging i want to call it test").

## Why
The nightly E2E suite ran against the live Supabase project and slowed it for every household; production readiness answered 503 during runs (#641).

## What was done
- **Database tooling** (`scripts/test-env/`): `migrate.mjs` applies every migration in order to `wonderhome-test` with `psql` and `TEST_DATABASE_URL` (the test project's own connection string; a personal access token was rejected in review because it reaches production too), each with its history row in one transaction, records history in `supabase_migrations.schema_migrations`, and retargets pg_cron (test host, at most hourly, no GitHub delivery clock). `seed.mjs` makes synthetic households only; `reset.mjs` empties the project. All refuse the production project. They run from `.github/workflows/test-env.yml` (on migration changes to `main`/`test`, and by hand with migrate, dry-run, retarget, reset and seed). Measured locally (Postgres 16 with the repo's shim): 254 migrations in 12 s, a re-run applies 0, reset then migrate rebuilds. Tests: `scripts/test-env/test-env.test.mjs` (in `npm run test:scripts`).
- **Outbound guard** (`packages/core/src/platform/environment.ts`): `WONDERHOME_ENV=test`, or any Vercel Preview, is test; there email (`email/mailer.ts`), WhatsApp (`notifications/whatsapp.ts`) and push (`notifications/deliver.ts`) reach only `WONDERHOME_TEST_RECIPIENTS`. Read from deployment variables only, never Platform admin.
- **TEST badge** on every screen of the test environment (`apps/web/app/_components/test-environment-badge.tsx`, root layout).
- **Vercel**: `vercel.json` deploys only `main` and `test` (`"**": false`); `scripts/vercel-should-build.sh` skips any other branch.
- **CI**: `e2e-nightly.yml` uses the `TEST_SUPABASE_*` secrets and no longer reads `E2E_ALLOW_LIVE_PROJECT`; `playwright.config.ts` gives the app server the service-role key for the test project. `background-jobs.yml` and `delivery-clock.yml` are production only.
- **Docs**: `docs/test-environment.md` (new), `docs/hosting.md` (environments table), `docs/CI.md`, `docs/background-jobs.md`, CLAUDE.md (migrations test first; testing on the test project; two environments; build slots).

## Verified
Typecheck; ESLint on the changed web files; vitest on platform, notifications and email (595 passed) plus the badge test; `node --test` on the test-env and CI scripts; `npm run build -w apps/web`; boundaries, secrets and tracker checks.

`scripts/ci-and-e2e.test.mjs` "cleanup never touches production" fails in a Claude cloud container that has `E2E_ALLOW_LIVE_PROJECT=1` set (on `main` too); it passes with it unset. The variable should be removed from the cloud environment.

## Open, needs the owner
- Create Supabase `wonderhome-test` (ap-south-1); GitHub secrets `TEST_DATABASE_URL` (Session pooler string), `TEST_SUPABASE_URL`, `TEST_SUPABASE_PUBLISHABLE_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY`; optionally `TEST_SUPABASE_URL` and `TEST_SUPABASE_SERVICE_ROLE_KEY` in the cloud environment for read-only checks. No `SUPABASE_ACCESS_TOKEN`.
- Vercel (the connector cannot see project `wonderhome` from this session): Preview variables for branch `test` (`docs/test-environment.md` table, including `WONDERHOME_ENV=test` and `NEXT_PUBLIC_SITE_URL`), the domain `test.home.wonderapps.biz` on branch `test`, and the DNS CNAME.
- Then: run **Test environment database** with seed, push the `test` branch once, save test-only settings in its Platform admin (Scheduler key: Generate), and finish #641 against it.

No test data was created in this session.
