-- Maintenance, laundry and pet care (stories 13-001 through 13-008).
--
-- Applied to the wonder-home Supabase project as version 20260917053846.
--
-- What these tables are not is as deliberate as what they are. There is no
-- inventory of possessions, no wash/dry/fold status anybody ticks, and no
-- record of who did which chore. Every column here exists because some decision
-- reads it: a service interval produces a due date, an AMC expiry changes what a
-- breakage costs, a next_action_by says whose move it is.
--
-- Device signals are separated from everything they might inform, because they
-- are optional by design. A household with no sensors must get the same
-- outcomes, reasoned from schedule and history — so nothing below depends on a
-- row in home_device_signals existing.

create table public.home_assets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null default 'appliance'
    check (category in ('appliance', 'fixture', 'vehicle', 'electronics', 'furniture', 'other')),
  location text check (length(trim(location)) <= 80),
  -- Null means this genuinely needs no servicing, which is different from
  -- nobody having filled it in yet: an unserviceable asset produces no dates.
  service_interval_days integer check (service_interval_days between 1 and 3650),
  last_serviced_on date,
  warranty_expires_on date,
  amc_expires_on date,
  responsible_member_id uuid references public.household_members(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'retired')),
  notes text check (length(trim(notes)) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.home_assets is
  'Appliances and fixtures the household has to keep working. Holds only what produces action: interval, cover, responsibility.';

alter table public.home_assets enable row level security;

create index home_assets_household_idx on public.home_assets (household_id) where status = 'active';
create index home_assets_service_idx on public.home_assets (household_id, last_serviced_on)
  where status = 'active' and service_interval_days is not null;

create trigger home_assets_set_updated_at
  before update on public.home_assets
  for each row execute function wh.set_updated_at();

create table public.asset_service_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  asset_id uuid not null references public.home_assets(id) on delete cascade,
  kind text not null default 'service' check (kind in ('service', 'repair', 'inspection', 'replacement')),
  occurred_on date not null,
  provider_name text check (length(trim(provider_name)) <= 120),
  -- Minor units, because storing money as a float is a bug waiting for a
  -- rounding error to find it.
  cost_minor bigint check (cost_minor >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  notes text check (length(trim(notes)) <= 500),
  created_at timestamptz not null default now(),
  constraint asset_service_events_cost_has_currency check ((cost_minor is null) = (currency is null))
);

comment on table public.asset_service_events is
  'What was actually done to an asset and when. The history that makes a due date honest rather than assumed.';

alter table public.asset_service_events enable row level security;

create index asset_service_events_asset_idx on public.asset_service_events (asset_id, occurred_on desc);

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  asset_id uuid references public.home_assets(id) on delete set null,
  subject text not null check (length(trim(subject)) between 1 and 160),
  provider_name text check (length(trim(provider_name)) <= 120),
  provider_contact text check (length(trim(provider_contact)) <= 120),
  status text not null default 'requested'
    check (status in ('requested', 'scheduled', 'in_progress', 'awaiting_parts', 'completed', 'cancelled')),
  scheduled_for timestamptz,
  next_action text check (length(trim(next_action)) <= 200),
  next_action_by text check (next_action_by in ('household', 'provider')),
  outcome_id uuid references public.outcomes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A settled request keeps no next action. Leaving one behind is how a closed
  -- thing carries on generating work for people.
  constraint service_requests_settled_has_no_next_action check (
    status not in ('completed', 'cancelled') or (next_action is null and next_action_by is null)
  )
);

comment on table public.service_requests is
  'An open piece of maintenance and, crucially, whose move it is. next_action_by is what makes an unresolved request actionable rather than informational.';

alter table public.service_requests enable row level security;

create index service_requests_open_idx on public.service_requests (household_id, updated_at desc)
  where status not in ('completed', 'cancelled');

create trigger service_requests_set_updated_at
  before update on public.service_requests
  for each row execute function wh.set_updated_at();

