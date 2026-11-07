# Background jobs: what runs where

Since 2026-11-07, scheduled and batch work runs on **GitHub Actions** where it can (`.github/workflows/background-jobs.yml`). This follows the WonderWorks pattern (`luvchakra/wonder-jobs`, `gateway-collect.yml`). The workflow runs the app's own core code in Node (`scripts/jobs.mjs` loads `packages/core/src/jobs/runner.ts` through jiti) straight against Supabase with the service-role key. It never calls the site. Vercel keeps what people wait on, the inbound webhooks, and the five-minute delivery tick.

## How the hand-over works (no switch to flip)

- **Heartbeats.** Each step the runner finishes writes a heartbeat to `platform_job_heartbeats`: one row per step, counts only, service role only.
- **Vercel skips fresh steps.** The Vercel side of the same step asks `ranOnGitHub` (`packages/core/src/jobs/heartbeat.ts`) and skips the step while its heartbeat is fresh:

  | Step | Fresh for |
  |---|---|
  | Clock steps | 30 min |
  | Calendar sync | 45 min |
  | Webhooks | 3 h |
  | Daily | 26 h |

- **Vercel takes stale steps back.** When a heartbeat goes stale, Vercel does the step again by itself. A heartbeat goes stale when a schedule is dropped, a secret is missing, a run is red or Actions is down.
- **Unreadable heartbeats.** If the heartbeat table can't be read, Vercel treats it as "none fresh" and does everything.
- **Claims prevent double work.** A step can run on both sides at once, for example in the first minutes, or when a GitHub run lands just as a heartbeat goes stale. Each step keeps its own claim, so nothing happens twice:

  | Step | Claim |
  |---|---|
  | Tidy | a `homesend_tidy_runs` row per household per local day |
  | Sleep | a `homebrain_runs` row per household per local date |
  | Knowledge drain | a `claim_knowledge_outbox` token |
  | Calendar sync | `claim_due_calendar_subscriptions`, `for update skip locked` |
  | 30-day archive | an idempotent RPC |
  | Retention | each delete is "older than", so a second run deletes nothing twice |

- **Webhook delivery has no row claim.** That is unchanged from before. GitHub runs it at :47, clear of Vercel's 03:30 UTC call, and Vercel skips it once the first GitHub run lands. Receivers already dedupe on `event_id`.
- **The household's clock.** Tidy ("from 04:00 on the household's own clock") and Sleep ("2–5 am") look at local time when they run, then claim the local day.
  - A late, skipped or doubled run neither misses nor repeats a day: the first run inside the window does the work, and later runs find the claim.
  - A gap longer than 30 minutes lets the delivery clock do it instead.
  - `packages/core/src/jobs/runner.test.ts` simulates three days of irregular GitHub runs (gaps of 7 to 41 minutes and a two-hour outage) beside the 5-minute Vercel tick, across three time zones.
- **Steps that need a model.** Tidy and Sleep need the platform AI key. Without `WONDERHOME_AI_KEY` the runner leaves them to Vercel and writes no heartbeat, so they never run worse on GitHub.

## Inventory (2026-11-07)

Vercel invocations per day are estimated from the schedules. Hobby keeps one hour of runtime logs, so a day's real count can't be read.

