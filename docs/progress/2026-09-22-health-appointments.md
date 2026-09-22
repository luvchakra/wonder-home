# Story 21-002: Appointments

## What

The second story of the Health & Fitness domain (module 21): letting any
authorized member book, track and complete a health appointment for
themselves or a child they guard, with useful reminders and calendar
coordination.

**Schema** (`supabase/migrations/20260922090000_health_appointments.sql`,
applied live): `health_appointments` — person, type (10 kinds), status
(`proposed | confirmed | completed | cancelled | rescheduled`), the same
`privacy_scope` 21-001 established, plus every optional field the spec
lists (provider, facility, location, end time, preparation notes, notes,
reminder preferences, calendar sync). RLS reuses 21-001's exact shape:
`wh.may_see_health()` for SELECT, self-or-guardian-only for
INSERT/UPDATE/DELETE — no household-admin bypass, and "for another person
where permitted" means the guardian case specifically, never a
`selected_family`-consented viewer (a consent grant is about seeing, not
acting on someone else's behalf).

**Booking**: a genuine step wizard (`health-appointment-forms.tsx`) —
who → what → when → where → notes → reminder → save — not just field
ordering in one form. `createAppointment()` runs deterministic conflict
detection (time overlap against the member's other appointments and
`family_events`) and a likely-duplicate check (same member, same type,
within 3 days of an existing open appointment) on every booking, surfaced
as warnings, never blocking.

**Status lifecycle**: `proposed → confirmed/cancelled`, `confirmed →
completed/cancelled`. Rescheduling creates a *new* row and marks the old
one `rescheduled` rather than mutating its time in place, so the old row's
history (when it was proposed, confirmed, what reminders already went out)
survives. Completing or cancelling takes an appointment out of the open
statuses the reminder sweep filters on — that's the whole mechanism behind
"suppresses its remaining reminders."

**Reminders**: `health/reminders.ts`'s `dueRemindersFor()` is a pure,
day-granular function (advance ~3 days before, preparation the day before
when there's something to prepare, day-of). `runHealthReminderSweep()`
resolves a real recipient (the member themselves if they have an account,
otherwise their guardian), builds a `HouseholdEvent` and runs it through
the existing `decideNotification()`/`createNotification()` pipeline — real
quiet-hours-aware delivery, not a new notification mechanism. Folded into
the *existing* `/platform/retention` cron route rather than given its own
`vercel.json` entry: this project runs on Vercel's Hobby tier, which caps
cron jobs, and appointment reminders are day-granularity concepts anyway,
so the once-daily cadence already in use is the right one, not a
compromise made to fit.

**UI**: `healthAppointmentsAgenda()` maps appointments into the same
`HomeAssessment` shape every other domain already renders — real rows now
populate `/health`'s "Needs attention" (proposed) and "Coming up"
(confirmed) sections, with Confirm/Complete/Cancel icon-button actions per
row (rule 11: icons with `aria-label`, not full-width text buttons).

## Why

Booking, confirming and completing an appointment — with the household
warned about a clash or a possible duplicate, never silently — is the
first real health entity the domain needed, and the story deliberately
carries forward 21-001's privacy model rather than loosening it: a health
appointment is exactly the kind of thing ("Dad has a cardiology
appointment") the Product Council spec's own worked example says stays
private by default.

## Two scope decisions worth recording

`schedule_conflicts` and `family_events` (both from module 12) are
household-wide visible with no per-row privacy scope of their own —
correct for the kinds they already carried, wrong to inherit blindly for
health. So:

1. A detected conflict is only ever *persisted* to `schedule_conflicts`
   for a `household_operational`-scope appointment, using a label that
   names the person and says "appointment" — never the type, provider or
   notes. A private/selected_family appointment's conflicts are still
   detected (so the booker is warned) but returned only in the API
   response, never written anywhere household-wide.
2. "Calendar sync" only ever creates a real `family_events` row for a
   `household_operational`-scope appointment. A private/selected_family
   appointment can ask for sync, but nothing reaches the shared calendar
   until the household is who it's already visible to.

Both are recorded in the migration's own comment, not just here.

Travel-time consideration (one of the spec's "HomeBrain may…" list) is
deliberately not implemented — it needs a real maps/routing provider this
repo doesn't have credentials for, and CLAUDE.md forbids claiming a live
integration that isn't. Left as an explicit gap, not a fake one.

## What was verified

- `npm run verify` — typecheck, lint, the P0 security suite, 1514 unit
  tests (22 new), 330 database/RLS tests (9 new, in
  `scripts/test-health-appointments-rls.mjs`), production build, 304 e2e
  tests. All green. (One real bug the e2e suite caught early: the new
  routes weren't in the OpenAPI document yet — added and re-verified.)
- `scripts/test-health-appointments-rls.mjs` — 9 tests against real
  Postgres: a member can create/read their own private appointment; the
  admin cannot read, update or delete another adult's private appointment
  (not even via a WHERE-conditioned write); `household_operational` scope
  is visible household-wide but not cross-household; a guardian can
  confirm their child's appointment, a non-guardian adult cannot see or
  cancel it; `selected_family` visibility on an appointment requires the
  same consent grant `health_profiles` uses; the ordering constraint
  refuses an appointment ending before it starts; `schedule_conflicts` now
  genuinely accepts the `health_appointment` kind.
- Migration applied to the live Supabase project; `npm run verify:live` —
  95/95 checks, including a new one (anonymous cannot read a household's
  health appointments). `get_advisors` showed no new findings.
- Live browser verification (360px and desktop) against a QA household on
  a temporarily-granted `pro` plan: booked a real appointment through the
  full 6-step wizard, confirmed it (moved from "Needs attention" to
  "Coming up"), completed it (moved to "Recent") — each transition
  confirmed by reloading the page, not just from optimistic client state.
  QA household, its subscription override, and the QA auth user were all
  removed afterward.

## What's still open

- Stories 21-003 through 21-008 (health issues, checkups, records/HomeSend
  intake, HomeBrain/HomeTalk context, vitals, connected-health
  scaffolding) are `Not Started`.
- Travel-time consideration for a booked appointment — genuinely blocked
  on a real maps/routing provider, not implemented as a fixture either
  since there's nothing meaningful to fix a mock against yet.
- No attachments on an appointment — the spec lists them, but a real
  attachment wants somewhere real to point to; deferred to 21-005 (health
  records), which owns that concept, rather than building a
  half-connected upload here.
- Appointment reminders are day-granular by design (see above) — a finer
  cadence is a one-line `vercel.json` change once the deployment's plan
  tier allows more or more-frequent cron jobs, the same honest limitation
  `/platform/webhook-delivery` already documented.

## Where the code lives

- Migration: `supabase/migrations/20260922090000_health_appointments.sql`
- Domain logic: `packages/core/src/health/appointments.ts`,
  `packages/core/src/health/reminders.ts`,
  `packages/core/src/health/agenda.ts` (+ their `.test.ts` files)
- API routes:
  `apps/web/app/api/v1/households/[householdId]/health/appointments/`
- UI: `apps/web/app/_components/health-appointment-forms.tsx`,
  `apps/web/app/(auth)/health-appointment-actions.ts`, wired into
  `apps/web/app/health/page.tsx`
- Reminder sweep: folded into
  `apps/web/app/api/v1/platform/retention/route.ts`
- RLS tests: `scripts/test-health-appointments-rls.mjs`
- Backlog: `backlogs/21-Health-and-Fitness.md`
