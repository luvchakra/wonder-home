-- Optional device connectors (story 17-008).
--
-- A smart-home provider knows a device by its own identifier ("washer-7f3a").
-- WonderHome never guesses which of the household's appliances that is: a
-- reading filed against the wrong machine would move the wrong service date.
-- So a device the provider reports becomes a link row, linked to nothing,
-- and an Admin says which appliance it is — or that it should be ignored.
-- Only readings from a linked, not-ignored device become evidence in
-- home_device_signals.
--
-- Rows are created by a sync (service role), never by a session: a member
-- cannot invent a device any more than they can invent a reading. An Admin
-- may change only what the household decides — which asset, and whether it
-- is ignored. Disconnecting the provider removes its links with it.

create table public.home_device_links (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  -- The provider's identifier for the device. Opaque here.
  external_device_id text not null check (length(trim(external_device_id)) between 1 and 200),
  -- The key its readings are recorded under in home_device_signals.
  device_key text not null check (length(trim(device_key)) between 1 and 80),
  -- What the provider calls it, so an Admin can recognise it.
  label text not null check (length(trim(label)) between 1 and 120),
  asset_id uuid references public.home_assets(id) on delete set null,
  ignored boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_id, external_device_id),
  unique (household_id, device_key)
);

comment on table public.home_device_links is
  'Which household appliance a provider''s device is. Created by a sync, linked by an Admin, never inferred.';

alter table public.home_device_links enable row level security;

create index home_device_links_household_idx on public.home_device_links (household_id);

create trigger home_device_links_set_updated_at
  before update on public.home_device_links
  for each row execute function wh.set_updated_at();

create trigger home_device_links_asset_valid
  before insert or update on public.home_device_links
  for each row execute function wh.assert_home_asset_in_household();

create trigger home_device_links_integration_valid
  before insert or update on public.home_device_links
  for each row execute function wh.assert_commerce_row_in_household('integration_id', 'integrations');

create policy home_device_links_select_member on public.home_device_links for select
  to authenticated using (wh.is_member(household_id));

create policy home_device_links_update_admin on public.home_device_links for update
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

-- A session may change the household's two decisions and nothing else: not
-- which provider device this is, not its key, not its household.
revoke insert, update, delete on public.home_device_links from anon, authenticated;
grant update (asset_id, ignored) on public.home_device_links to authenticated;

-- A re-sync must never record the same reading twice. Provider identity in
-- integration_events is the first line; this is the one the database keeps.
create unique index home_device_signals_reading_unique
  on public.home_device_signals (household_id, device_key, kind, observed_at);

notify pgrst, 'reload schema';