| Process | Trigger before | Frequency | Reads / writes | Needs near real-time? | Vercel calls/day before | Now |
|---|---|---|---|---|---|---|
| Delivery tick: reminder stages, health reminders, due reminders and their pushes, notice sweep, digests, AI key alert | pg_cron `wonderhome-notification-dispatch` calls `/api/v1/notifications/dispatch` | 5 min | `notification_reconciliations`, `notifications`, push and mail via `deliverNotification`, `notification_preferences`, `ai_key_alerts` | **Yes** ("a reminder set for 7:30 lands at 7:30") | 288 | **Vercel** (see below) |
| Retry queue (`drainJobs`) | inside the dispatch call, after the response | 5 min | `jobs` (lease 120 s) | Yes (WhatsApp replies) | (within the 288) | **Vercel**: the WhatsApp handler needs the app's HomeTalk |
| HomeBrain keep-warm (`keepStoresWarm`) | dispatch call | 5 min | `household_context` | No | (within the 288) | **GitHub** `clock`, Vercel skips while fresh |
| Knowledge drain (`drainKnowledge`) | dispatch call | 5 min | knowledge outbox and facts | No | (within the 288) | **GitHub** `clock` |
| HomeSend 30-day archive | dispatch call, after the response | 5 min | `home_send_items` | No | (within the 288) | **GitHub** `clock` |
| HomeSend daily tidy (from 04:00 household time) | dispatch call, after the response | 5 min, once a day per household | `homesend_tidy_runs`, `home_send_items`, model | No | (within the 288, up to 300 s each) | **GitHub** `clock` (with the AI key) |
| HomeBrain Sleep (2–5 am household time) | dispatch call, after the response | 5 min, once a night per household | `homebrain_runs`, memories, certification, links, model | No | (within the 288, up to 300 s each) | **GitHub** `clock` (with the AI key) |
| Kids Trivia refill (`runTriviaRefill`, 08-035) | GitHub `clock` step `clock.trivia-refill`; dispatch call after the response while GitHub is stale | each clock run, up to 4 pools (2 on Vercel) | `trivia_refill_queue`, `trivia_pool`, `trivia_generation_usage`, model (the asking household's terms, at most 6 batches a day) | No | (within the 288) | **GitHub** `clock`, Vercel skips while fresh |
| Calendar subscription sync | pg_cron `wonderhome-calendar-subscription-sync` calls `/api/v1/calendar/subscriptions/sync` | 15 min | `calendar_subscriptions`, events, external ICS fetches | No (a feed syncs about every 6 h) | 96 | **GitHub** `clock`. The Vercel call returns at once while fresh |
| Retention: purge, handoffs, matured deletions, cleanup, purge dry-run, old event rows, Open Food Facts staples | Vercel cron `/api/v1/platform/retention` | daily 03:00 UTC | the retention tables, `grocery_catalog` | No | 1 | **GitHub** `daily`, Vercel skips while fresh |
| Retention route's sending parts: health sweeps, reminder reconcile, retry queue, payments reconcile | the same cron | daily | notifications and push, billing providers | No | (the same 1) | **Vercel**: they send through `deliverNotification`, which needs VAPID, SMTP and WhatsApp secrets; payments need provider keys. These sweeps only catch what the 5-minute tick missed |
| Developer webhooks (`deliverPendingWebhooks`) | Vercel cron `/api/v1/platform/webhook-delivery` | daily 03:30 UTC (plan limit) | `webhook_deliveries`, outbound HTTP | Better more often | 1 | **GitHub** `webhooks`, **hourly** |
| Portal fetch jobs | pg_cron enqueues; `apps/portal-worker` on Fly polls | twice a day, plus polling | `portal_fetch_jobs` | — | 0 (not Vercel) | unchanged (Fly) |
| HomeSend tidy on demand, catalog import on demand | a person or operator calls the route | by hand | — | — | ~0 | Vercel (manual routes, behind `CRON_SECRET`) |
| Per-request `after()` work (reminder reconcile on page load, HomeTalk deferred writes, webhook handlers' deferred work, notice sweeps) | a person's request | per request | — | Yes (what that person just did) | — | **Vercel**: part of serving the person |
| Weather, films, careers | read at request time, no scheduled job | — | — | — | 0 | nothing to move |

**What stays on Vercel, and why**
- **The delivery tick.** It has to fire every 5 minutes. GitHub's cron is best-effort: runs often start 5–20 minutes late, and some are dropped under load. So reminders, pushes, digests and stages stay on pg_cron → Vercel. The tick is now short: the slow `after()` work (Sleep, tidy, archive) and the synchronous keep-warm and knowledge drain have moved.
- **The retry queue.** WhatsApp jobs call the app's HomeTalk gateway (`apps/web/app/_lib/whatsapp-hometalk.ts`, `server-only`), and a retry is a person waiting for a reply.
- **Everything a person triggers and waits for.**
- **Inbound webhooks** (WhatsApp, email, payments). The sender calls our URL, so they have to stay where the URL is.
- **The daily sending sweeps.** Running them on GitHub would mean copying VAPID, SMTP, WhatsApp and payment secrets into the repository, for sweeps that only back up the 5-minute tick.

**What the move saves on Vercel**
- **The long work.** Before, the up-to-300 s `after()` work (Sleep, tidy, archive) rode on the 288 dispatch calls a day, and keep-warm and the knowledge drain ran on every one of them. Now none of it runs on Vercel while GitHub is healthy.
- **The calendar calls.** The 96 calendar-sync calls a day now return after one indexed read.
- **The daily calls.** Retention and webhook delivery become one small read each.
- **Removing the triggers.** This is left for later. The pg_cron calendar schedule and the two `vercel.json` crons can go once GitHub has run cleanly for a week (see *Cut-over*).

## Operating it

- **Workflow:** `.github/workflows/background-jobs.yml`. It runs on schedules and by hand (Actions → Background jobs → Run workflow, choosing a job, with an optional dry run). It never runs on a pull request, so a fork never sees the secrets.
- **Script:** `node scripts/jobs.mjs <clock|calendar-sync|webhooks|daily> [--dry-run]`.
  - A dry run loads the code, proves the database is reachable with one count, and prints the plan. Nothing is claimed, written or sent.
  - Output is counts only.
- **Secrets** (repository secrets):
  - Required: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
  - Optional: `WONDERHOME_AI_KEY`, `WONDERHOME_AI_PROVIDER`, `WONDERHOME_AI_MODEL`, `WONDERHOME_AI_UNDERSTANDING_MODEL`.
  - Without the two required secrets every run warns and exits green.
- **Permissions:** `contents: read` for the workflow. Only the alert job gets `issues: write`. Actions are pinned to SHAs.
- **Concurrency:** one group per job, `cancel-in-progress: false`. A step times out after 15 minutes and the job after 20.
- **Alerts:**
  - A failed scheduled run opens one "Background jobs failing" issue, once rather than every ten minutes.
  - The next green run closes it.
  - Vercel has already taken the failed step back by then.
- **Seeing state:**

  ```sql
  select step, runner, last_ok_at, last_error_at, last_error, summary
  from public.platform_job_heartbeats
  order by step;
  ```

- **Actions minutes:** the repository is public, so standard runners are free. About 170 runs a day; each installs from the npm cache in about a minute.

## Cut-over

1. **Done (this PR):** the workflow ships with every Vercel trigger still on. The heartbeats move the work over as soon as GitHub runs succeed.
2. **The owner adds the secrets.** Then run each job once by hand: first a dry run, then a real run. Read each run's log and the heartbeats.
3. **After a clean week:**
   - Drop the pg_cron `wonderhome-calendar-subscription-sync` schedule, through a migration.
   - Remove `/api/v1/platform/webhook-delivery` from `vercel.json`. Keep the route behind `CRON_SECRET` for manual use, as WonderWorks does.
   - Keep the retention cron for its sending sweeps.
   - The dispatch tick stays.
