# Pickers above the keyboard, picked-item details, Bills' three counts, and integration-test fixes

**Date:** 2026-10-20 · **From:** the owner's screenshots (the ingredient list hidden by the keyboard; a picked item showing nothing about itself; Bills' three count rows) and the open cases from integration test run 1.

## What was built

- **Lists stay in view (10-010).** `packages/core/src/components/ui/keep-in-view.tsx` (`useKeepListInView`): on a phone the suggestion list sits in the flow under its field (`pointer-coarse:static`), so opening it gives the page room to scroll. When the list opens, and whenever its options or the keyboard change, the nearest scrolling area moves just enough in one frame, never past the field, and the list is capped to the space left. Used by `CatalogItemField` and `PlaceSearchField`. `Sheet`'s `revealField` skips a field whose list is open, which was the second, competing scroll.
- **A pick shows what it is (10-010).** `IngredientChoice` carries the pack, what is at home (only when counted) and energy and protein per 100 g or ml (`cardNutrition`, IFCT credited). The field shows the picture, and a line under the row shows the details. Words are in all eight languages (`mealForm.rows.*`).
- **Bills' three counts side by side (11-009).** `ExpandableMetricRow`, the owner's second written exception to rule 19, recorded in CLAUDE.md, DESIGN-NOTES and the component.
- **Integration-test fixes:**
  - IT-HH-02/03: the model is told the person owns the duty; a duty given to nobody is a question; the reply says "pet walking", not "pet.walking". Golden HT-128.
  - IT-OUT-01: "check on things" is read by the rules, so a model cannot turn it into a question (`RULES_SETTLE` in `hometalk-turn.ts`).
  - IT-FAM-11/12, IT-HH-09: making someone an Admin, adding a person or a helper, and how HomeTalk asks are said once with the screen where they are done (`DONE_ON_SCREEN`, `screens.ts`), never added to the groceries. Golden HT-126.
  - IT-CORE-25: "put it on the calendar" resolves "it" from the conversation or asks one question. Golden HT-127.
  - IT-CORE-26: "the same milk we bought last week" is milk.

## Verified

Core unit suite (3,790), typecheck for core and web, web lint, `npm run eval` (145/145), `check:bundle`. Browser: the meal sheet at 360×430 as a touch phone (the list ends at 422 px with the field on screen; after the pick, the picture and "Pack of 1 kg"), and Bills at 360px and 1280px (three tiles, no sideways scroll). QA data deleted.

## Still open

Catalog pictures did not load inside the sandbox (no network to storage), so the picture in the field was checked by its element, not by eye. 11 integration cases from run 1 are still open (see the document); then the remaining areas.
