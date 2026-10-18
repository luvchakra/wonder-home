# Plan a meal starts from the recipe (25-019)

**Date:** 2026-10-18 · **PR:** #238 · **Backlog:** `backlogs/25-HomeFood.md` (HomeFood)

## What the owner asked

"Bring the recipe at top, once recipe is selected, populate rest, give option
to edit and save, or will be applicable to this meal only. Give option to save
it as new recipe."

## What was done

- **Recipe first.** The Plan a meal sheet (`apps/web/app/_components/meal-forms.tsx`,
  `PlanMealButton`) opens on the recipe picker. Picking a recipe fills the
  meal's name (unless the person already typed one) and its essential
  ingredients with their amounts and units. `IngredientRows` gained an
  `initial` prop for this, and `RecipeChoice` now carries `ingredients`.
  The old "+ Add a new meal…" switch is gone: a one-off dish is just "None".
- **Where these ingredients apply.** A radio group below the rows:
  - *Just for this meal*: the meal needs exactly what was written
    (`setMealEssentials`). The recipe is not touched, and an item already on
    the list or substituted keeps that state.
  - *Save to {recipe} as well*: the recipe's essentials are replaced with the
    rows (`replaceRecipeEssentials`). Grocery links are kept by name, and
    nice-to-have items stay. Only offered when a recipe is picked.
  - *Save as a new recipe*: asks for its name, creates the recipe (20 min
    active, 40 total, serves 4, all editable later on Recipes) and plans
    this meal from it.
- **Order of writes.** `createMealAction` creates the meal first, so a slot
  that already has a meal fails before any recipe changes. The browser check
  found this: in the first version, a taken slot had still updated the
  recipe.
- **Words** in all eight languages (`mealForm.ingredientsFor`, `forThisMeal`,
  `forRecipeToo`, `forNewRecipe`, `newRecipeName`). The three unused keys
  (`addNewMeal`, `fillLater`, `backToPicking`) were removed. The help section
  Meals, groceries and running out of things gained paragraph 11 in all eight
  languages, plus search keywords.

## Verified

- typecheck, lint, core unit tests 3454/3454, web 9/9, help tests 68/68,
  `lint:help-links`, `npm run build -w apps/web`, `check:bundle`.
- Browser at 360px and 1280px against the live project, with a fresh QA
  account and household (Pro, so meals are on). Rajma chawal was seeded with
  500 g rajma, 2 onions and coriander as a nice-to-have.
  - **Picking the recipe** filled "Rajma chawal", Rajma 500 g and Onion 2 pieces.
  - **Just for this meal** with rajma changed to 300 g: the meal needs 300 g,
    and the recipe still says 500 g.
  - **Save to Rajma chawal as well** with 2 onions on a new slot: the recipe
    now says 2, coriander is still a nice-to-have, and the meal follows the
    recipe.
  - **One-off "Masoor dal" saved as a new recipe** with 250 g masoor: the
    recipe exists, and the meal is linked to it with that one essential.
  - **A taken slot** refuses with "That slot already has a meal planned."
  - No horizontal scroll at either width.

## Open

- 25-017 (catalog-picked recipe ingredients, with nutrients added up) and
  25-018 (suggest from what is at home) are next in the HomeFood queue.

## QA cleanup

Recorded after the merge.
