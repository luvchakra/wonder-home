# HomePlaces: school hours, office hours, and the place book

## What was done
This closes the open items in [the HomePlaces note](2026-10-17-homeplaces.md). The owner also asked for office start and end times.

- **Where the hours are kept.** Migration `20261018090000_school_and_work_hours.sql`, applied live:
  - A child's school day is on their enrolment (`school_enrolments.starts_at/ends_at`). A school day never runs past midnight.
  - An adult's working day is on the member (`household_members.work_starts_at/work_ends_at`). It may wrap past midnight, for a night shift. Only an adult keeps one.
  - Both columns come as a pair. The existing member and enrolment policies still decide who writes them.
- **How hours are read.** `household/day-hours.ts` handles reading, checking and saying the hours. Two blanks clear them. One blank is refused with a plain reason, never half kept.
- **HomeTalk.**
  - **After school.** "After school" starts when that school's day ends. When the anchor is home, it starts at the latest end among the children.
  - **After work.** "After work" is new ("after work", "when I finish work", "after office"). It starts when the speaker's own working day ends.
  - **Nothing recorded.** The reply still says it assumed 3:30 pm or 6 pm, and now says where to set the real time.
- **HomeBrain.** It is told a person's working day and a school's day as facts (`context/builders.ts`).
- **Where hours are set.**
  - **Settings.** A person sets their own work arrangement and working hours in their details (the one editor for their own profile).
  - **Family.** An Admin sets them for another adult, and a child's school hours on the child's details, when a school is on record. Family shows "Office hours" and "School hours".
  - **Setup.** The adults and children steps ask for both, optionally.
- **The place book screen.** `/places` is listed under More, in Home & Lifestyle.
  - It lists saved places and the ones marked "Not for us".
  - Every member reads it. An adult can keep a note on a saved place, remove it, or let a turned-down place be suggested again (`app/places/actions.ts`, through the existing repository; RLS decides).
  - Actions are icons with labels, and long names wrap.
- **A fix found on the way.** The member details sheet used to reset every field when a save was refused. It now submits by hand, so what was typed stays, and the reason is also shown beside the Save button.
- **Help and translations.** HomeTalk help paragraph 9 is in all eight languages. New labels are in all eight catalogs.

## Verified
- Unit tests: day-hours 5, HomePlaces (after work and a known school end), context golden (working day, school day). Full run: 220 files, 3161 tests.
- tsc for core and web; ESLint on the changed web files.
- Gates: boundaries, secrets, help links, migrations, security (12/12) and eval (all pass but operations, which was already "not yet").
- Build and check:bundle.
- DB test `scripts/test-day-hours-rls.mjs`, 6/6: a night shift; half a pair and a same-time pair refused; no office hours for a child; a non-Admin cannot set someone else's; a guardian sets the school day, which never ends before it starts; a non-guardian cannot.
- Live migration applied; `npm run verify:live` 251/251.
- Browser check at 360px and 1280px with a QA household:
  - office hours saved from Settings;
  - school hours on the child from Family, after a refused half pair that kept its value;
  - both shown on Family;
  - Places: a note saved, a turned-down place brought back;
  - the setup steps show the saved times;
  - no horizontal scroll anywhere.

## Open
- **Near work.** Asking for places near the office needs the office's location, which is only free text today. Places are found near home or a school.
- **Adding from Places.** Places are added only from HomeTalk's answers. The screen does not search for places on its own.
