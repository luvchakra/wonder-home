# The test environment

A full WonderHome, completely separate from production (owner, 2026-11-25: "not just test database but a full test environment, completely separate from Prod"; named **test**, never "staging"). Why: the nightly E2E suite on the live project slowed the production Supabase instance for every household; readiness answered 503 during runs (#641, `docs/progress/2026-11-25-nightly-sign-in.md`).

| | Production | Test |
|---|---|---|
| Web | Vercel `wonderhome`, Production, branch `main` | same Vercel project, **Preview** environment, long-lived branch `test` |
| URL | `home.wonderapps.biz` | `test.home.wonderapps.biz` |
| Database | Supabase `wonderhome` (`kqxndableyysxqhxiorz`, ap-south-1) | Supabase `wonderhome-test` (ap-south-1) |
| Platform admin settings | in the production database | in the test database: its own, separate |
| Data | real households | synthetic only (`scripts/test-env/seed.mjs`); production data is never copied |
| pg_cron | calls `home.wonderapps.biz` every 5 min; dispatches the GitHub delivery clock | calls `test.home.wonderapps.biz`, at most hourly; no GitHub clock |
| GitHub background jobs | `background-jobs.yml`, `delivery-clock.yml` | none: production only. The test server's own heartbeats go stale, so it runs its own steps (`docs/background-jobs.md`) |
| E2E | never | `e2e-nightly.yml`, every night |
| Outbound messages | everyone | only recipients on `WONDERHOME_TEST_RECIPIENTS` |

## The guard: a test server never messages a real person

`packages/core/src/platform/environment.ts`. A server is **test** when `WONDERHOME_ENV=test`, or when it is any Vercel Preview deployment (fails closed if the variable is forgotten). Both are read from the deployment's own variables, never from Platform admin, so the settings store cannot switch it off.

On test:
- **Email** (`email/mailer.ts`, every mail WonderHome sends): only to an address on `WONDERHOME_TEST_RECIPIENTS`; anything else is refused as `rejected` and logged without the address.
- **WhatsApp** (`notifications/whatsapp.ts`: reminders, replies, choices): only to a number on the list.
- **Push** (`notifications/deliver.ts`): only to devices of a member whose account email is on the list.
- `WONDERHOME_TEST_RECIPIENTS`: comma-separated emails and E.164 numbers, a Vercel Preview variable for branch `test`. Empty (the default) means nobody.
- A **TEST** badge sits at the top of every screen (`apps/web/app/_components/test-environment-badge.tsx`); production renders nothing.

## Settings for test (Platform admin on test.home.wonderapps.biz)

Each database has its own Platform admin store, so test starts empty. Save only test credentials:
- **WhatsApp**: off, or Meta's test number (its own phone-number id and token); allow-list the testers' numbers.
- **Email**: a test inbox only (and allow-list it).
- **Razorpay**: test-mode keys only.
- **AI**: a separate, low-budget key. **Gemini**: off unless a test key is saved.
- **Push**: separate VAPID keys (generate a new pair; never production's).
- **Background jobs → Scheduler key**: Generate new key. pg_cron on test sends it; until it exists the hourly schedules send nothing.
- Leave **GitHub delivery-clock token** empty: the test project never dispatches GitHub.

## Vercel (Preview, branch `test`)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | the test project's |
| `CRON_SECRET` | its own random value |
| `WONDERHOME_ENV` | `test` |
| `NEXT_PUBLIC_SITE_URL` | `https://test.home.wonderapps.biz` |
| `WONDERHOME_PLATFORM_ADMINS` | the owner's email `:owner` |
| `WONDERHOME_TEST_RECIPIENTS` | the testers' emails and numbers |

The domain `test.home.wonderapps.biz` is assigned to branch `test` (Vercel → Domains), with a DNS CNAME `test.home` → `cname.vercel-dns.com`.

**Build slots.** `vercel.json` deploys only `main` and `test` (`"**": false`), and `scripts/vercel-should-build.sh` skips any other branch as a second lock. `test` deploys only when someone pushes it, never per PR. To update it: `git push origin origin/main:test` (one deployment), and only when a test run needs the newer code. Count the day's deployments first (CLAUDE.md, "Build-slot budget").

## Migrate, seed, reset

Normally from GitHub Actions: **Test environment database** (`.github/workflows/test-env.yml`). It runs by itself when a migration lands on `main` or `test`, and by hand (Actions → Test environment database → Run workflow) with `migrate`, `dry-run`, `retarget` or `reset`, and an optional seed.

Its credential is the repository secret `TEST_DATABASE_URL`: the test project's **Session pooler** connection string (Supabase → wonderhome-test → Connect; the pooler, because GitHub runners have no IPv6 for the direct host). It reaches only the test database. A Supabase personal access token is deliberately not used: it reaches every project on the account, production included (coordinator review, 2026-11-25). Seeding also uses `TEST_SUPABASE_URL`, `TEST_SUPABASE_PUBLISHABLE_KEY` and `TEST_SUPABASE_SERVICE_ROLE_KEY`. Every script refuses the production project, and the connection string must name the test project when `TEST_SUPABASE_PROJECT_REF` or `TEST_SUPABASE_URL` is set.

The same scripts run anywhere with `psql` and those variables (a Claude cloud container usually cannot reach port 5432, so prefer the workflow):

```bash
node scripts/test-env/migrate.mjs --dry-run       # what is missing
node scripts/test-env/migrate.mjs                 # apply it in order, record history, retarget pg_cron
node scripts/test-env/migrate.mjs --retarget      # only retarget pg_cron
node scripts/test-env/seed.mjs 2                  # synthetic households; prints EMAIL / PASSWORD / USER_ID
node scripts/test-env/reset.mjs --yes-reset-test  # empty it (then migrate and seed again)
```

- **Migrate** applies each missing file of `supabase/migrations/` in order, each with its history row in one transaction, into `supabase_migrations.schema_migrations` (matched by base name, like `check-migrations-applied.mjs`). Extensions, Vault, pg_cron and pg_net come from the hosted project; the migrations create what they use. It stops at the first failure; re-running continues from there. Measured on a local Postgres with the repo's shim: all 254 migrations in 12 s; a second run applies 0.
- **Retarget** rewrites every pg_cron job to call `test.home.wonderapps.biz` instead of production, runs anything more frequent than hourly once an hour, and removes `wonderhome-delivery-clock-github`. It is part of every migrate run, because a new migration can schedule a job again.
- **Seed** creates confirmed accounts `seed-<family>@wonderhome-test.internal` (a domain that receives no mail) and a household for each. Re-running resets their passwords.
- **Reset** drops `wh`, everything in `public`, accounts, pg_cron jobs, WonderHome's Vault secrets, Storage objects and the history. Platform admin settings go with it.

## A new migration

Test first, then production (CLAUDE.md, "Applying a migration"): run **Test environment database** on the PR's branch by hand (or it runs when the migration lands on `main`/`test`), load the screens on `test.home.wonderapps.biz` if `test` carries the code, then apply to production.

## QA accounts and E2E

`qa-test-user.mjs` and E2E go to the test project: run them with `NEXT_PUBLIC_SUPABASE_URL=$TEST_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY=$TEST_SUPABASE_SERVICE_ROLE_KEY`, and E2E with the `E2E_SUPABASE_*` names (`docs/CI.md`). The nightly reads the `TEST_SUPABASE_*` repository secrets.
