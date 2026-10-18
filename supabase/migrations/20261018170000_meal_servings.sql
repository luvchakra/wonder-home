-- How many a meal is planned for (HomeFood 25-003a).
--
-- A recipe says how many its amounts serve (`recipes.serves`); a meal says how
-- many are eating this time. The shortfall a meal shows — what to add to the
-- list — scales the recipe's amounts by the one over the other. Null means not
-- said, and the recipe's own number is used.

alter table public.meals
  add column servings smallint check (servings is null or servings between 1 and 50);

comment on column public.meals.servings is
  'How many this meal is for. Null: as many as the recipe serves. Scales the ingredient shortfall.';

notify pgrst, 'reload schema';