create table public.laundry_needs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 120),
  for_member_id uuid references public.household_members(id) on delete set null,
  needed_by timestamptz not null,
  -- 'unknown' is the honest default and the common case: nobody is asked to
  -- report a wash, so state advances from observation or not at all.
  state text not null default 'unknown'
    check (state in ('unknown', 'soiled', 'in_wash', 'drying', 'ready')),
  state_as_of timestamptz,
  state_source text check (state_source in ('observed', 'device', 'member_confirmed', 'inferred')),
  drying_hours numeric(4, 1) not null default 5 check (drying_hours > 0 and drying_hours <= 72),
  requires_outdoor_drying boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A state with no time behind it cannot be reasoned about, and a time with no
  -- source cannot be explained to the family later.
  constraint laundry_needs_state_has_provenance check (
    state = 'unknown' or (state_as_of is not null and state_source is not null)
  )
);

comment on table public.laundry_needs is
  'Something that has to be clean and ready by a deadline. Deliberately not a wash cycle: there is no step anyone is asked to confirm.';

alter table public.laundry_needs enable row level security;

create index laundry_needs_due_idx on public.laundry_needs (household_id, needed_by)
  where state <> 'ready';

create trigger laundry_needs_set_updated_at
  before update on public.laundry_needs
  for each row execute function wh.set_updated_at();

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  species text not null check (length(trim(species)) between 1 and 40),
  date_of_birth date,
  vet_name text check (length(trim(vet_name)) <= 120),
  vet_contact text check (length(trim(vet_contact)) <= 120),
  notes text check (length(trim(notes)) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.pets is
  'A member of the household with needs and no way to state them.';

alter table public.pets enable row level security;

create trigger pets_set_updated_at
  before update on public.pets
  for each row execute function wh.set_updated_at();

create table public.pet_care_needs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  pet_id uuid not null references public.pets(id) on delete cascade,
  kind text not null check (kind in ('food', 'litter', 'medication', 'vet_visit', 'grooming', 'exercise')),
  interval_days integer check (interval_days between 1 and 730),
  last_done_on date,
  due_on date,
  responsible_member_id uuid references public.household_members(id) on delete set null,
  supply_days_remaining integer check (supply_days_remaining >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Either it recurs or it has a date. Something with neither can never fall
  -- due, and a row that can never produce an outcome is a list entry.
  constraint pet_care_needs_has_a_rhythm_or_a_date check (
    interval_days is not null or due_on is not null
  )
);

comment on table public.pet_care_needs is
  'Outcome-based pet care. Medication is not stored differently from grooming, but it is never allowed to look the same in a list.';

alter table public.pet_care_needs enable row level security;

create index pet_care_needs_pet_idx on public.pet_care_needs (household_id, pet_id);

create trigger pet_care_needs_set_updated_at
  before update on public.pet_care_needs
  for each row execute function wh.set_updated_at();

create table public.home_device_signals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  asset_id uuid references public.home_assets(id) on delete cascade,
  device_key text not null check (length(trim(device_key)) between 1 and 80),
  kind text not null check (kind in
    ('cycle_complete', 'power_draw', 'door', 'motion', 'moisture', 'temperature', 'supply_level')),
  observed_at timestamptz not null,
  value numeric not null,
  -- How much the device itself is trusted. A cheap sensor's guess and a
  -- person's word must never be recorded as the same kind of evidence.
  confidence numeric(3, 2) not null default 0.5 check (confidence between 0 and 1),
  created_at timestamptz not null default now()
);

comment on table public.home_device_signals is
  'Optional device readings. Nothing in this module requires them: a household with no sensors gets the same outcomes, reasoned from schedule and history.';

alter table public.home_device_signals enable row level security;

create index home_device_signals_recent_idx
  on public.home_device_signals (household_id, kind, observed_at desc);

-- ---------------------------------------------------------------------------
-- Cross-table invariants
--
-- A foreign key proves a row exists; it does not prove it belongs to the same
-- household. Without these triggers a caller could point a household's asset at
-- another household's member and the reference would be perfectly valid.
-- ---------------------------------------------------------------------------

-- The member column is named differently on each table, so it is passed as a
-- trigger argument and read through to_jsonb rather than branching on
-- tg_table_name — plpgsql resolves NEW's fields whichever branch runs, so a
-- CASE over column names would fail on the tables that lack the others.
create or replace function wh.assert_home_member_in_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
  v_household uuid;
