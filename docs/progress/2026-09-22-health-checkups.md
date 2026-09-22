# Story 21-004: checkups & preventive care

Health & Fitness's fourth story: a household-configured recurring
preventive-care commitment ("dental cleaning every 6 months") — never a
schedule WonderHome invents on its own.

## What was built

- **`supabase/migrations/20260922130000_health_checkups.sql`** —
  `health_checkups`: person, label, `checkup_type`, `source`
  (`user_defined | doctor_recommended | imported_appointment |
  configured_plan | informational_template`), `cadence_days` (nullable,
  CHECK `> 0`), `next_due_on`, `last_completed_on`, `privacy_scope`,
  `status` (`active | dismissed`), `linked_appointment_id`. Same
  self-or-guardian-only RLS shape 21-001 through 21-003 established. Also
  adds `health_appointments.checkup_id`, so the link between the two
  entities is bidirectional: a checkup points at whichever appointment
  currently represents its next occurrence, and an appointment points back
  at the checkup it belongs to (if any).
- **`packages/core/src/health/checkups.ts`** — repository:
  `listCheckups`, `getCheckup`, `createCheckup`, `updateCheckup`,
  `rescheduleCheckup`, `dismissCheckup`/`reactivateCheckup` (never a hard
  delete — rule 12), `completeCheckup()`, and `classifyCheckup()` — a pure
  function deciding `overdue | due_soon | silent` from `next_due_on` and a
  14-day window, the one place the due/overdue decision is made so the
  Overview never invents its own definition of "due soon".
  `completeCheckup()` stamps `last_completed_on`, computes the next
  `next_due_on` from `cadence_days` when one is configured, and dismisses
  a one-off checkup (no cadence) instead — there is no next occurrence to
  wait for.
- **The appointment/checkup bridge** — `syncCheckupForAppointment()` in
  the same file, called from both `health-appointment-actions.ts`'s
  `setAppointmentStatusAction` and the appointments API route's
  `set_status` branch (the only two places an appointment's status can
  change): completing a linked appointment completes its checkup using
  the *appointment's own date* (when the visit actually happened, not
  whenever someone clicked a button); cancelling only clears the link, so
  the checkup is free to be rebooked without ever being silently marked
  done.
- **`createAppointment()` now validates a `checkupId`** before honouring
  it — fetches the checkup scoped to the actor's own household via
  `getCheckup()` rather than trusting a caller-supplied id as-is, since it
  can arrive from an API request rather than the UI's own checkup list.
- **`healthCheckupsAgenda()`** in `agenda.ts`: overdue → Needs attention,
  due soon → Coming up (alongside confirmed appointments), a recent
  completion → Recent. A checkup that is neither due nor overdue is
  silent, per the story's own acceptance criterion.
- **UI**: `apps/web/app/_components/health-checkup-forms.tsx` —
  `AddCheckupButton` (who/what/type/repeats/next-due/privacy/notes),
  `EditCheckupButton` (content, cadence *and* next due date together —
  see the density note below), `CheckupActions` (mark done, a contextual
  "Book" that links the new appointment to this checkup and disappears
  once one is booked, edit, remove/bring-back). `/health`'s Overview
  gained an "Add a checkup" entry point, and `BookAppointmentButton`
  gained optional `checkupId`/`defaultMemberId`/`defaultAppointmentType`/
  `trigger` props so a checkup row can open the same booking wizard
  pre-linked and pre-filled instead of duplicating it.
- Audit events (`health.checkup_created`, `_updated`, `_rescheduled`,
  `_completed`, `_dismissed`, `_reactivated`) and their
  `sensitive-actions.ts` descriptions; new `/health/checkups(/:id)`
  OpenAPI paths.

## A UI bug caught during live verification, not left for a household to find

The first pass gave a checkup row five icon actions (mark done, book,
reschedule, edit, remove). At 390px that left too little width for the
title, which wrapped into an unreadable stack of one-word lines
("Checkup / QA / — / Dental / cleaning"). Fixed by folding reschedule into
the edit sheet — content, cadence and next due date all save from one
form — bringing every row down to four icons at most, the same density
every other health row already uses. Re-verified with a fresh screenshot
before moving on.

## Verified

- `npx vitest run src/health` — 6 files, 60 tests, all passed (8 new:
  `classifyCheckup`'s three buckets, `createCheckup`'s default source,
  `completeCheckup`'s cadence-advance and one-off-dismiss paths,
  `syncCheckupForAppointment`'s completed/cancelled/other-status
  branches, via a hand-rolled fake Supabase client).
- `node --test scripts/test-health-checkups-rls.mjs` — 9/9: self access,
  admin cannot read or write another adult's private checkup,
  `household_operational` visible to any member, guardian can manage a
  child's checkup, a non-guardian cannot, `selected_family` requires
  consent, the `cadence_days > 0` CHECK constraint rejects zero and
  negative values, and `health_appointments.checkup_id` links correctly
  within a household.
- Full `npm run verify` — typecheck, lint, unit, 9 database/RLS suites,
  build, 320 e2e — all green, both before and after the density fix.
- Migration applied to the live Supabase project (`kqxndableyysxqhxiorz`)
  via `apply_migration`; `npm run verify:live` — 102/102 checks, including
  two new ones (anonymous cannot read or create a `health_checkups` row)
  and a new shipped-column check for `health_appointments.checkup_id`.
- Live browser verification with a real QA household (granted `pro` via
  direct SQL for `health.tracking`): added an overdue checkup, booked its
  linked appointment via the row's own contextual "Book" action, confirmed
  and completed that appointment, and watched the checkup automatically
  drop out of Needs Attention (next due date advanced past the due-soon
  window) and land in Recent with the real completion date — at 390px and
  1280px desktop. QA household and auth user removed afterward; dev server
  stopped.

## What's still open

Health records & HomeSend intake (21-005), HomeBrain/HomeTalk health
context (21-006), vitals (21-007) and fitness scaffolding (21-008) remain,
per `backlogs/21-Health-and-Fitness.md`.
