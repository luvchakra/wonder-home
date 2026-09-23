-- Story 17-007: weather as a planning signal.
--
-- A household that turns weather on chooses an area, and this is the only
-- place that area lives: a label a person picked and two coordinates rounded
-- to two decimals (about a kilometre). Nothing finer can be stored, so nothing
-- finer can ever be sent to a weather provider.
--
-- The last forecast is kept beside it so every screen and every agent pass in
-- the same hour reads one answer instead of asking the provider again. It is
-- written by the server only; a provider outage leaves it as it was.

create table public.weather_locations (
  household_id uuid primary key references public.households(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 160),
  latitude numeric(5, 2) not null check (latitude between -90 and 90),
  longitude numeric(6, 2) not null check (longitude between -180 and 180),
  timezone text check (length(timezone) <= 64),
  set_by_member_id uuid references public.household_members(id) on delete set null,
  consented_at timestamptz not null default now(),
  forecast jsonb,
  forecast_fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weather_locations_forecast_is_list check (forecast is null or jsonb_typeof(forecast) = 'array'),
  constraint weather_locations_forecast_has_time check ((forecast is null) = (forecast_fetched_at is null))
);

comment on table public.weather_locations is
  'The area a household chose for weather (story 17-007): a picked label and coordinates rounded to ~1 km, plus the last forecast the server fetched for it. Never an address.';

create trigger weather_locations_set_updated_at
  before update on public.weather_locations
  for each row execute function wh.set_updated_at();

alter table public.weather_locations enable row level security;

-- Every member plans around the weather, so every member can read it.
create policy weather_locations_select_member on public.weather_locations for select
  to authenticated using (wh.is_member(household_id));

-- Choosing what leaves the household is an Admin's decision, the same as any
-- other integration.
create policy weather_locations_insert_admin on public.weather_locations for insert
  to authenticated
  with check (wh.is_household_admin(household_id) and set_by_member_id = wh.member_id(household_id));

create policy weather_locations_update_admin on public.weather_locations for update
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

create policy weather_locations_delete_admin on public.weather_locations for delete
  to authenticated using (wh.is_household_admin(household_id));

notify pgrst, 'reload schema';
