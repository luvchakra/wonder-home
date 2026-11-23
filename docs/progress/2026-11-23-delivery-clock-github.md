# The delivery clock moves to GitHub Actions (2026-11-23)

**Asked:** "i thought this process is resource intensive, can we move these jobs to GitHub instead" (owner). Vercel Hobby was paused this month for Fluid Active CPU, and the 5-minute dispatch tick had grown: stages, health, due reminders, notices, two proposal sweeps (one with a model judge), stale clears, senders, the key alert, digests, plus the clock fallbacks.

## What was done

- **A reliable trigger for GitHub compute.** GitHub's own schedule ran the 10-minute clock at 16:29, 18:03, 21:58, 23:51, 02:30, 08:16, 10:54 and 11:10 UTC over one day, so it can't keep a 7:30 reminder at 7:30. Migration `20261123120000_delivery_clock_github.sql` adds `wh.trigger_delivery_clock()` and the pg_cron job `wonderhome-delivery-clock-github` (`*/5`): it reads the Vault secret `github_dispatch_token` and asks the GitHub API to run `delivery-clock.yml` on `main`. Without Vault, pg_net or the token it returns `no-vault` / `no-net` / `no-token` and sends nothing. Nobody but the database owner can call it.
- **`delivery-clock.yml`.** `workflow_dispatch` (and `repository_dispatch` type `delivery-clock`). Two jobs: **Deliver** (`scripts/jobs.mjs delivery`, 4-minute job timeout, concurrency `delivery-clock`, queued not cancelled, npm cache, `--ignore-scripts`, no build) and **Clock** (the batch steps and calendar feeds, sharing `background-jobs-clock` with `background-jobs.yml`).
- **One delivery module for both sides.** `packages/core/src/jobs/delivery.ts` holds the nine delivery steps (`delivery.stages`, `.health`, `.due`, `.notices`, `.proposals`, `.stale`, `.senders`, `.key-alert`, `.digests`), used by the runner (job `delivery`, a heartbeat per step, fresh for 15 minutes) and by the Vercel route (`runDeliveryFallback`, only the stale steps). The notice sweep looks back to the step's last clean run when that is longer than a tick and under 30 minutes old, so a late run or a hand-over misses no change.
- **Keys from Platform admin.** The runner already lays the saved settings over its environment; delivery uses the saved VAPID, SMTP, WhatsApp and AI keys. Without VAPID keys saved, the sending steps are left to Vercel (no heartbeat); without mail settings, the key alert is.
- **The Vercel route as a light fallback.** `/api/v1/notifications/dispatch` now starts with one wave: the delivery and clock heartbeats (one read) and "is anything waiting on the retry queue?" (one indexed read). All fresh → it answers at once, draining the retry queue after the response only when a job waits. Any stale → only those steps. The retry queue stays on Vercel: its WhatsApp replies need the app's HomeTalk (`server-only`).
- **Calendar subscriptions.** Already behind the heartbeat (`calendar-sync`); the Clock job now keeps it fresh every 5 minutes, so the pg_cron calendar call returns after one read.

## Verified

- `npx vitest run packages/core/src/jobs/`: 17 tests, including the new `delivery.test.ts`: GitHub fresh → Vercel skips every step; stale (over 15 min) → Vercel runs every step; a run without push keys leaves exactly the sending steps to Vercel; unreadable heartbeats → Vercel does everything; both sides at once deliver each due reminder exactly once (the `generated → delivered` claim), and a second pass finds nothing.
- `node --test scripts/test-delivery-clock-trigger-rls.mjs` (local Postgres 16, all 252 migrations): `no-vault`, `no-net`, `no-token` (also with a blank token and only `cron_secret` present) send nothing; with the token exactly one request to the right URL, `ref: main`, the bearer header; `anon`, `authenticated` and `service_role` can't execute it.
- `npm run typecheck`, ESLint on the route, `lint:migrations`, `lint:service-role`, `lint:secrets`, `npm run build -w apps/web`. `scripts/jobs.mjs delivery --dry-run` loads every module through jiti.

