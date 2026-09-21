# Meals & Cooking: recipe picker, nutrients, Suggest, and manual preferences

## What happened

The remaining seven items of the 13-item batch, all on `/meals`:

1. Plan a meal should pick from available/new meals (a recipe picker).
2. Show a rough nutrient summary per meal.
3. A Suggest button that checks raw materials and preferences, adds with
   one click, and flags anything running low immediately.
4. Add a recipe option on each meal.
5. Switching to Recipes should show "Add recipe," not "Add meal."
6. Recipes tab gets its own add flow, feeding straight into Plan a meal.
7. Preferences gets manual entry (member, timing, recipe/dish prefs).

Research before implementation found most of the domain logic already
existed, unused: `createMeal`/`attachIngredients` already accepted a
`recipeId` (only the manual "Plan a meal" form never offered one),
`choosePlan`/`PlanCandidate` (module 10's decision engine) was fully
implemented and unit-tested but uncalled by any route, and
`suggestPurchase` (module 09's low-stock signal) was similarly idle
outside Groceries. The batch was mostly wiring a UI onto backend that
already worked, plus two genuinely new pieces: recipe/preference
creation, and rough nutrients (which needed a schema change — no
nutrition database exists to compute them from ingredients, so they are
whatever the household records, never invented).

## What shipped

- **Recipe picker on Plan a meal.** `PlanMealButton` gained an optional
  "From a recipe" select; picking one links `recipeId` and copies the
  recipe's ingredients onto the meal via the existing `attachIngredients`
  — exactly the path the API route already used for provider-driven
  planning, now available by hand too.
- **Rough nutrients.** `supabase/migrations/20260921160000_recipe_nutrients.sql`
  adds four nullable columns to `recipes` (`calories_per_serving`,
  `protein_grams`, `carbs_grams`, `fat_grams`) — optional fields on the
  add-recipe form, shown on recipe cards and meal cards only when
  recorded, never computed.
- **Suggest.** New `suggestMeal` (`meals/repository.ts`) builds
  `PlanCandidate`s from every recipe's ingredients against the
  household's tracked consumables and preferences, and calls the
  existing `choosePlan`. Essential ingredients matching a consumable
  `suggestPurchase` flags as low get surfaced immediately as "Running
  low." A "Suggest" button on the Plan tab shows the result with a
  one-click "Add to the plan." "Previous meals" (repeat-avoidance) is
  explicitly not modeled — there is no record of how often a recipe has
  been cooked, and inventing one would be exactly the unsourced figure
  design principle 9 forbids.
- **Add a recipe to an existing meal.** New `attachRecipeToMeal`
  (update + `attachIngredients`) and an `AttachRecipeControl` shown on
  any meal card without a recipe yet; a meal that already has one shows
  "View recipe" instead — never both.
- **Recipes tab: "Add recipe."** The header button now swaps by tab —
  `AddRecipeButton` on Recipes, `AddPreferenceButton` on Preferences,
  `Suggest` + `PlanMealButton` on Plan — instead of "Plan a meal"
  showing everywhere regardless of tab.
- **Add a recipe (Recipes tab).** New `createRecipe`, taking name,
  cuisine, timing, serves, nutrients and two ingredient lists
  (essential / nice-to-have, one name per line — quantities default to
  1 unit and can be refined later). Once added it's immediately
  selectable from Plan a meal's recipe picker.
- **Manual preferences.** New `createFoodPreference` and an
  `AddPreferenceButton`: who it's about (whole household, self, or —
  for an admin — anyone, mirroring `food_preferences_write_own`'s RLS
  exactly), a kind, and a subject. One shape covers all three of the
  user's named cases — a member's own dislike, a timing preference
  ("Dinner at 8pm"), a recipe/dish preference — since the table never
  distinguished them structurally, only by the free-text subject.
  Adding this manual path is also why the pre-existing "Tell WonderHome"
  AI-chat link on the empty state was **removed**, not kept alongside
  it — CLAUDE.md rule 14 is explicit that once a manual path exists for
  the same job, the AI-routed one is the one that goes.

## Two real bugs this surfaced

Wiring UI onto previously-dead code paths found two genuine defects,
neither introduced by this change but both invisible until something
finally exercised them:

1. **`obligation_history`/`spend_anomalies` were missing their admin
   write RLS policy** (covered in the Bills & Finance note the same
   day) — `recordAmount` had never been called through a real session
   before.
2. **The Preferences tab's own select referenced a `note` column that
   does not exist on `food_preferences`.** The query has always failed
   silently — `.data` came back `null`, and the page's `?? []` fallback
   swallowed it into an empty list with no visible error. There was
   previously no way to add a preference by hand, so nothing ever
   exposed this: a preference added through the AI chat path also
   inserts into this same table, so the same silent-empty display bug
   would have affected AI-created preferences too, invisibly, since the
   feature shipped. Fixed by dropping the nonexistent column from the
   select and the row's meta line.

## Verified

- `npm run verify`: typecheck, lint, migrations/embeds/boundaries/
  secrets lint, tracker/brand checks, security suite, unit tests
  (existing `meals.test.ts`'s 25 tests unaffected), DB/RLS tests,
  production build, 256 E2E — clean before and after the `note`-column
  fix.
- `npm run verify:live`: 76/76, confirming `recipe_nutrients` landed
  (the `obligation_history_write_admin` migration from the same
  session's Bills work was already live).
- Browser-verified end to end against a live QA household (`pro`
  plan): added a recipe with nutrients and essential ingredients;
  confirmed it appeared in Plan a meal's recipe picker and Recipes tab
  header now reads "Add recipe" (no "Plan a meal" leaking onto that
  tab); planned a meal from the recipe and confirmed ingredients and
  nutrients ("420 kcal · 18g protein per serving") appeared on the meal
  card; planned a second meal with no recipe and confirmed its card
  showed "Add a recipe" (not "View recipe"); ran Suggest for a future
  date, got a real recommendation with a reason, and added it with one
  click — confirmed on the Plan tab afterward; added three preferences
  by hand and, after finding and fixing the `note`-column bug,
  confirmed they render correctly with "Whole household" and the right
  kind. QA household and test user deleted afterward.

## What's still open

This closes the 13-item batch's Meals & Cooking portion (items 1-2 and
5-9 of the original list). Ingredient quantities on a hand-typed recipe
default to 1 unit each — refining exact quantities/units per ingredient
is a natural follow-up, not requested in this batch. No backlog story
number maps to this work.

## Where the code lives

- `supabase/migrations/20260921160000_recipe_nutrients.sql`
- `packages/core/src/meals/meals.ts` — `Recipe` nutrient fields,
  `PREFERENCE_KINDS`
- `packages/core/src/meals/repository.ts` — `attachRecipeToMeal`,
  `createRecipe`, `createFoodPreference`, `suggestMeal`
- `apps/web/app/(auth)/meal-actions.ts` — the six actions backing the
  above, plus `addSuggestedMealAction`
- `apps/web/app/_components/meal-forms.tsx` — `AttachRecipeControl`,
  `AddRecipeButton`, `AddPreferenceButton`, `SuggestMealButton`
- `apps/web/app/meals/page.tsx` — tab-scoped header, nutrient display,
  the `note`-column fix
