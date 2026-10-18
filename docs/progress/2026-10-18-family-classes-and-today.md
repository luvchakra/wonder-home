# A child's classes in Family; an honest empty today (08-013, 26-008)

**Date:** 2026-10-18 · **PR:** #235

## What and why

- **Classes in Family (08-013).** The owner asked to add and update a child's extracurricular classes (karate, piano, vocals) from their details in Family. Each class is folded with its days and timings and opens onto its full details.
  - The class list moved into one component, `apps/web/app/_components/child-classes.tsx`. Kids & School and the child's opened details in Family both use it, through the same saves.
  - It is rendered outside the "Edit details" form, because each class's sheet carries its own form.
- **An honest empty today (26-008).** The Calendar's day view said "Nothing planned — A free day" right above Today's plan of meals, bills and school.
  - Today with no events is now one card: "Nothing on the calendar today." with the Today's plan link inside it.
  - Any other empty day reads "No events — Nothing is on the calendar for this day."
  - The new wording is in all eight languages.
- **Help.** "School and children's work" ¶6 now says the same classes appear in Family. It is updated in eight languages.

## Verified

- Typecheck, lint, the unit tests and help links pass.
- In the browser at 360px on the live project, with the QA household:
  - Piano was folded in Family exactly as on Kids & School;
  - Piano was changed from Family (Sunday dropped) and read back;
  - today, with nothing booked, showed the one card.

## QA cleanup

Checked on 2026-10-18 after the later merges (through #237): no `wonderhome-qa-verify.internal` account remains on the live project and no QA household this work created is left; the count was taken with `select … from auth.users where email like '%wonderhome-qa-verify.internal'`. Two older QA households from 2026-10-17 (`QA Welcome Home` b942c154…, `QA Hours Home` 7ab6da76…) could not be proven to be this work's and were left in place.
