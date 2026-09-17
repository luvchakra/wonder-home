-- Househelper and home operations (stories 07-001 through 07-005, 01-006).
--
-- Applied to the wonder-home Supabase project as version 20260917023902.
--
-- The product rule these tables have to honour: a househelper does not update
-- WonderHome. They do their work, and the system notices when something is not
-- normal. Note what is deliberately absent — there is no task completion table,
-- no per-chore status, no productivity field. Adding one later would not be a
-- feature; it would be this product becoming a different one.
--
-- Availability is split into a pattern and its exceptions on purpose. "Sunita
-- will not be here tomorrow" is a row in availability_exceptions, never an edit
-- to her schedule, because the pattern is what tells us the absence is unusual.

create table public.helper_profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  engagement text not null default 'regular' check (engagement in ('regular', 'occasional', 'service')),
  started_on date,
  notes text check (length(trim(notes)) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id)
);

comment on table public.helper_profiles is
  'A househelper as the household relates to them. Deliberately holds no productivity data: this is not an employee monitoring system.';

alter table public.helper_profiles enable row level security;

create trigger helper_profiles_set_updated_at
  before update on public.helper_profiles
  for each row execute function wh.set_updated_at();

create table public.member_availability (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  source text not null default 'stated' check (source in ('stated', 'observed', 'integration')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_availability_ordered check (start_time < end_time),
  unique (member_id, day_of_week, start_time)
);

comment on table public.member_availability is
  'Recurring windows when someone is normally around. Exceptions live separately so a single absence never rewrites the pattern.';

alter table public.member_availability enable row level security;

create index member_availability_member_idx on public.member_availability (member_id, day_of_week);

create trigger member_availability_set_updated_at
  before update on public.member_availability
  for each row execute function wh.set_updated_at();

create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  on_date date not null,
  -- False for an absence, true for an extra day. Both are exceptions.
  available boolean not null default false,
  start_time time,
  end_time time,
  reason text check (length(trim(reason)) <= 200),
  created_at timestamptz not null default now(),
  unique (member_id, on_date),
  constraint availability_exceptions_ordered check (
    start_time is null or end_time is null or start_time < end_time
  )
);

comment on table public.availability_exceptions is
  'One day that differs from the pattern. "Sunita will not be here tomorrow" is a row here, not an edit to her schedule.';

alter table public.availability_exceptions enable row level security;

create index availability_exceptions_date_idx on public.availability_exceptions (household_id, on_date);

create or replace function wh.assert_availability_member_in_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  select household_id into v_household from public.household_members where id = new.member_id;
  if v_household is distinct from new.household_id then
    raise exception 'Member % is not part of household %', new.member_id, new.household_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger member_availability_member_valid
  before insert or update on public.member_availability
  for each row execute function wh.assert_availability_member_in_household();

create trigger availability_exceptions_member_valid
  before insert or update on public.availability_exceptions
  for each row execute function wh.assert_availability_member_in_household();

create trigger helper_profiles_member_valid
  before insert or update on public.helper_profiles
  for each row execute function wh.assert_availability_member_in_household();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- A helper's own profile is visible to them and to administrators — not to the
-- whole household, because notes about an employee are not family reading.
-- Availability is shared, since planning around each other is the point.
-- ---------------------------------------------------------------------------

create policy helper_profiles_select_member on public.helper_profiles for select
  to authenticated
  using (
    wh.is_member(household_id)
    and (wh.is_household_admin(household_id) or member_id = wh.member_id(household_id))
  );

create policy helper_profiles_write_admin on public.helper_profiles for all
  to authenticated using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

create policy member_availability_select_member on public.member_availability for select
  to authenticated using (wh.is_member(household_id));

create policy member_availability_write_own_or_admin on public.member_availability for all
  to authenticated
  using (wh.is_household_admin(household_id) or member_id = wh.member_id(household_id))
  with check (wh.is_household_admin(household_id) or member_id = wh.member_id(household_id));

create policy availability_exceptions_select_member on public.availability_exceptions for select
  to authenticated using (wh.is_member(household_id));

create policy availability_exceptions_write_own_or_admin on public.availability_exceptions for all
  to authenticated
  using (wh.is_household_admin(household_id) or member_id = wh.member_id(household_id))
  with check (wh.is_household_admin(household_id) or member_id = wh.member_id(household_id));

notify pgrst, 'reload schema';
