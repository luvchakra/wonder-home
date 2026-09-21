-- Opens consumables.category from a closed 5-value enum to free text.
--
-- A household reported wanting to add their own category from the
-- Groceries add form's dropdown. `unit` and `relationship`
-- (household_members) already made this exact call for the same reason:
-- the true answers a household wants to type ("baby", "cleaning supplies",
-- "stationery") do not fit a fixed list, and a closed enum just refuses
-- the real one.
--
-- `consumables_pet_is_pet_category` (pet_id is null or category = 'pet')
-- is untouched and still enforced: 'pet' stays the exact string the pet-
-- supplies path keys off, whether or not the household ever sees the
-- other four defaults as anything but suggestions from here on. The five
-- existing values move into the application layer as quick-pick
-- suggestions (a <datalist>), not a database-level list.

alter table public.consumables drop constraint consumables_category_check;
alter table public.consumables add constraint consumables_category_check
  check (length(trim(category)) between 1 and 40);

comment on column public.consumables.category is
  'Free text, not an enum — "grocery", "household", "pet", "personal", "medical" are UI suggestions, not the only values. "pet" is the one magic value: consumables_pet_is_pet_category requires it verbatim when pet_id is set.';

notify pgrst, 'reload schema';
