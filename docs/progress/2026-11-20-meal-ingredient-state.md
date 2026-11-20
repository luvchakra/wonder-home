# Meal ingredients tell one story (25-048); recipe cards get a cross and a picture (25-050)

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

## Part 2 and 3 (same PR, 25-050): a cross on each recipe card, a recipe's own picture
The owner, 2026-11-20: "add option to remove each item with a cross icon at bottom left of each card" and "add option to add a picture".
- **Cross** (`RemoveRecipeButton`, `apps/web/app/_components/meal-forms.tsx`): bottom left of each card in Your recipes, 44px, named "Remove {name}". It asks once with what removing affects. Then it retires the recipe through the existing `retireRecipeAction`, which is soft (`active = false`) and open to any member, the same as editing (`recipes_write_member`):
  - Meals already planned keep it.
  - The week template drops it (it already skips retired recipes).
  - Its own picture is deleted from Storage.
  - WonderHome's ideas can't be removed. Removing a saved copy leaves the idea.
  - The edit sheet's Remove stays. It is a different surface, so rule 14 still holds.
  - "Liked by …" moved to its own line above the thumbs. On the idea cards it had been squeezed to 41px.
- **Picture** (`PhotoPickField` with `wide`, on Add a recipe and the pencil; `keepRecipePicture` in `(auth)/meal-actions.ts`):
  - Reuses `_lib/photos.ts`: bytes are sniffed (JPEG/PNG/WebP only), with a 5 MB cap and plain-sentence refusals.
  - Files are stored in the private `avatars` bucket at `<household>/recipes/<id>` and read through signed URLs.
  - The browser shrinks the photo to 1280px first, because a request may carry 4.5 MB.
  - It shows on the card, on the recipe page and on meals planned with it, ahead of the catalog dish's picture.
  - A bad file is refused before anything is saved.
- **Migration `20261121000000_recipe_pictures.sql`**: adds `recipes.image_path` and member-write Storage policies for `<household>/recipes/`, in set form. It is safe in either order:
  - Before it runs, `readRecipeRows` retries without the column.
  - `setRecipeImage` returns false, the upload is removed, and the recipe saves with "The picture couldn't be kept just now…".
  - The owner runs the SQL by hand. No Supabase tool calls were made from this session.
- **Verified:**
  - Unit tests: `meals/recipe-remove.test.ts` covers retire permission, another household, a 42501 refusal, picture path and missing-column. `_lib/photos.test.ts` covers bytes over claims, the 5 MB cap and removal.
  - Help ¶15 updated in eight languages, along with its keywords.
  - Build and `check:bundle` pass.
  - Live QA household, before the migration:
    - At 360px the crosses sit at x=29/199, the confirm text is right, and "Your recipes 3" and "Recipes 3" update after a removal.
    - The edit sheet shows "Add a picture", then a 320×96 preview with Change and Remove after choosing one.
    - Saving keeps the recipe with the notice, and Storage is empty.
    - At 1280px nothing overflows.
  - Cleanup ran: household `fc44b348-…` and account `fbf9dfb4-…` are deleted (counts 0, no files).
- **Open:** the upload path with the migration applied hasn't been seen live yet. Check it once the SQL is run. The share card (`/meals/recipe-card/[id]`) still uses only the catalog picture.
