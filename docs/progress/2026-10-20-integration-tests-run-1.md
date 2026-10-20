# Integration test run 1: CORE, FAM, HH, OUT, and the child Home tabs

**Date:** 2026-10-20 · **From:** the owner's ask to run `docs/testing/HOMETALK-HOMEBRAIN-INTEGRATION-TEST-CASES.md` one by one and fix what fails, and a screenshot of the child view's tabs not changing.

## What was done

- **The child Home tabs.** `apps/web/app/page.tsx` never passed `?tab=` to `ChildHome`, so Homework, Goals and Fun always showed Today. Browser-checked at 360px with a QA child account: each tab now shows its own section and is the active one.
- **A harness** (`scripts/itc/run.mts`) that drives each conversation through the golden runner, split as the route splits it, and through the model the way the route uses it (rules first for a plain question).
- **Fixes found by the run:**
  - IT-CORE-08: "add what it needs to the list" / "get the ingredients" is read as the meal just discussed (`rules.ts`), and a meal with no needs of its own falls back to the recipe it is named after (`grounding.ts`, `meals/repository.ts` `ingredientNames`). Golden HT-125.
  - IT-FAM-04/08: each person's context item now says what the family calls them and their birthday and age, worked out from the date of birth on the household's day (`context/builders.ts` `personalDetail`); "birthday", "born", "age" and "nickname" focus a question on the people. Golden HT-124.
  - IT-CORE-25 (rules path): "put it on the calendar" is no longer read as assigning a duty to "it".
- **Results** are recorded per case in the document, with a run log row. Two expectations were corrected: a list add is a draft anyone may make, so a child's add is not held by autonomy.

## Verified

The core unit suite (3,790), typecheck for core and web, `npm run eval` (142/142 golden cases), and the child-tab browser check. QA data deleted and confirmed.

## Still open (from this run)

20 cases are open in the document: the model path losing the person in "make Upasana responsible for groceries" (HH-02/03), "check on things" read as a question (OUT-01), "add a new family member" adding to the groceries (FAM-12), redirections for admin and settings requests (FAM-11, HH-09), ages not used in answers (FAM-05), irrelevant facts for an unknown topic (HH-07), false "no records" claims (OUT-02/04), "what did I just ask you to do?" (CORE-28), and the rest listed per case. Next: fix those, then run the remaining areas.
