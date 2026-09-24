# Notifications screen in each person's language (story 22-004, one screen)

## What was done

`/notifications` now reads every word of its own wording from the catalog,
about 100 `notifications.*` keys in all seven languages (en, hi, mr, es, fr,
de, ar), with Arabic plural forms. Together with 22-006, which put the
reminders themselves into the reader's language, the whole screen follows the
viewer's language. That covers:

- the heading, the lede, the tabs and the category filter;
- the empty states, the confirmations after paying, finishing, dismissing or
  snoozing, and the closing line;
- each row's priority and "new" marker, the details behind its chevron
  (amount, due, repeats, the school items of a day, cooking time, pet care,
  where and when);
- why a reminder came when it did, the snooze choices, dismiss, and the
  HomeBrain daily summary.

How it is built:

- `ReminderRow` is a client component, so the server reads its words and
  passes them in as `ReminderRowLabels`. Nothing in the browser holds a
  catalog.
- `reminder-views.ts` takes the translator for details, links, reasons and
  how a reminder ended.
- The snooze choices moved to `_lib/snooze-presets.ts`, because a
  `"use client"` module cannot hand a plain value to server code.
- Item and pet-care nouns reuse the `reminder.*` keys from 22-006.
- The browser tab title stays English. Metadata can render before the session
  sets the viewer's language, the same as every other screen.

## Verified

- Typecheck, lint, boundaries and tracker check pass.
- Unit suite 2903/2903, including the i18n catalog completeness and placeholder
  tests.
- Browser QA on the real project as a Hindi-speaking member at 360px and
  1280px, with a bill row opened and the snooze panel open. Every label was in
  Hindi, names and amounts were as written, and there was no horizontal
  overflow. The tabs sit in the control's own horizontal scroller, as they do
  in English.

## Still open

22-004 stays In Progress. The other screens still read English literals and
move to the catalog the same way, one screen at a time.

## Cleanup

This slice and 22-006 used QA user `eb5ea655-e930-4855-bfc5-49aa632cbdaa` and
household `d8703d63-8feb-42e5-b1eb-c5bb2df4bcc2`, including two hand-inserted
bills. They are removed once this PR merges.
