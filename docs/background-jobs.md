# Background jobs: what runs where

Since 2026-11-07, scheduled and batch work runs on **GitHub Actions** where it can (`.github/workflows/background-jobs.yml`). This follows the WonderWorks pattern (`luvchakra/wonder-jobs`, `gateway-collect.yml`). The workflow runs the app's own core code in Node (`scripts/jobs.mjs` loads `packages/core/src/jobs/runner.ts` through jiti) straight against Supabase with the service-role key. It never calls the site. Vercel keeps what people wait on, the inbound webhooks, and the five-minute delivery tick.


**Production only (2026-11-25).** `background-jobs.yml` and `delivery-clock.yml` run against production (their `SUPABASE_*` secrets). The test environment (`docs/test-environment.md`) has no GitHub jobs: its pg_cron calls `test.home.wonderapps.biz` at most hourly and has no GitHub delivery clock, so its own heartbeats go stale and the test server runs every step itself. Heartbeats stay per database.

## The delivery clock on GitHub (2026-11-23)

The owner: "i thought this process is resource intensive, can we move these jobs to GitHub instead" (Vercel Hobby was paused this month for Fluid Active CPU). GitHub's own scheduler can't keep a 5-minute beat: on 2026-11-22/23 the 10-minute `background-jobs.yml` schedule actually ran at 16:29, 18:03, 21:58, 23:51, 02:30, 08:16, 10:54 and 11:10 UTC. So the database keeps the time and GitHub does the work.

**Trigger chain**

1. pg_cron `wonderhome-delivery-clock-github` (`*/5 * * * *`) runs `select wh.trigger_delivery_clock();` (migration `20261123120000_delivery_clock_github.sql`).
2. The function reads the token saved in Platform admin → Integrations → Background jobs → "GitHub delivery-clock token" (`GITHUB_DISPATCH_TOKEN`, kept in Vault by `platform_config`; migration `20261123150000`; the Vault secret `github_dispatch_token` is a fallback) and, with pg_net, POSTs `{"ref":"main"}` to `https://api.github.com/repos/luvchakra/wonder-home/actions/workflows/delivery-clock.yml/dispatches`. Without Vault, pg_net or the token it returns `no-vault`, `no-net` or `no-token` and sends nothing.
3. `.github/workflows/delivery-clock.yml` (`workflow_dispatch`, and `repository_dispatch` type `delivery-clock`) runs two jobs:
   - **Deliver** (`node scripts/jobs.mjs delivery`, job timeout 4 min, concurrency `delivery-clock`, queued not cancelled): reminder stages, health reminders, due reminders and their pushes through `deliverNotification`, notices, waiting proposals (with the moment judge), stale clears, unanswered senders, the AI key alert, digests (`packages/core/src/jobs/delivery.ts`). Each step writes a heartbeat `delivery.*`.
   - **Clock** (`node scripts/jobs.mjs clock` then `calendar-sync`, concurrency `background-jobs-clock`, shared with `background-jobs.yml`): the batch steps and the calendar feeds, in their own group so a long night's Sleep never holds a reminder back.
4. pg_cron `wonderhome-notification-dispatch` still calls `/api/v1/notifications/dispatch` every 5 minutes. The route reads the delivery and clock heartbeats and the retry queue in one wave. All fresh → it answers (`{ ok, onGitHub, queued }`), draining the retry queue after the response only when a job is waiting. Any stale → it runs just those steps (`runDeliveryFallback`), then the stale clock steps as before.
5. pg_cron `wonderhome-calendar-subscription-sync` still calls the calendar route every 15 minutes; it returns after one heartbeat read while `calendar-sync` is fresh, which the Clock job now keeps fresh every 5 minutes.

**Keys.** The runner reads the push (VAPID), mail (SMTP), WhatsApp and AI keys from Platform admin with the service role (`scripts/jobs.mjs` → `enablePlatformSettings`), the values the site uses. With no VAPID keys saved there, the sending steps (`delivery.health`, `.due`, `.notices`, `.proposals`, `.digests`) are left to Vercel and write no heartbeat; with no mail settings, `delivery.key-alert` is. So a reminder never goes out from GitHub with less than the site would send.

**Failure modes**

