# Notification center: feed, detail, actions, snooze, settings (stories 23-005..007)

**Date:** 2026-09-24 · **Module:** 23 Smart Notifications · **PR:** N2 of 3

## What was done

The second of three PRs for the Smart Notification System spec. N1 built the
engine that derives reminders from real records. N2 adds the screens a person
uses to act on them.

- **Feed (`apps/web/app/notifications/page.tsx`).** The page reconciles
  first, so a bill paid somewhere else is already cleared. It then shows the
  person's own reminders under four tabs:
  - **All:** everything open, most pressing first (priority, then the
    nearest deadline, then the newest).
  - **Action needed:** what is waiting on this person to do something.
  - **Upcoming:** today and tomorrow, with anything later grouped
    separately; each reminder shows its time on the household's clock.
  - **Updates:** what was handled or resolved itself this week.

  Category chips appear only for categories that have something in them.
  Opening the feed marks what is due as seen, which is what the new nav badge
  counts.
- **Detail (`_components/reminder-row.tsx`, `_lib/reminder-views.ts`).**
  - Each row is an `ExpandableRow` that opens to the record behind it. That
    record is read now through the person's own session and is never copied
    onto the reminder.
  - Per source, the row shows:
    - a bill: amount, due date, payee and how often it repeats;
    - a school item: the item and its due date;
    - a meal: the dish, when it should be ready, and the recipe's cooking time;
    - pet care: the pet and the kind of care;
    - a family plan: when and where.
  - A line explains why a reminder came when it did, but only when the
    engine actually moved it for quiet hours.
- **Actions that change the real thing (`(auth)/notification-actions.ts`).**
  None of these edits the reminder itself. Each goes through the domain's own
  service, and the reminder clears by reconciliation.
  - **Mark as paid** goes through `markObligationPaid`. A recurring bill
    rolls to its next due date via `nextDueDate` (month-end clamped) and
    records history. A one-off bill is marked paid. Only Admins see the
    button.
  - **Mark done** goes through `completeSchoolItem` or `markPetCareDone`. A
    repeating pet need starts its next cycle.
  - **Remind me later** offers 15 minutes, an hour, later today or tomorrow
    morning. It also accepts a day in the next week and a time, both on the
    household's clock.
  - **Dismiss.**

  Each action redirects with a closed code (`done`, `next`, `until`), so the
  confirmation survives the row disappearing.
- **Settings (`settings/notifications/page.tsx`,
  `_components/reminder-settings-form.tsx`).**
  - Quiet hours can be set to the quarter hour on the household's clock.
  - Each kind of reminder has its timing picked from the policy's own
    presets, with an on/off switch.
  - Saving reconciles, so reminders that are already waiting move straight
    away. The per-channel cards remain below.
- **Nav badge.** `SidebarLink` gains a `badge` count, shown in the drawer and
  the sidebar next to Notifications.
- **Engine fixes found while testing.**
  - A low-priority reminder whose whole window fell inside quiet hours used
    to be dropped. It now arrives before quiet hours instead: early is
    acceptable, never is not.
  - Bill threads are keyed by due date, so paying a recurring bill starts a
    fresh thread for the next one.
  - A pet need that has already been done no longer counts as due.

## Verified

- `npx vitest run src/notifications` passes: 107 tests, including new cases
  for a paid recurring bill opening a new thread, one-off pet care, a
  reminder never being dropped by quiet hours, and a plan that starts inside
  quiet hours. The `nextDueDate` month-end cases pass. The web `tsc` is
  clean.
- Browser QA at 360px and at desktop width, on a synthetic household, in the
  feed, detail and settings screens:
  - Mark as paid on a monthly Electricity bill moved `due_on` a month on,
    recorded history, and cleared its reminder.
  - Mark done on a school item cleared its reminder.
  - Snooze confirmed the local return time ("today at 8:31 pm").
  - Dismiss cleared the row and showed its confirmation.
  - Quiet hours 22:30 and bill timing "on the due day" saved and displayed
    as saved.
  - The drawer badge showed the new count.
  - No horizontal overflow at 360px.
- Full `npm run verify` before the PR (see the PR for results).

## Still open

- **23-009:** the "For me / Household / Assigned by me" split and a list of
  the responsibilities that route to this person. Moved to N3.
- **N3:** batching related school items (23-008), escalating to a backup
  person when nobody acts (23-010), the HomeBrain digest (23-011), and timing
  learned from behaviour (23-012).
- **i18n PR2:** reminder titles and these screens in the other languages.

No migration: N2 reads and writes only through what N1 shipped.

## Cleanup

Planned for after the merge: delete the QA household and account created for
this session (user `57e8df96-693d-4e7c-beae-6ebef26ca00b`, household
`51d9583f-2d1b-4c00-b514-eccf9fbc8347`).