**Wall time not measured.** The live dispatch route answers 401 today (Vault `cron_secret` drifted from Vercel's `CRON_SECRET`; the owner is fixing it by hand), and Hobby keeps an hour of logs, so there is no before number to read. By construction: before, a tick ran about a dozen awaited database phases in a row plus a loop per household with something due, then the `after()` work; now, while GitHub is healthy, it is one wave of two indexed reads and a response. Read `/api/v1/notifications/dispatch` durations in Vercel's logs once the secret is fixed and the token saved.

## Open / needs a person

1. Apply the migration (SQL in the PR reply) in the Supabase SQL editor; it is harmless without the token.
2. Create the fine-grained token (this repository only, Actions: Read and write) and save it with `select vault.create_secret('<token>', 'github_dispatch_token');` in the SQL editor.
3. Confirm: `select wh.trigger_delivery_clock();` → `dispatched`; Actions → Delivery clock shows runs every 5 minutes, green; `platform_job_heartbeats` shows `delivery.*` rows with `runner = 'github'`.
4. Push keys must be saved in Platform admin (Notifications / push) for the sending steps to move; otherwise Vercel keeps them, by design.
5. Later: once a clean week passes, the `background-jobs.yml` clock schedule is redundant (the Clock job covers it).

No QA accounts or live data were created.

## Follow-up: the token is a Platform admin setting (same day)

The owner: "instead of create secret through query, can you create new secret entry in platform admin which i can then populate".

- `GITHUB_DISPATCH_TOKEN` ("GitHub delivery-clock token") in `platform/settings/registry.ts`, new group "Background jobs" on Integrations: a secret, owner only with the password step-up, kept in Vault by the store, shown only as its last four.
- Migration `20261123150000_delivery_clock_token_platform_admin.sql` replaces `wh.trigger_delivery_clock()` to read it from `platform_config` → `vault.decrypted_secrets`; a cleared value counts as unset; the Vault name `github_dispatch_token` stays as a fallback (two lines). Still `no-token` and nothing sent without either.
- Configuration health on Overview and Integrations: "Delivery clock on GitHub: not set / running (last run N min ago) / failing (…)" from the `delivery.*` heartbeats with `runner = 'github'` (`jobs/delivery-clock-status.ts`). Failing is listed with the other gaps; the other two are one quiet line.
- Settings search (rule 23) indexes household settings only; Platform admin settings are not in it, so there is no entry to add.
- Verified: `scripts/test-delivery-clock-trigger-rls.mjs` 7 tests (Platform admin token wins; cleared falls back; neither sends nothing); `vitest packages/core/src/jobs/ packages/core/src/platform/settings/` 68 tests; typecheck, ESLint, security suite, migration and service-role lints.

## Follow-up: the scheduler key in Platform admin (same day)

The owner: "also, i don't see entry for cron secret in platform admin". The Vault `cron_secret` pg_cron sends had drifted from Vercel's `CRON_SECRET`, so every dispatch and calendar call answered 401.

- `CRON_SECRET` ("Scheduler key", Background jobs): owner only, password step-up, last four only, with **Generate new key** (32 random bytes made on the server after the step-up; never sent to the browser). It can be replaced, never cleared (the UI hides Clear; the database refuses).
- Migration `20261123160000_scheduler_key_platform_admin.sql`: `platform_config_secret_set` stores CRON_SECRET in the existing Vault secret `cron_secret` (the one pg_cron sends) instead of a second copy; `platform_config_clear` refuses it. So saving here changes what the scheduler sends and what the routes accept together.
- `security/cron-auth.ts`: all six scheduler routes (dispatch, calendar sync, retention, webhook delivery, HomeSend tidy, catalog import) accept the saved key or Vercel's `CRON_SECRET`, compared in constant time (SHA-256 digests, `timingSafeEqual`); with neither set, everything is refused. A cold server waits for its first read of the store; a miss reads the store again (at most every 10 s per server), so a key generated on another server a moment ago is accepted.
- Unsubscribe links keep signing with the deployment's `CRON_SECRET` (when no link secret is saved), so a generated scheduler key never breaks old links.
- Configuration health: "Scheduler key: not set here / saved here, and matches Vercel's / Vercel's CRON_SECRET differs (fine)". Not from `net._http_response` (no RPC reads it); compared on the server, never shown.
- `CRON_SECRET` left `STAYS_IN_VERCEL`; two settings tests that used it as their example of a non-registry key now use `SUPABASE_ACCESS_TOKEN`.
- Verified: `scripts/test-scheduler-key-rls.mjs` (3) and the trigger tests (7); `cron-auth.test.ts` (5) and the settings, jobs and unsubscribe tests (86 in all); typecheck.
