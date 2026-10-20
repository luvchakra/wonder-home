# Recipe picker and diets; bills month by month, line-item budgets, the bill form (2026-10-20)

All of this came from the owner's phone screenshots the same evening.

## What was done
- **Every recipe in Plan a meal** (25-026). From a recipe is now a picker (`apps/web/app/_components/recipe-picker.tsx`, logic in `packages/core/src/meals/recipe-picker.ts`).
  - **What it lists.** The household's own recipes first, then WonderHome's dishes not saved yet. Each row has its picture, kcal and protein a serving (or "not counted yet"), time and serves.
  - **Filters.** One compact row of four dropdowns, as the owner asked: the family's diet or a dish label, calories, protein, and the order.
  - **Planning a WonderHome dish.** Its ingredients fill the rows (`catalogDishLinesAction`), and planning it saves it to the household's recipes (`saveCatalogRecipe` in `createMealAction`).
  - All 34 catalog dishes now have pictures: the last five were seeded after Wikimedia's rate limit eased.
- **Diets for the family and each person.** Migration `20261020200000_food_preferences_diet.sql` (applied live) adds a `diet` kind to `food_preferences`.
  - **The set.** Vegetarian, eggetarian, non-vegetarian, vegan or Jain; one for the household and one per member.
  - **Where it is set.** Meals → Preferences → Diet (`apps/web/app/meals/diet-settings.tsx`, `setDiet`).
  - **How fit is decided.** By rules, in `meals/diet.ts`: the catalog's own label, else the ingredients; a vegan or Jain diet is checked against the ingredients.
  - **Where it shows.** The meal check treats a clash as a house rule. The picker says "Not for {name} ({diet}): it has dairy". HomeBrain and the family-likes answer read a diet as a sentence.
- **Bills, month by month** (11-012). A recurring bill shows its last three months, this one and one ahead. A past month is Paid from the history, or Not entered with the pencil to fill it in.
- **Budgets per line item.** Electricity, water, piped gas, cooking gas, petrol and diesel (new `fuel` bill type), rent and the rest, grouped by kind. A budget counts the payments of bills of that type; one set earlier for a whole kind keeps counting it.
- **Add a bill asks once.** The amount and the due date sit under This bill. The Earlier bills rows are gone, since the months are filled in on the bill itself.
- **Two fixes.**
  - Saving a bill with no amount failed in production: the database constraint `obligations_amount_has_currency` refused a currency stored without an amount. The currency is now kept only with an amount.
  - "Quote the request id" showed no id. `toErrorBody` now gives an unexpected error a short reference, in the message and in the server log.

## Verified
- Unit tests:
  - `diet.test.ts` 6, `recipe-picker.test.ts` 4, meal check 1 new, meals 83
  - `periods.test.ts` and `budgets.test.ts` updated; finance 71
  - `errors-reference.test.ts` 2
  - broad run: 921 passed
- Static checks: typecheck, ESLint on the changed files, embed, migration and help-link lint.
- Browser QA on the live project at 360px (QA household):
  - **Diets:** the family set to vegetarian and the QA child to vegan; both kept after a reload.
  - **Picker:** pictures and nutrition lines showed. The vegan note appeared on Dal makhani. Dal makhani was planned from the catalog: it was saved as the household's recipe and the meal got its 9 ingredients.
  - **Filter row:** the four dropdowns' values fit; scrollWidth equals clientWidth.
  - **Bills:** August, September and October showed Not entered. Filling in August with ₹2,300 and a paid date turned it into "Paid Mon, 3 Aug", and the next month then read "Usually ₹2,300".
  - **Budgets:** the budget list is grouped by kind, petrol included.
  - **Add a bill:** Water saved with no amount.

## Open
- The meal check still reads a household recipe's diet from ingredient names; a dish named nothing recognisable is taken as veg. A per-recipe diet label could come later.
