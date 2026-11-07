# Background jobs move to GitHub Actions

**Date:** 2026-11-07

**Asked:** the owner asked: "to reduce load on Vercel, transfer processes to GitHub as much as possible, similar to what's done in WonderWorks."

## What was done

- **Inventory.** Every process that runs on Vercel besides serving people is listed in `docs/background-jobs.md`, with its trigger, frequency, what it reads and writes, whether it needs to be near real-time, and the Vercel calls a day it costs.
- **The pattern copied.** WonderWorks' `gateway-collect.yml` was studied, read-only, from a public clone. It uses:
  - a jiti-loaded Node runner over the app's own code;
  - steps gated on whether the secrets are present;
  - concurrency groups;
  - an alert issue (from `e2e-nightly.yml` and `browser-worker-health.yml`).
- **New core module `packages/core/src/jobs/`.**
  - `heartbeat.ts`: the steps, how long each heartbeat stays fresh, `isFresh`, `ranOnGitHub` and `recordHeartbeat`.
  - `runner.ts`: the `clock`, `calendar-sync`, `webhooks` and `daily` jobs, built from the existing core functions with their existing claims.
  - `daily.ts`: the retention sweeps that send nothing, extracted from the retention route.
- **Script and workflow.** `scripts/jobs.mjs` (with `--dry-run`) and `.github/workflows/background-jobs.yml` run on these schedules:

  | Job | Schedule |
  |---|---|
  | `clock` + `calendar-sync` | every 10 min |
  | `webhooks` | hourly (was daily) |
  | `daily` | 07:47 IST |

  The workflow can also be started by hand.
- **Migration `20261107140000_platform_job_heartbeats.sql`.** It is safe in either order, and was **applied to the live project** in this session.
- **Vercel routes now skip a step while GitHub's heartbeat is fresh**, and do it again once it is stale:
  - dispatch: keep-warm, knowledge, archive, tidy, Sleep;
  - calendar sync;
  - the retention route's non-sending sweeps;
  - webhook delivery.

  Delivery, digests, health reminders, notices, the key alert and the retry queue stay on the 5-minute tick, for the reasons given in the doc.

## Why this shape

- **Delivery stays on the 5-minute tick.** GitHub's cron is best-effort (often late, sometimes dropped), so it can't be "7:30 lands at 7:30".
- **The heavy work moves.** Moving the batch work cuts what each of the 288 daily dispatch calls does: up to 300 s of Sleep and tidy work after the response.
- **Heartbeats instead of a switch.** They make the cut-over automatic and self-healing. A missing secret or a red run hands the work straight back to Vercel; nothing is skipped.

## Verified

- **Unit tests:** `npx vitest run packages/core/src/jobs` gives 7/7.
  - Freshness windows, unreadable heartbeats, and model steps left to Vercel without a key.
  - A dry run writes nothing; a failing step keeps the next steps going.
  - Three days of irregular GitHub runs (7–41 min gaps and a 2 h outage) beside the 5-minute tick, across three time zones: every household is tidied exactly once per local day, and Vercel steps in only when GitHub's last run is over 30 minutes old.
- **Checks:** typecheck, ESLint on the changed routes, `lint:service-role`, `lint:migrations`, `lint:secrets`, `lint:boundaries` and `lint:embeds` all pass, and so does `npm run build -w apps/web`.
- **`test:scripts`:** one failure (the e2e-cleanup environment test) fails on clean `main` too, so it was not introduced here.
- **Script smoke test:** with a placeholder URL, `node scripts/jobs.mjs clock --dry-run` loads all the job code and stops at the database check.

## Open / needs a person

- **The owner adds the repository secrets** (see the PR's "Needed from you").
- **Until then, every run exits green with a warning and Vercel does everything, as before.** For the same reason, no real GitHub run could be verified in this session.
- **After the secrets are in:** run each job once by hand, first as a dry run and then for real, and read the logs and `platform_job_heartbeats`.
- **After a clean week:** drop the calendar pg_cron schedule and the `webhook-delivery` Vercel cron (`docs/background-jobs.md`, *Cut-over*).

## Cleanup

- No QA accounts, households or Storage files were created.
- The scratch clone of `wonder-jobs` and the build log in the session scratchpad are deleted after the merge.
