-- Rough per-serving nutrient figures on a recipe (household batch item 2).
--
-- "Rough" is the operative word: these are whatever the household recorded
-- when they added the recipe (their own estimate, a label, a packet) — never
-- computed from the ingredient list, which WonderHome has no nutrition
-- database to do safely. All four are optional; a recipe with none set shows
-- no nutrient line at all rather than a guessed one (design principle 9).

alter table public.recipes
  add column calories_per_serving integer check (calories_per_serving is null or calories_per_serving between 0 and 5000),
  add column protein_grams integer check (protein_grams is null or protein_grams between 0 and 500),
  add column carbs_grams integer check (carbs_grams is null or carbs_grams between 0 and 500),
  add column fat_grams integer check (fat_grams is null or fat_grams between 0 and 500);

comment on column public.recipes.calories_per_serving is
  'Whatever the household recorded — never computed from ingredients. Null means not recorded.';
