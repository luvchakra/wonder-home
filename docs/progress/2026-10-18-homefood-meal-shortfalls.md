# HomeFood: what a meal still needs (25-003a)

**Date:** 2026-10-18 · **Story:** 25-003, part a, done. Parts b and c are still to do.

## What was done

**The shortfall rule.** `packages/core/src/meals/shortfall.ts` works out, for each ingredient of a planned meal: what it needs at the servings planned, less what is at home, less what is already on the list. The gap is the only thing offered, so nothing is bought twice. The arithmetic goes through `commerce/units.ts` and never claims stock it does not know:
- **Measured.** The recipe's amount converts to the item's unit, and the gap is exact.
- **Estimate.** Nobody has said how much is at home. Only what is on the list is taken off, and the line says the amount is an estimate.
- **No amount.** The recipe names the ingredient but gives no amount, for example the "1 unit" a recipe saved with names only. If some is at home or on the list, it is covered. If none is, one usual step of the item is offered (one packet, one bunch), never a made-up quantity.
- **Left out.** What the household said it has, or swapped for something else.
- **Matching.** An ingredient matches a grocery item by its link, otherwise by one exact name or alias. When two items fit the name, it stays unmatched.

**Servings.** `meals.servings` is a new column: 1 to 50, null meaning as many as the recipe serves. Migration `20261018170000`, applied live. `setMealServings` changes it, and the amounts scale by planned servings over the recipe's own.

**The meal's Ingredients sheet** (`apps/web/app/meals/meal-ingredients-sheet.tsx`) replaces the old link to Groceries.
- It lists only the shortfalls, each with a tile, the name, what it needs and what is at home and on the list, and what to add.
- A servings picker re-works the amounts as it changes.
- One button, **Add n to the list**.

**The action** is `addMealShortfallsAction`.
- It re-reads the meal, the recipe and the groceries, and recomputes the shortfall on the server.
- It adds each gap through `adjustListEntry` with source `meal` and the meal's id.
- An ingredient nobody tracks becomes a new grocery item first.
- The meal's ingredients are marked "shopping".
- A second tap adds nothing, because the list now covers the gap.

**Words.** The sheet's words are in all eight languages, including Arabic's plural forms. There is a help paragraph in Meals and shopping, and a What's new entry, `mealShortfall`.

## Verified
- `meals/shortfall.test.ts`: 10 tests. Meals, commerce and i18n suites: 180 tests. Meals and grocery RLS: 21.
- Typecheck, lint, migration lint and help links pass. A local production build passed.
- Migration applied live. `verify:live` passes 264/264, with a new check for the servings column.
- **Browser check at 360px and desktop**, against the live project, with a QA household on Pro (meal planning is not on the Free plan):
  - The recipe serves 4. The household had 200 g of pasta and 0 bunches of basil, and did not track paneer.
  - At 4 servings the sheet offered 300 g of pasta, 1 bunch of basil and 200 g of paneer (estimate).
  - At 6 servings it offered 550 g, 1 bunch and 300 g.
  - **Add 3 items to the list** wrote exactly those three amounts, with source `meal`.
  - Servings were saved as 6, and the meal's ingredients were marked "shopping".
  - Reopening the sheet said nothing is left to add.
  - No sideways scroll.
- Cleanup: the QA household, through the service role, and the QA user were deleted. A count found 0 rows left.

## Still open
- **25-003b:** receipts add to stock and close list entries, plus duplicate receipts.
- **25-003c:** use-soon and depletion wording.
- Ingredients are still saved by name only when a recipe is created (`createRecipeImpl`). Amounts on recipe ingredients would make more lines measured. This is a candidate follow-up, not yet a story.
