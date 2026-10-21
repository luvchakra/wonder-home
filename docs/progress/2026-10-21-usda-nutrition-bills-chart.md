# USDA nutrition for dairy and sugar; Bills chart from entered months, Budget tab

*2026-10-21. Stories 25-031 (HomeFood) and 11-014 (Bills & Finance).*

## USDA nutrition (25-031)
**Why.** The owner: "yes use USDA for dairy and sugar nutrients". IFCT 2017 has no curd, butter, cream, sugar, coconut milk or most whole spices. Because of that, 17 catalog dishes showed no nutrients.

**What changed.**
- **The data.**
  - USDA FoodData Central SR Legacy (public domain) is now the second source, after IFCT.
  - `scripts/catalog-usda.ts` (`npm run catalog:usda`, `-- --apply`) reads USDA's own pinned and checksummed SR Legacy CSV release.
  - The pure mapping is `packages/core/src/commerce/usda.ts`, with its test.
  - The curated links are in `supabase/seed/grocery-catalog/usda-links.csv`: 53 items, 22 exact, 29 close and 2 approximate, each non-exact one with a note.
- **The database.** Migration `20261021010000_usda_catalog_nutrition.sql`:
  - It adds `grocery_catalog.usda_fdc_id`, `usda_match` and `usda_note`. As with IFCT, the link sits on the catalog side, because one USDA food is often several items.
  - A member can read a USDA food only once an item links to it. Unlinked rows stay server-only; `scripts/test-grocery-catalog-rls.mjs` asserts both cases.
- **The rule.** `referenceNutrition` in `commerce/catalog.ts` is the one rule: IFCT first, then USDA, then the label. The item page, grocery cards, the ingredient picker and recipe nutrients all use it.
- **The credit.** USDA is credited wherever its figures show, in all eight languages. The help guide is updated.

**Live.**
- The migration is applied, and `npm run verify:live` passes 325/325, including a new USDA check.
- The loader wrote 38 USDA foods and 53 links.
- The recipe catalog was re-seeded: 56 of 60 dishes now carry nutrients, up from 43. Idli, masala dosa, uttapam and pav bhaji still have none, because no reference food fits a shop batter or pav.
- A member-session read confirmed that the embed resolves under RLS.
- Browser check at 360px: curd shows "61 kcal · 3.5 g protein per 100 g", the close-match line and the USDA credit.

## Bills (11-014)
**Why.** The owner's piped gas had amounts for July to September entered under Month by month, but the chart stayed on Electricity alone. Monthly spend read only paid months (`obligation_history`). Entered amounts (`obligation_periods`) and an open bill's own amount never counted.

**What changed.**
- **The chart.** `packages/core/src/finance/billed-months.ts`, with its test, gives each bill one figure a month, up to this month and never counted twice. The order is:
  1. what was paid;
  2. else the amount given for that month;
  3. else the open bill's own amount, for the month it is due.
- **Add a bill** moved from the page header to the Upcoming bills line. It shows there only when there are bills; the empty state keeps its own button.
- **Budget tab.** Budgets moved from Overview to a new Budget tab, after Transactions. The help now names "Bills → Budget" in all eight languages.

**Verified.**
- On a QA household seeded like the owner's at 360px, piped gas charts July to October and nothing scrolls sideways.
- The Budget tab lists the budget, with Set a budget.

## Gates
- typecheck passes.
- Unit tests: 377, across commerce, meals, i18n and help, plus 74 in finance.
- DB test `test-grocery-catalog-rls` passes 7/7.
- These lints pass: embeds, migrations, help links, secrets.
- Production build passes.

## Open
- The owner's chicken biryani photo needs a licence before it is added (task 99).
- QA cleanup after the merge: household `fcef7692` and user `f252387a`.
