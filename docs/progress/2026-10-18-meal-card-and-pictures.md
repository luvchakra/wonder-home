# A meal card that does what it says (10-009), and pictures for everyday catalog items (25-010)

**Date:** 2026-10-18 · **Stories:** 10-009 (Done), the pictures half of 25-010

## What the owner reported

- **Change meal** went to HomeTalk. It should change the meal on the same page.
- **Ingredients** said the meal had no recipe and asked for one, but the page offered no way to add one.

The screenshot also showed a dinner "Ready by 1:30 am".

## What was built

- **Change meal, in place.** A sheet on the card holds the same fields as planning a meal: name, recipe, slot, day, ready-by time and cook.
  - It is backed by `updateMeal`. A new recipe brings its ingredients and replaces only the needs still waiting; anything already on the shopping list stays.
  - **Remove from the plan** sits at the bottom (`removeMeal`). It removes a meal still to come and leaves list entries in place.
  - Before this, a meal could not be changed or removed at all (rule 12), and the HomeTalk link was a second door to the assistant (rule 13).
- **Ingredients without a recipe.** The empty sheet now offers two ways forward:
  - write what the meal needs, one line each, read the way HomeTalk reads an amount ("500 g rajma", "2 onions"); a line with no amount is "not measured", never "1 pc" (`addMealIngredients`);
  - or pick one of the household's recipes.

  The separate "Attach a recipe" pill is gone, since the recipe is now part of Change meal and of this sheet (rule 14).
- **Honest wording.** The card said "Missing: … — on the shopping list" for things nobody had added.
  - It now says "Still to get: …" for those.
  - It keeps "on the shopping list" only for what is actually on the list.
- **Meal times on the household's clock.** A meal planned on the Meals screen was timed on the server's clock, so an 8 pm dinner in India was saved as 1:30 am. Times now go through `atLocal` with the household's timezone. HomeTalk's own planning already did this.
- **Pictures for everyday catalog items.**
  - 341 of the 411 everyday items now have a picture from Wikimedia Commons, under CC0, PD, CC BY or CC BY-SA. The list is `supabase/seed/grocery-catalog/pictures.csv`.
  - `npm run catalog:pictures -- --apply` copied all 341 into the `grocery-catalog` bucket and credited them.
  - Each picture is a 330px thumbnail, the size Commons serves.
  - The 70 items without one are mostly ones Commons only shows as branded packs (masala blends, cleaning products, toiletries).

## Verified

- **Unit tests and gates.** Meals, commerce, i18n and help tests pass (290). Typecheck, lint, import boundaries, help links and the tracker check pass. `npm run eval` passes 117/117 with 0/17 unsafe actions.
- **Browser, 360px.** Checked with a QA household against the live project:
  - a dinner planned for 8:00 pm reads 8:00 pm;
  - Ingredients took "500 g rajma / 2 onions / rice" and listed the shortfalls;
  - Change meal saved "Rajma Rice" at 8:30 pm and closed;
  - there was no horizontal scroll and no page errors.
- **Browser, 1280px.** Remove from the plan took the meal off.
- **Pictures.** Add item → "brinjal" shows its picture with the Commons credit line. "milk" shows four pictures plus product photos.

## Where the code lives

- `packages/core/src/meals/repository.ts` (`updateMeal`, `removeMeal`, `addMealIngredients`)
- `apps/web/app/(auth)/meal-actions.ts` (`updateMealAction`, `removeMealAction`, `addMealIngredientsAction`, `readyByOn`)
- `apps/web/app/_components/meal-forms.tsx` (`ChangeMealButton`)
- `apps/web/app/meals/meal-ingredients-sheet.tsx` (`NoIngredientsYet`)
- `apps/web/app/meals/page.tsx`
- Pictures: `supabase/seed/grocery-catalog/pictures.csv` and `scripts/catalog-pictures.ts`
- Help: Meals, groceries and running out of things, paragraph 10, in all eight languages.

## QA cleanup

Done after #230 merged, on 2026-10-18. These PRs (#226 to #230) all used one QA account, `52b0dda2-aaaa-48eb-a863-298bbd8fd1ea`, and its household "Cards QA Home" (`0a6a54d8-3e1c-4ddd-8fe3-a77ce65923fb`). The household's only member was that account, so it was deleted with everything in it: the seeded pasta items and the unit-change record, the QA birthday party and its two guests, the conversation, the Pro subscription, the address and the stored context row. Then the account was deleted. A count of all 132 household tables found no rows left, the account lookup found nothing, and no stored files were under the household. The local credentials, saved session, screenshots and QA scripts are gone, and no dev server is running.
