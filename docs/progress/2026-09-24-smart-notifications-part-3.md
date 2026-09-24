# Smart notifications, part 3: batching, escalation, the day's summary, learned timing (stories 23-008..012)

**Date:** 2026-09-24 · **Module:** 23 Smart Notifications, now complete · **Migration:** `20261001090000_smart_notifications_batching.sql`, applied live

## What was done

The last of three PRs for the Smart Notification System spec. Part 1 derives
reminders from real records; part 2 is the notification center; this part
makes fewer, better interruptions and adds the intelligence layer, which
suggests and never decides.

- **School batching (23-008).** A child's school things that are due the
  same day, and that would go to the same person, become one reminder:
  "Aarav — 3 things for tomorrow · Science project, Maths worksheet and
  Sports day."
  - Source: `school_day`, the child.
  - The grouped reminder names each item in its decision factors, and its
    detail lists each item.
  - "Mark all 3 done" completes each item through `completeSchoolItem`.
  - The group is as urgent as its most urgent item, so nothing critical is
    hidden inside it.
  - Grouping is switched on per policy (`batching`). The grocery list was
    already one reminder a day.
- **Escalation (23-010).** Only policies that escalate do this: bills after
  3 hours, school after 1 hour, pets after 2 hours. When the responsible
  person's last reminder has been delivered, and not acted on, dismissed or
  snoozed for that long, the responsibility's backup gets one reminder.
  - It names who has not answered: "Kunal has not marked it done yet."
  - It follows the backup's own settings and quiet hours.
  - It is never sent again once the backup dismisses it.
  - It is recorded as `escalated` on the reminder that went unanswered.
  - `maxRemindersFor` puts a hard cap on everything: the preset's stages
    plus one backup.
- **"What comes to you" (23-009).** In settings: the responsibilities that
  route reminders to this person, either first or as backup, with a link
  to change them on Responsibilities.
  - Decision: there is no "Household" view of other people's reminders. A
    person's reminders are theirs; the Admin already decides who owns what.
- **HomeBrain summary (23-011).** "HomeBrain summary · Today" sits above
  the list. It shows today's reminders in the order they come, built from
  the same rows. It is on by default, and each person can turn it off
  (`notification_preferences.daily_digest`).
- **Learned timing (23-012).** Off by default; each person can turn it on
  (`learn_timing`). `learning.ts`:
  - **Evidence:** only times the person acted on a reminder itself (the
    `acted` status, now recorded when "Mark as paid" or "Mark done" is used
    from a reminder), over 60 days.
  - **Threshold:** at least 5 times, with the middle half within 2 hours.
  - **Effect:** the first reminder of that kind moves to their median time,
    on the quarter hour.
  - **Limits:** never over a preset they chose (anything other than the
    default), never a "before" reminder, never past the next stage. Quiet
    hours still apply. The row only says "around when you usually deal with
    these" when a learned time actually moved it.

## Verified

- **Unit tests:** 117 notification tests pass, 10 of them new. They cover:
  - grouping, grouping's urgency, and never grouping different children, days
    or a single item;
  - escalation's wait, the backup, never repeating, and the backup's quiet
    hours;
  - `maxRemindersFor` against the database's bound;
  - learning's threshold, spread and true median;
  - `withLearnedTime`'s limits, and that a learned time is claimed only when
    it was used.
- **Database suite:** 17 of 17 pass, 2 of them new.
  - A `school_day` reminder must name its child.
  - The two new choices are each person's own, learning starts off, and an
    Admin cannot change another person's choice.
  - Found while writing that test: psql prints a bare boolean as `t`, so the
    check reads it as text.
- **Live project:** the migration was applied via Supabase MCP, and
  `npm run verify:live` passed 191 of 191 checks, including the two new
  columns.
- **Browser QA** at 360px and desktop, on a synthetic household with two
  adults:
  - the grouped school day showed both items, "Mark all 2 done" completed
    both, and the reminder was recorded as `acted`;
  - the bill's escalation reached the backup with its reason line, and
    there was no "Mark as paid" for a non-Admin;
  - the digest listed today's two reminders;
  - the settings cards saved, and the row changed only those two columns;
  - no horizontal overflow at 360px.
- **Full `npm run verify`:** the result is in the PR.

## Still open

- **The first page after sign-in can miss a brand-new reminder.** The
  session's background pass may still hold the 5-minute reconcile turn.
  The next load shows it. Waiting for the throttle would slow every page,
  so this is left as is.
- **i18n PR 2** will cover grouped and escalated wording in other languages.

## Cleanup

Done after the merge (#161, `1b2852c`):
- The QA household "QA Escalation Home" (`554226fb-055d-49d1-a03a-ab640223aac6`)
  was deleted with every row in it, including the bill, the school items and
  the responsibility inserted by hand to set up the scenarios.
- The QA accounts `aa433d0d-e3e8-4266-9d46-a95a6f19ecaf` and
  `dee3da8e-c383-42dd-82f4-9bacc4ae8dba` were deleted.
- The scratch env files, screenshots and logs were removed, and the dev
  server was stopped.

A count over every `household_id` table in `public` and `wh`, the auth users
and Storage found nothing left.
