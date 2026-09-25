# Today screen in each person's language (story 22-004, one screen)

## What was done

`/today` now reads its own wording from the catalog in all seven languages.
That is 33 new `today.*` keys and 22 new `eventForm.*` keys. It covers:

- the heading, the Calendar link, and the My day / Family / Household views;
- the loading label, the "routines stay silent" card and the closing line;
- each timeline row's own words: a meal's slot (reusing
  `reminder.meal.slot.*`) and who is cooking, "{name} due" and "Amount not
  in yet" for a bill, "School", "Today" in the time column, and the Reply,
  Fix, Pay and Review actions;
- the partial-data warning and all four empty states;
- the "Needs a person" and "Looking ahead" headings, and the domain links.

The "Add to the family calendar" sheet (`NewEventForm`) takes a `labels`
prop. `eventFormLabels(t)` in `_lib/event-form-labels.ts` builds it. Today
and Home both pass it, so "Plan something" opens the sheet in the person's
language from either screen. The Family screen still passes English and
moves with that screen.

`EVENT_KINDS` lives in `_lib/event-kinds.ts`, not in the sheet's module. A
`"use client"` module hands the server only components, so a plain array
exported from it arrives as a reference, and `.map` fails. This is the same
failure the snooze presets hit.

## Still English, deliberately

- A record's own words are not translated: a meal's name, a bill's name,
  and a school item's title and subject.
- The "Needs a person" rows and the "Looking ahead" predictions are built in
  English by the agenda and prediction logic. They move to messages the same
  way reminders did in 22-006, which is its own step.
- A school item's time words (`schoolTimeWords`) are also English.

## Verified

- Typecheck, lint, the boundary and secret lints, and the unit suite
  (2903/2903, including catalog completeness and placeholders) all pass.
- Browser QA on the real project as a Hindi-speaking member, at 360px and
  1280px, in all three views:
  - with nothing today, every empty state read in Hindi;
  - with a bill due today and a planned dinner seeded, the timeline read
    "रात का खाना — Rajma chawal · अभी किसी को नहीं सौंपा गया" and
    "BESCOM Electricity देय · ₹2,430.50" with "भुगतान करें";
  - the sheet opened fully in Hindi, with every kind in the picker;
  - there was no horizontal overflow at either width.

## Cleanup

These rows and accounts are removed once this PR merges:

- QA user `e876f5eb-bac1-46aa-8b8f-3f57e86648c3`;
- household `e85b1af7-da7c-439c-8e2e-a72369ffb589` ("Talk QA Home"), which
  the HomeTalk slice also used;
- the seeded bill `46217e4b-9a41-405d-b788-8c87fae630d4`;
- the seeded meal `70035af9-5275-4e02-85cc-c2d2a143ec37`.
