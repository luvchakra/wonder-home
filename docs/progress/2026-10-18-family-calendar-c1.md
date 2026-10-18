# Family Calendar C1: the foundation (story 12-009)

## What was done

The owner approved Phase 0's decisions D1–D7 as recommended (2026-10-18). The six phases are stories 12-009 (C1) to 12-014 (C6) in `backlogs/12-Family-Time-and-Social.md`, and `design/FAMILY-CALENDAR-PHASE0.md` is marked approved.

C1 builds the calendar as a **projection**, never a copy:

- **Schema** (`supabase/migrations/20261018120000_family_calendar.sql`):
  - `family_events` gains `all_day`, `timezone`, `category`, `visibility` and `recurrence`.
  - `visibility` is `household`, `participants` or `private`. It is enforced in RLS, and an Admin does not bypass `private` (D5). Only the owner narrows an event.
  - `wh.may_see_event` is the one rule that participants, invite links, guests and exceptions reuse. Participants also get a restrictive policy, because their write policies are FOR ALL and would otherwise let an Admin read who is invited to an event they cannot see.
  - `event_exceptions` holds a skipped or changed occurrence.
  - `public_holidays` is sourced and read-only (D3). It is seeded from the Government of India DoP&T lists for 2026 (O.M. of 03.07.2025, with Bakrid moved to 28 May by the O.M. of 22.05.2026) and 2027 (O.M. of 16.07.2026). The 14 holidays compulsory for every central office are `IN`. The three Delhi chose (Holi, Ram Navami, Janmashtami) are `IN-DL`. Other states choose their own three, which this list does not guess.
  - `calendar_preferences` holds each member's own view, filters and holiday region.
  - `family.events` is on every plan (D2).
- **Core** (`packages/core/src/calendar/`):
  - `dates.ts`: local-date arithmetic and views.
  - `recurrence.ts`: the repeat subset, mirroring `wh.valid_recurrence`. Wall-clock time holds across DST. A month without the day is skipped, and 29 February is kept for leap years, never moved. `until`/`count` work, exceptions apply, and expansion is bounded per range.
  - `projection.ts`: the `CalendarEntry` contract, the event, occasion and holiday adapters, dedupe, grouping by day, title-free density for the Year view, and clashes.
  - `preferences.ts`: filters, with meals and responsibilities hidden by default (D6).
  - `layout.ts`: the day grid's side-by-side placement.
  - `repository.ts`: `calendarRange` reads through the member's own session and reports a failed source by name.
  - Occasions are projected from members' own dates on the household's clock. The old sync trigger's rows are ignored by the calendar but kept for `/family`.
- **Screens:**
  - **Tab (D1):** the Today tab is now **Calendar** (`/calendar`). `/today` stays, under the same tab, as "Today's plan", one tap from today's day view. Meals, bills and school reach the calendar in C2, and then `/today` folds into the Day view.
  - **Views:** Month is the default, with dots on a phone and titles from `sm`, plus the day's agenda (a side panel at `xl`). Week stacks below `lg` and is a 7-column time grid above it. Day has a week strip, an all-day lane and a time grid. Year has 12 mini-months tinted by count.
  - **Gestures (D7):** pinch moves Year ↔ Month ↔ Week ↔ Day. Swipe and the arrow keys move the period on the grid, which opts out of the primary swipe (`data-swipe="own"`, a new opt-out in `use-primary-swipe-nav.ts`).
  - **Filters:** a per-member sheet.
  - **One add form** (`NewEventForm`, also used on Family, Home and Today): all day, who's going, category, and More options (repeat, who can see it, notes). Before writing, it checks clashes and says them in words; anyone busy in something the viewer cannot see is shown only as busy. "Add anyway" adds it regardless.
  - **Event page:** shows and edits the same fields. Who can see it is offered to the owner only. Skip or restore one occurrence, and back to the calendar day it was opened from.
- **Kit:** `calendar-entry.tsx` (`CATEGORY_LOOK`, `CalendarEntryRow`), `calendar-month.tsx`, `calendar-day.tsx` and `calendar-year.tsx`, noted in `design/DESIGN-NOTES.md`.
- **Words:** the `calendar` area in eight languages. Help has a new "Calendar" section and a "Can others see my private events?" FAQ, and "Home and Today" is reworded for the tab rename, all in eight languages.
- **CLAUDE.md:** rules 6 and 16 name the five areas as Home, Calendar, HomeTalk/AI, Family, More.

## Verified

- **DB tests:** `test:db`, all 598 tests across every `scripts/test-*-rls.mjs`, including the new `test-calendar-rls.mjs` (11). It covers private, participants and household visibility, an Admin not bypassing private, linked tables only as visible as the event, owner-only narrowing, repeat-rule validation, exceptions, read-only holidays, own-only preferences and family events on every plan.
- **Core unit tests:** 223 files / 3193 tests. That includes the new calendar tests: recurrence 10, projection 19, layout 4.
- **Web unit tests:** `calendar-view.test.ts` 6.
- **Static checks:** `tsc` in core and web, ESLint on the changed web files, and `lint:boundaries`, `lint:secrets`, `lint:help-links`, `lint:migrations`, `lint:embeds`, `security`, `eval` and `tracker --check`.
- **Build:** `npm run build -w apps/web` and `check:bundle`.
- **E2E:** `e2e/shell.spec.ts` 12/12, with `/calendar` gated for an anonymous visitor.
- The security suite caught an interpolated PostgREST `.or()` in the holiday read, now two plain filters.
- `brand -- --check` fails in this container on a clean `main` too, so it is an environment matter, not this change. CI runs it on its own runner.

## Still open

- **The migration is not on the live project.** `apply_migration` from this session timed out (as did the earlier QA delete), and the live project is still at `20261017233807`. **This PR must not merge before the migration is live**: `createEvent` now writes the new columns, so adding any event would fail in production without it. The owner applies `supabase/migrations/20261018120000_family_calendar.sql` in the Supabase SQL editor, then `npm run verify:live`, which now checks the three new tables and four new columns.
- **Signed-in browser QA at 360px and 1280px has not been run.** It needs the live migration, plus credentials in `apps/web/.env.local`, which this container does not have.
- **Not in C1, by design:**
  - Module adapters, "Busy" for health and dedupe across sources (C2).
  - HomeTalk planning with the calendar (C3).
  - Reminders to participants and the holiday region in Settings (C4).
  - "This and following" edits, and moving a single occurrence (C1 skips and restores one).
  - `wh.busy_windows` does not expand repeating events, so clash checks against another member's *hidden* repeating event miss later occurrences. Visible ones are checked through the projection.
- **Not for this story:** the live project carries a `wonderapps_dashboard_read` policy on 32 tables, for a `wonderapps_dashboard` role, that is not in any migration. It reads `household_ai_credentials` among others. Someone should confirm it is intended.
- **Cleanup:** this session created no QA accounts or households. The two leftover QA households from 2026-10-18 (`b942c154-…`, `7ab6da76-…`) are the owner's to delete with the SQL in the handoff.

## Where the code lives

`supabase/migrations/20261018120000_family_calendar.sql`, `scripts/test-calendar-rls.mjs`, `packages/core/src/calendar/`, `packages/core/src/components/ui/calendar-*.tsx`, `apps/web/app/calendar/`, `apps/web/app/_lib/calendar-view.ts`, `apps/web/app/_lib/event-window.ts`, `apps/web/app/(auth)/calendar-actions.ts`, `apps/web/app/_components/new-event-form.tsx`, `apps/web/app/_components/event-controls.tsx`, `apps/web/app/family/events/[eventId]/page.tsx`.