begin
  v_member := (to_jsonb(new) ->> tg_argv[0])::uuid;

  if v_member is null then
    return new;
  end if;

  select household_id into v_household from public.household_members where id = v_member;
  if v_household is distinct from new.household_id then
    raise exception 'Member % is not part of household %', v_member, new.household_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger home_assets_member_valid
  before insert or update on public.home_assets
  for each row execute function wh.assert_home_member_in_household('responsible_member_id');

create trigger laundry_needs_member_valid
  before insert or update on public.laundry_needs
  for each row execute function wh.assert_home_member_in_household('for_member_id');

create trigger pet_care_needs_member_valid
  before insert or update on public.pet_care_needs
  for each row execute function wh.assert_home_member_in_household('responsible_member_id');

create or replace function wh.assert_home_asset_in_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  if new.asset_id is null then
    return new;
  end if;

  select household_id into v_household from public.home_assets where id = new.asset_id;
  if v_household is distinct from new.household_id then
    raise exception 'Asset % is not part of household %', new.asset_id, new.household_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger asset_service_events_asset_valid
  before insert or update on public.asset_service_events
  for each row execute function wh.assert_home_asset_in_household();

create trigger service_requests_asset_valid
  before insert or update on public.service_requests
  for each row execute function wh.assert_home_asset_in_household();

create trigger home_device_signals_asset_valid
  before insert or update on public.home_device_signals
  for each row execute function wh.assert_home_asset_in_household();

create or replace function wh.assert_pet_in_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  select household_id into v_household from public.pets where id = new.pet_id;
  if v_household is distinct from new.household_id then
    raise exception 'Pet % is not part of household %', new.pet_id, new.household_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger pet_care_needs_pet_valid
  before insert or update on public.pet_care_needs
  for each row execute function wh.assert_pet_in_household();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- The house is shared, so the household reads all of this. Writing is narrower:
-- a member may record what they are responsible for, and structural changes —
-- adding an asset, retiring one, registering a pet — belong to an administrator.
--
-- Device signals are write-only from the household's point of view. They are
-- ingested by the server, and a member who could insert them by hand could
-- manufacture evidence that an outcome was met.
-- ---------------------------------------------------------------------------

create policy home_assets_select_member on public.home_assets for select
  to authenticated using (wh.is_member(household_id));

create policy home_assets_write_admin on public.home_assets for all
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

create policy home_assets_update_responsible on public.home_assets for update
  to authenticated
  using (wh.is_member(household_id) and responsible_member_id = wh.member_id(household_id))
  with check (wh.is_member(household_id) and responsible_member_id = wh.member_id(household_id));

create policy asset_service_events_select_member on public.asset_service_events for select
  to authenticated using (wh.is_member(household_id));

create policy asset_service_events_insert_member on public.asset_service_events for insert
  to authenticated with check (wh.is_member(household_id));

create policy asset_service_events_write_admin on public.asset_service_events for all
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

create policy service_requests_select_member on public.service_requests for select
  to authenticated using (wh.is_member(household_id));

create policy service_requests_write_member on public.service_requests for all
  to authenticated
  using (wh.is_member(household_id))
  with check (wh.is_member(household_id));

create policy laundry_needs_select_member on public.laundry_needs for select
  to authenticated using (wh.is_member(household_id));

create policy laundry_needs_write_member on public.laundry_needs for all
  to authenticated
  using (wh.is_member(household_id))
  with check (wh.is_member(household_id));

create policy pets_select_member on public.pets for select
  to authenticated using (wh.is_member(household_id));

create policy pets_write_admin on public.pets for all
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

create policy pet_care_needs_select_member on public.pet_care_needs for select
  to authenticated using (wh.is_member(household_id));

create policy pet_care_needs_write_member on public.pet_care_needs for all
  to authenticated
  using (wh.is_member(household_id))
  with check (wh.is_member(household_id));

create policy home_device_signals_select_member on public.home_device_signals for select
  to authenticated using (wh.is_member(household_id));

-- Deliberately no insert, update or delete policy for members: signals are
-- server-ingested evidence, and evidence a member can write is not evidence.

notify pgrst, 'reload schema';