| What breaks | What happens |
|---|---|
| No "GitHub delivery-clock token" saved in Platform admin (the state until the owner adds it; Overview and Integrations say "Delivery clock on GitHub: not set") | The function returns `no-token`; nothing runs on GitHub; Vercel delivers every 5 minutes as before |
| Token expired or revoked, or missing Actions write | GitHub answers 401/403/404 (in `net._http_response` for 6 h); no runs; heartbeats go stale; Vercel takes over within 15 minutes; Platform admin shows "Delivery clock on GitHub: failing" in Configuration health |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` repository secrets missing | Each run warns and exits green; no heartbeats; Vercel keeps delivering |
| A run fails or a step throws | That step's heartbeat keeps its last good time and goes stale after 15 minutes; Vercel does it |
| Runs queue up (GitHub slow to start) | One runs, one waits, newer dispatches replace the waiting one; a reminder is at most a few minutes late |
| GitHub Actions down | Heartbeats stale after 15 minutes; Vercel does everything again |
| pg_cron or pg_net down | Neither side ticks (as before this change) |
| `CRON_SECRET` drift (Vault `cron_secret` ≠ Vercel) | Fixed 2026-11-23: the "Scheduler key" in Platform admin is the Vault secret pg_cron sends, and the routes accept it as well as Vercel's `CRON_SECRET`. Use Generate new key once; Configuration health says whether it matches Vercel's |
| Both run a step at once | Nothing twice: due reminders are claimed by the one `generated → delivered` update that returns them, health reminders by their sent rows, digests by their day, proposals and stale clears by compare-and-set |

The worst case on a GitHub failure is reminders up to about 20 minutes late (15 minutes stale, plus a tick), once, before Vercel takes over.

## How the hand-over works (no switch to flip)

- **Heartbeats.** Each step the runner finishes writes a heartbeat to `platform_job_heartbeats`: one row per step, counts only, service role only.
- **Vercel skips fresh steps.** The Vercel side of the same step asks `ranOnGitHub` (`packages/core/src/jobs/heartbeat.ts`) and skips the step while its heartbeat is fresh:

  | Step | Fresh for |
  |---|---|
  | Delivery steps (`delivery.*`) | 15 min |
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
  | Needs-you deadlines | one open `needs_you_items` row per thing per source (unique index), and every write a compare-and-swap on what was read |
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
- **Steps that need a model.** Tidy and Sleep need the platform AI key. The runner reads it, with the provider and model names, from Platform admin (`platform_config`, through the service role it already has; `jobs/runner.ts`), the same saved values the site uses, never a GitHub secret (owner, 2026-11-21). With no key saved, or the store unreadable, it leaves them to Vercel and writes no heartbeat, so they never run worse on GitHub or with a different key from the site's.

## Inventory (2026-11-07)

Vercel invocations per day are estimated from the schedules. Hobby keeps one hour of runtime logs, so a day's real count can't be read.

| Process | Trigger before | Frequency | Reads / writes | Needs near real-time? | Vercel calls/day before | Now |
|---|---|---|---|---|---|---|
| Delivery tick: reminder stages, health reminders, due reminders and their pushes, notice sweep, proposals, stale clears, senders, digests, AI key alert | pg_cron `wonderhome-notification-dispatch` calls `/api/v1/notifications/dispatch` | 5 min | `notification_reconciliations`, `notifications`, push and mail via `deliverNotification`, `notification_preferences`, `ai_key_alerts`, `conversation_actions`, `homesend_email_senders` | **Yes** ("a reminder set for 7:30 lands at 7:30") | 288 | **GitHub** `delivery-clock.yml`, dispatched every 5 min by pg_cron `wonderhome-delivery-clock-github` (2026-11-23); Vercel's tick skips each fresh step and answers after one read |
| Retry queue (`drainJobs`) | inside the dispatch call, after the response | 5 min | `jobs` (lease 120 s) | Yes (WhatsApp replies) | (within the 288) | **Vercel**: the WhatsApp handler needs the app's HomeTalk. Since 2026-11-23 drained only when a job is waiting (two indexed reads) |
| HomeBrain keep-warm (`keepStoresWarm`) | dispatch call | 5 min | `household_context` | No | (within the 288) | **GitHub** `clock`, Vercel skips while fresh |
| Knowledge drain (`drainKnowledge`) | dispatch call | 5 min | knowledge outbox and facts | No | (within the 288) | **GitHub** `clock` |
| HomeSend 30-day archive | dispatch call, after the response | 5 min | `home_send_items` | No | (within the 288) | **GitHub** `clock` |
| HomeSend daily tidy (from 04:00 household time) | dispatch call, after the response | 5 min, once a day per household | `homesend_tidy_runs`, `home_send_items`, model | No | (within the 288, up to 300 s each) | **GitHub** `clock` (with the AI key) |
| "Nothing waits" deadlines (`runNeedsYouDeadlines`, 2026-11-14) | GitHub `clock` step `clock.homesend-deadlines`; dispatch call after the response while GitHub is stale | each clock run (50 households; 10 on Vercel), up to 200 due defaults | `needs_you_items`, `home_send_items`, `homesend_changes`, `conversation_actions` (48-hour close), `jobs` (read-again) | No (a default is due 24 h after the thing was sent) | (within the 288) | **GitHub** `clock`, Vercel skips while fresh |
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
- **The delivery tick's fallback.** Until 2026-11-23 the delivery tick itself stayed here, because GitHub's cron is best-effort. It now runs on GitHub, dispatched by pg_cron (*The delivery clock on GitHub*, above); the route stays as the fallback.
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
  - No AI secrets. `WONDERHOME_AI_*` secrets are no longer passed to the job and can be deleted (`docs/progress/2026-11-21-ai-key-one-place.md`).
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

- **Actions minutes:** the repository is public, so standard runners are free. About 170 `background-jobs.yml` runs a day plus 288 `delivery-clock.yml` runs (two jobs each); each installs from the npm cache in about a minute.
- **Delivery clock:** Actions → Delivery clock → Run workflow (optional dry run) runs it by hand. Is pg_cron dispatching, and what did GitHub answer (204 is success)?

  ```sql
  select wh.trigger_delivery_clock();  -- 'dispatched', or why not: no-vault, no-net, no-token
  select status_code, created from net._http_response order by created desc limit 5;
  select jobname, schedule, active from cron.job where jobname like 'wonderhome-%';
  ```

## Cut-over

1. **Done (this PR):** the workflow ships with every Vercel trigger still on. The heartbeats move the work over as soon as GitHub runs succeed.
2. **The owner adds the secrets.** Then run each job once by hand: first a dry run, then a real run. Read each run's log and the heartbeats.
3. **After a clean week:**
   - Drop the pg_cron `wonderhome-calendar-subscription-sync` schedule, through a migration.
   - Remove `/api/v1/platform/webhook-delivery` from `vercel.json`. Keep the route behind `CRON_SECRET` for manual use, as WonderWorks does.
   - Keep the retention cron for its sending sweeps.
   - The dispatch tick stays, as the delivery clock's fallback.
