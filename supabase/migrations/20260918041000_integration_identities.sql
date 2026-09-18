-- Provider identities for household members (story 17-002).
--
-- Applied to the wonder-home Supabase project as version 20260918041000.
--
-- A provider knows a person by its own identifier: a calendar address, a
-- student number, a customer id. WonderHome never guesses which household
-- member that is — a worksheet filed against the wrong child, or a dentist
-- appointment on the wrong parent's day, is worse than one that waits for a
-- person to say whose it is. This table is where the household says so, once,
-- per connection.
--
-- One table for every kind of connector rather than one per domain, so the
-- rule "identity is mapped by a person, never inferred" has one home.

create table public.integration_identities (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  -- The provider's identifier for the person or their calendar. Opaque here.
  external_id text not null check (length(trim(external_id)) between 1 and 200),
  member_id uuid not null references public.household_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (integration_id, external_id)
);

comment on table public.integration_identities is
  'Which household member a provider''s identifier refers to. Stated by an administrator, never inferred by a sync.';

alter table public.integration_identities enable row level security;

create index integration_identities_integration_idx
  on public.integration_identities (integration_id);

-- A foreign key proves the rows exist; these prove they belong to the same
-- household as the mapping claims to.
create trigger integration_identities_member_valid
  before insert or update on public.integration_identities
  for each row execute function wh.assert_meal_member_in_household('member_id');

create trigger integration_identities_integration_valid
  before insert or update on public.integration_identities
  for each row execute function wh.assert_commerce_row_in_household('integration_id', 'integrations');

-- The household can see who is mapped; only an administrator changes it, which
-- is the same person who can connect the account in the first place.
create policy integration_identities_select_member on public.integration_identities for select
  to authenticated using (wh.is_member(household_id));

create policy integration_identities_write_admin on public.integration_identities for all
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

notify pgrst, 'reload schema';
