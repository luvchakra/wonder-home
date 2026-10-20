# WonderHome's recipe catalog, and recipes you can change (25-022, 25-015)

**Date:** 2026-10-20
**Asked by:** the owner: "look for some good online Indian recipe sites which align with our design, create a recipe catalog using such data and ensure that this perfectly compliments the meals and cooking module. select recipes only with nice pictures and simple and short steps. users can still modify such recipes and save their own versions. for each recipe the ingredients, nutrients should be stored and displayed nicely as well."

## What was done
- **Where the dishes came from.** Recipe sites' text and photographs are copyrighted, and none offers a licence to republish them. So the 34 dishes are everyday Indian staples, with short steps written for WonderHome (3–6 each). Their pictures come from Wikimedia Commons under CC BY-SA, copied into our own storage (`grocery-catalog/recipes/<slug>.jpg`). Each picture shows its author and licence under it and links to its file page. The dish data lives in `scripts/recipe-catalog/recipes.ts` and the picture credits in `pictures.tsv`.
- **Data.** Migration `20261020160000_recipe_catalog.sql` is live.
  - It adds `recipe_catalog` and `recipe_catalog_ingredients` as platform data: RLS lets every signed-in member read them, and only the service-role seed writes them.
  - `recipes` gains `catalog_recipe_id` and `active`. The household's unique name now holds only among current recipes.
  - `scripts/recipe-catalog/seed.mts` refuses any ingredient name the grocery catalog lacks, works out the nutrients, uploads the pictures and upserts by slug.
- **Nutrients** (`meals/ingredient-nutrition.ts`) are arithmetic over each ingredient's IFCT 2017 values:
  - liquids are weighed at a density (oil and ghee 0.92 g/ml);
  - deep-frying oil is left out and said so;
  - pieces count by a stated weight;
  - no figures are given when under 80% of the weighable amount is known, or when a fat, sugar or nut is unknown.

  22 of 34 dishes have figures. Three IFCT links were added: besan, full-cream milk and lemon.
- **Meals → Recipes.**
  - Your recipes: a card each, with a pencil that opens the same recipe form, filled in, and Remove from your recipes. Removing retires the recipe, and meals planned from it keep it (25-015).
  - Ideas from WonderHome: two to a row on a phone, filtered by course.
  - `/meals/recipes/[slug]` shows the picture and credit, prep, cooking and serves, one serving with "from n of m ingredients", what you need with each grocery item's picture, the numbered steps, Plan this and Save my version (`meals/catalog-copy.ts` finds an existing copy rather than making a second).
- **HomeTalk.** "Plan poha for breakfast tomorrow" uses the household's own recipe first, otherwise the catalog dish.
  - `grounding.ts` reads `catalogRecipes` and sets the server-only `catalogSlug`, which `withoutServerOnly` strips from any model output.
  - The executor saves the household's copy before it plans.
  - The golden case is in `conversation/evaluation.test.ts`.
- **Words and help.** The `recipes.*` area is in all eight languages, and help ¶15–16 (Meals) is in all eight.

## Verified
- Typecheck (core, web); ESLint on the changed files; migration, help-link and bundle checks; all unit tests (3,818); production build.
- Browser, on the live project with the QA household, at 360px and 1280px:
  - the Recipes tab with no horizontal scroll;
  - Breakfast filter: 8 dishes;
  - Kanda poha and Dal tadka pages;
  - Save my version, then Plan this; a second plan for the same slot is refused;
  - the pencil opens the filled-in form, a rename saves, Remove takes the recipe off;
  - no page errors.

## Open
- **Pictures.** Wikimedia rate-limits downloads, so dishes without a picture show the meals tile until their picture arrives. Re-running the seed with the picture folder adds them.
- **Missing nutrient data.** Twelve dishes have no figures because IFCT 2017 has no sugar, curd, butter or cream. A second source belongs to 25-007 (USDA).
- **Translation.** Dish names, descriptions and steps are English (25-023).
- **Setup step count.** The household setup count still includes retired recipes (`household_setup_counts`). This is harmless, since it only reads "has recipes".
