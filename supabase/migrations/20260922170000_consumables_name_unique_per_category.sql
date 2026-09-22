-- Fixing a false "already tracking something with that name" on a
-- genuinely new item (bug report, module 09).
--
-- `consumables_active_name_unique` scoped uniqueness to (household_id,
-- name) only — so the very first time a name collided with ANY other
-- active consumable in the household, regardless of category, the insert
-- was rejected. A household adding "Shampoo" under Groceries and later
-- "Shampoo" under Pet supplies (via the category combobox's own "Add
-- new…") hit this: two genuinely distinct tracked things, told they were
-- a duplicate of each other.
--
-- The uniqueness boundary a household actually means by "the same item"
-- is the same name within the same category, so category joins the index.

drop index public.consumables_active_name_unique;

create unique index consumables_active_name_unique
  on public.consumables (household_id, category, name)
  where active;

comment on index consumables_active_name_unique is
  'One active consumable per name per category per household. A retired one no longer blocks re-adding the same name, and the same name can be tracked separately in a different category.';
