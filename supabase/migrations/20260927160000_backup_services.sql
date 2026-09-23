-- Story 07-008: backup services.
--
-- The people outside the household it can call when a helper is away and
-- nobody at home covers an outcome — a cleaning service, a cook who fills
-- in. One row per service, naming the outcomes it can cover. Arranging cover
-- is an ordinary service request (13-006) that remembers which outcome and
-- which day it covers, so it is never arranged twice.
--
-- Admin-only, like a helper's arrangement: which outside service replaces a
-- helper on which day is the household administrator's business, not every
-- member's, and not the helper's.

create table public.backup_services (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  contact text check (length(trim(contact)) <= 120),
  covers text[] not null default '{}'
    check (cardinality(covers) <= 40 and array_to_string(covers, ',') ~ '^([a-z][a-z0-9_.]{1,60}(,[a-z][a-z0-9_.]{1,60})*)?$'),
  notes text check (length(trim(notes)) <= 300),
  active boolean not null default true,
  created_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.backup_services is
  'Outside services a household can call to cover an outcome when a helper is away (story 07-008). Retired, never deleted, so cover requests keep their provider.';

create unique index backup_services_name_idx on public.backup_services (household_id, lower(trim(name)));

create trigger backup_services_set_updated_at
  before update on public.backup_services
  for each row execute function wh.set_updated_at();

alter table public.backup_services enable row level security;

create policy backup_services_select_admin on public.backup_services for select
  to authenticated using (wh.is_household_admin(household_id));

create policy backup_services_write_admin on public.backup_services for all
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

-- A cover request remembers what it covers. Together these say "this
-- outcome, this day", and only one open request may say it.
alter table public.service_requests
  add column backup_service_id uuid references public.backup_services(id) on delete set null,
  add column cover_outcome_key text check (cover_outcome_key is null or cover_outcome_key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  add column cover_on date,
  add constraint service_requests_cover_is_whole check ((cover_outcome_key is null) = (cover_on is null));

create unique index service_requests_one_open_cover_idx
  on public.service_requests (household_id, cover_outcome_key, cover_on)
  where cover_outcome_key is not null and status <> 'cancelled';

-- A backup service named on a cover request is the same household's.
create or replace function wh.assert_backup_service_in_household()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.backup_service_id is not null and not exists (
    select 1 from public.backup_services s where s.id = new.backup_service_id and s.household_id = new.household_id
  ) then
    raise exception 'Backup service % is not part of household %', new.backup_service_id, new.household_id using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger service_requests_backup_service_in_household
  before insert or update of backup_service_id, household_id on public.service_requests
  for each row execute function wh.assert_backup_service_in_household();

notify pgrst, 'reload schema';
