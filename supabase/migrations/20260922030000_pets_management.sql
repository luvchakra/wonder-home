-- Pets as a manageable entity, not a read-only join target (product
-- feedback: "under family tab, under invite, add option to add a pet").
--
-- `pets` has existed since the home-and-maintenance module, but nothing
-- ever wrote to it beyond seed/manual SQL — `pet_care_needs` is the only
-- half of this domain with a real create/read path today. This gives pets
-- the same "added, updated and removed" life every other entity in this
-- app already has (CLAUDE.md rule 12), and — per the same rule — "removed"
-- is a soft state, not a row that disappears and orphans its own
-- `pet_care_needs` history.

alter table public.pets
  add column active boolean not null default true;

comment on column public.pets.active is
  'False once a pet is retired from the household. Never deleted outright — pet_care_needs keeps its history against this row.';

create index pets_household_active_idx on public.pets (household_id) where active;

notify pgrst, 'reload schema';
