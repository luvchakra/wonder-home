# Use soon and depletion wording (25-003c)

**Date:** 2026-10-20 · **From:** backlog 25 (`backlogs/25-HomeFood.md`), design `design/GROCERIES-PANTRY-HOMETALK-PHASE0.md` §3.6; the first Not Started row of `tracking/PRIORITY-ITEMS-REPORT.md` that waited on nobody.

## What was built

- **Rules.** `packages/core/src/commerce/use-soon.ts` (`useSoon`, pure; the page hands it the items, today on the household's clock and the timezone).
  - **Use first** lists an item with stock and a date someone knows: printed on the pack or entered by a person. Soonest first, each with its basis, and a state of passed, today, soon (within 3 days) or later.
  - A date that is only an estimate is never listed and never turned into a suggestion; the view says once that such items are left out.
  - A passed date says "check it before using", never that the item is fine.
  - **Running low** lists items at or below the level the household set (or with none left and a level set), none first, then the oldest count. Each says whether the amount was **counted** (stated, correction, undo) or **worked out** from what was bought and used, and an amount not confirmed for 30 days is said to be old.
  - An amount that was only worked out is never said as a count: "About 2 kg left · worked out…, not counted".
- **Screen.** The Use soon view of `/groceries` renders those entries in the existing row (tile, name, lines), with attention for a date today or soon and risk for one that has passed or for none left.
- **Words.** `grocery.useSoon.*` in all eight languages; the old `useBy` key is gone. Help "Meals, groceries and running out of things" ¶2 and its `updated` date.

## Verified

- Unit: `use-soon.test.ts` (9): known dates only, soonest first with basis; estimated dates counted but never listed; passed and today states; no stock or no date left out; counted versus worked out; old counts; ordering.
- Typecheck, i18n and help tests.
- Browser (see the gates run for this PR below).

## Still open

Nothing for this story. Next in the queue: 25-005 ("Make that 2 litres" corrects an amount).
