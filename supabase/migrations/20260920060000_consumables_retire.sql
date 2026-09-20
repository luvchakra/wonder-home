-- Freeing a retired consumable's name for reuse (story 09-001, and the
-- household's own "always able to add, update or delete" expectation).
--
-- "Stop tracking" was always meant to be `active = false`, matching every
-- other soft-removal in this schema (a policy stands down, a playbook item
-- pauses) rather than a hard delete that would cascade-orphan real purchase
-- and order history (`cart_suggestions`/`order_line_items` reference
-- consumables `on delete cascade`). But the table-wide `unique (household_id,
-- name)` never accounted for that: a retired "Milk" still occupied the name,
-- so re-adding it after stopping tracking it failed with a conflict that had
-- nothing to do with anything currently tracked.
--
-- The fix is the same shape `policies_one_active_per_name` already uses: a
-- partial unique index scoped to the active rows. Retiring one now really
-- does free the name, and only one active row per name can still ever exist.

alter table public.consumables drop constraint consumables_household_id_name_key;

create unique index consumables_active_name_unique
  on public.consumables (household_id, name)
  where active;

comment on index consumables_active_name_unique is
  'One active consumable per name per household. A retired one no longer blocks re-adding the same name.';
