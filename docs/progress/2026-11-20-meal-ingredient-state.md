# Meal ingredients tell one story (HomeFood 25-048)

The owner, 2026-11-20, on tomorrow's Idli: "contradicting messages, check and fix".

## What the screen said
- Card line: "2 ingredients to get"; strip under it: "Still to get: Batter, Idli, Sunflower oil" (three names?).
- Ingredients sheet: "Nothing to add. Everything this meal needs is at home or already on the list." and "Already covered: Batter, Idli, Sunflower oil".
- Agenda row above the plan (seen while verifying): "Needs Batter, Idli, Sunflower oil." · Shop.

## Causes
- **(a) 2 vs 3, and (c) "Idli" in Idli.** The catalog item is called "Batter, Idli" (`supabase/seed/grocery-catalog/items.csv`, slug `batter-idli`). That is real data, not a matching bug: 653 catalog names carry a comma ("Onion, white"). Every list joined names with ", ", so two ingredients read as three.
- **(b) "Still to get" vs "Nothing to add".** The card and the agenda (`assessMeal`) read each ingredient's *stored* status, which only becomes "shopping" when the Ingredients sheet adds it (`markNeedsOnList`). Both items had been put on To Buy another way, so they stayed "needed". The sheet read the stock and the To Buy list. It also merged "In Kitchen" and "on To Buy" into one "Already covered", and its "Everything this meal needs is at home or already on the list" overstated it. `assessMeal` also had a dead check: `shopping` could never be true.

## The fix
- `packages/core/src/meals/shortfall.ts` `mealIngredientState`: one reading per ingredient, **in_kitchen** (said to be had, or the stock alone covers it), **on_list** (still to buy, To Buy covers it), or **to_add**. `toBuy` (on_list plus to_add) is the card's number and exactly the strip's names. `ingredientNames` joins with " · ".
- The card (`apps/web/app/meals/page.tsx`): "2 to buy"; strip "To buy: Batter, Idli · Sunflower oil"; under it "All on the To Buy list." or "Not on the To Buy list yet: …" (attention tone only then).
- The sheet (`meal-ingredients-sheet.tsx`): "Nothing to add: everything still to buy is already on the To Buy list." (or "… everything this meal needs is In Kitchen."), then "Already on To Buy: …" and "In Kitchen: …".
- The agenda: `mealAgenda` reads open To Buy entries in the same wave as the meals (bounded, `.limit(500)`), and `assessMeal` doesn't call an ingredient on the list missing. Its reason names only what is not on the list: "… needs X, not on the To Buy list yet."
- HomeTalk's context line (`context/builders.ts`) now says "ingredients not yet marked in (the To Buy list may already have them)". It no longer claims "missing".
- Words are in all eight languages. Help "Meals and shopping" ¶7 is updated, and so is its `updated` date.

## Verified
- Unit tests: `meals/shortfall.test.ts` (the owner's Idli state, plus In Kitchen / on list / not counted, servings, names), `meals/meals.test.ts` (agenda with the To Buy list), `home/agenda-shared-rows.test.ts`, `context/`, `i18n/`. All pass. Typecheck passes for core and web. `npm run build -w apps/web` passes.
- Browser: a production build, run against a QA household on the live project with the owner's exact state: Idli tomorrow at 8:30, "Batter, Idli" and "Sunflower oil" on To Buy, stored status "needed".
  - At 360px the card read "Idli · Breakfast · 8:30 am · 2 to buy", "To buy: Batter, Idli · Sunflower oil" and "All on the To Buy list.".
  - The sheet read "Nothing to add: everything still to buy is already on the To Buy list." and "Already on To Buy: Batter, Idli · Sunflower oil".
  - The "Needs …" agenda row is gone.
  - No horizontal overflow at 360px; checked at 1280px too.
- Cleanup ran: the QA household (`b6a20979-…`) and its rows are deleted (count 0), the QA account `0c012aba-…` is deleted, and the temporary scripts and `.env.local` are removed.

## Open
- 25-049: HomeTalk's meal context and the agenda reason should read live To Buy state, and the agenda reasons and action labels should be localised.
