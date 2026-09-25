# Family screen in each person's language, and two calendar bugs fixed

## What was done

**Family in every language (story 22-004, one screen).** `/family` now reads
its own wording from the catalog in all seven languages. That is 65 new
`family.*` keys, and the plural "{count} years old" uses Arabic's own forms.
It covers:

- the header, members, pets, household help, family moments and "Needs a
  reply";
- upcoming events with the "Protected" badge (`CalendarItem` gained a
  `protectedLabel` prop), and every empty state;
- each person's and each pet's details: role, age, date of birth, "Family
  calls me" and the rest.

How it works:

- `MemberDetail`, `PetDetail` and `describeRoles` render on the server, so
  they read `requestT()` directly. That means role names are translated
  everywhere they appear, on Home and Manage household too.
- The "Needs a reply" pills (Replied, Gift sorted, Sorted, Fine as is…) take
  their words as `labels` from the page.

**Bug: two event kinds the server refused.** The "Add to the family
calendar" sheet on Today and Home offered "Visit" and "Something else".
The server only accepts the family domain's `EVENT_KINDS`, so choosing
either failed on save. The sheet's list is now that same list, re-exported
from `_lib/event-kinds.ts`. That adds Gathering and School event, and it
matches what Family already offered.

**Bug: event and health times stored in the server's zone.** A
`datetime-local` value such as "2026-10-04T17:00" has no zone. The actions
read it with `new Date()`, which uses the server's zone, and the server runs
on UTC. So a 5 pm event in an Indian household was stored as 5 pm UTC, 5½
hours late. That happened in four places:

- family events;
- health appointments (create and reschedule);
- vitals;
- fitness sessions.

A new helper, `householdInstant(value, timeZone)` in
`packages/core/src/school/times.ts`, reads the value as the household's wall
clock. It uses the existing DST-safe `localInstant`. A value that already
carries an offset is read as the instant it names. All four actions now use
it.

**Also.** The sheet now closes after a successful save. Before, it stayed
open with the event already saved behind it.

## Verified

- Typecheck, lint, the boundary lint and unit tests (2907/2907) pass. That
  includes four new `householdInstant` tests: Kolkata, London across daylight
  saving, explicit offsets, and refused input.
- Browser QA on the real project as a Hindi-speaking Admin, at 360px and
  1280px, with a seeded household (a spouse invited, a child, a helper, a
  dog, a protected family lunch, a birthday):
  - every label on the screen read in Hindi;
  - the member and pet details opened with Hindi field names and
    "{n} साल";
  - the sheet's kind list matched the server's list;
  - a "Gathering" at 17:00 was saved as 11:30 UTC (17:00 in Kolkata), the
    sheet closed, and the event appeared in the list;
  - there was no horizontal overflow at either width.

## Still open

- Events and health times created before this fix are stored late by the
  household's UTC offset. They cannot be told apart from correct ones by
  data alone, so nothing was changed. A household that notices one can
  edit it.
- Still English on Family, deliberately: the core-built "Needs a reply"
  reasons, the calendar connection message, and the sibling-order line.
  The member, pet and profile edit forms move with a later slice.
- 22-004 stays In Progress for the domain screens.

## Cleanup

These are removed once this PR merges:

- QA user `cc3936ef-b1b6-443c-9de5-a78ddd9089ba`;
- household `61d8bf51-40ec-4d5e-9871-442e762ab44e` ("Family QA Home"),
  including its seeded members, pet, events and Pro subscription row.
