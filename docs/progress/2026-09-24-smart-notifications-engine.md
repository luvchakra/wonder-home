# Smart notifications, part 1: the reminder engine

**Date:** 2026-09-24
**Stories:** 23-001 to 23-004 Done; 23-005 to 23-008 and 23-010 In Progress.
**Spec:** `Smart_Notification_System_Master_Implementation.md` (phases 1–3) and its 12-screen mockup.

## Why

The old notification system could decide whether to interrupt someone, but it had four structural problems:
- It evaluated quiet hours in UTC.
- It never linked a notification to the record it was about.
- Nothing cancelled a reminder when the thing it concerned was done.
- Only health sweeps and approvals ever created notifications.

The audit behind these findings is in `design/SMART-NOTIFICATIONS-AUDIT.md`, which records 13 gaps and the decision taken on each.

## What was done

- **Data** (`20260930090000_smart_notifications.sql`, applied live as `smart_notifications`).
  - `notifications` gains:
    - `category`;
    - `source_type`/`source_id` (a closed list; the source must be named, except for the grocery list, a HomeTalk reminder or an approval);
    - a delivery window (`earliest_at`/`latest_at`/`expires_at`);
    - `reminder_policy` and `reminder_seq` (at most 10);
    - `snooze_count`;
    - `dismissed_at`, plus the new `dismissed` status.
  - `notification_preferences` gains quiet-hour minutes.
  - `reminder_preferences` holds each person's preset per category: only they can write it, and an Admin can read it.
  - `notification_reconciliations` is a throttle table that only the server can touch.
  - Recipient guard trigger: a recipient can change state (seen, done, dismissed, or snoozed forward and counted, up to 31 days) but never content. This closes the old gap where they could rewrite a title.
  - Transition trigger: every change of state becomes a `notification_events` row in closed words.
- **Time** (`notifications/timing.ts`). All times are computed on the household's clock and stay correct across daylight saving. `decide.ts` and `channels.ts` now take the time zone, and the UTC bug is fixed. `health/reminders.ts` passes the household's zone through.
- **Policies** (`notifications/policies.ts`). Presets per category are data:
  - bills: 3 days before + due day;
  - school: evening before + morning of;
  - meals: when cooking has to start, taken from the recipe's total time (with a stated 45-minute default when there is no recipe);
  - groceries: late afternoon;
  - pets: on the day;
  - family events: an hour before.

  `placeOutsideQuiet` defers a reminder past quiet hours, or brings it forward when deferring would make it late or turn an evening reminder into a morning one. Only an urgent reminder that can do neither breaks quiet hours.
- **Sources** (`notifications/sources.ts`). These read the rows each domain already keeps. A bill that is paid, cancelled or waived, school work that is done, and a meal that is ready or eaten produce no reminder. The grocery list is one batched reminder per day.
- **Recipient and plan** (`notifications/plan.ts`). One person, never a broadcast, chosen in this order:
  1. the record's own owner;
  2. the responsibility's primary;
  3. a child's guardian;
  4. the backup;
  5. the household Admin (the Head first).

  Only active members with an account are chosen, and never a child unless the child is named. Stages a person has already dismissed or acted on do not return, but later stages still can.
- **Reconcile** (`notifications/reconcile.ts`). Brings the table in line with the records: create, update, resolve, expire, then stamp due rows as delivered and send fresh ones to the person's live channels.
  - It is idempotent: an unchanged reminder is never rewritten, and a snooze is kept until a new stage arrives.
  - It runs:
    - after any signed-in page (`after()`, throttled to once per household per 5 minutes);
    - before `/notifications` reads;
    - for every household in the daily cron.
- **Other notification writers.** HomeTalk reminders, health reminders, checkups and approvals now carry a category and a source. `createNotification` sets a real priority.
- **Actions** (`notifications/actions.ts`). Snooze presets (5 minutes to tomorrow morning), a picked time, dismiss, and mark seen, all through the member's own session.

## Verified

- **Unit.**
  - The smart notification suite has 44 tests covering the spec's §39 scenarios: timing by type, state changes, fatigue, personalisation, idempotency, snooze, time zones and daylight saving.
  - The decide and channel tests gained Kolkata and minute-precision cases.
  - The notification, AI, health and conversation areas pass 783/783.
- **Database.**
  - `scripts/test-smart-notifications-rls.mjs` passes 15/15.
  - The existing `test-notifications-rls.mjs` still passes 17/17.
- **Live.**
  - `npm run verify:live` passed 189/189, including 4 new checks.
  - An end-to-end run on the real project, with a QA household, went as follows:
    - Seeding a bill, a dinner and a family plan created 3 reminders with the right policy, priority and time.
    - A second pass wrote nothing.
    - Marking the bill paid resolved its reminder.
    - The member snoozed the dinner reminder and dismissed the family one.
    - A forged title was refused with error 42501.
    - A dismissed reminder was not recreated.
    - The trail read generated 3, delivered 1, resolved 1, snoozed 1, dismissed 1.
- **Full gate.** `npm run verify` results are in the PR.

## Still open

- **N2:** the notification center UI.
  - The overview (All / Action needed / Upcoming / Updates), the category filter, detail screens with real domain actions (mark paid, mark done, view recipe), and the snooze sheet with a custom picker.
  - The settings screen (quiet hours to the minute, per-category presets), and Today at a glance and the member view.
- **N3:**
  - Escalation to a backup person when nobody acts (stage escalation within a policy already works).
  - Grouping related school items.
  - The HomeBrain digest.
  - Timing learned from behaviour.
- **Domain gaps the audit found:**
  - There is no "mark paid" writer for obligations, and a paid recurring bill does not roll over to the next period.
  - There is no "done" writer for pet care.
  - N2 needs the first; the rest are domain stories.
- **Out-of-app timing.** Push or WhatsApp delivery at a reminder's exact time needs a trigger finer than the daily cron. In-app delivery is exact because a row appears once `scheduled_for` passes.

## Cleanup

- This session created QA user `ff1ddc23-418e-4748-8bbf-8519f1c2bd75` and household `da018b24-5b4a-41f4-8449-928abe471939` ("QA Reminders Home").
- Both are deleted after the merge, as recorded in the PR.

## Where the code lives

- Engine: `packages/core/src/notifications/{timing,policies,sources,plan,reconcile,actions}.ts`.
- Web: `apps/web/app/_lib/reminders.ts`.
- Cron: `apps/web/app/api/v1/platform/retention/route.ts`.
- Tests: `smart.test.ts` and `scripts/test-smart-notifications-rls.mjs`.
