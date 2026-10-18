-- Where an adult works, picked from the place search (HomePlaces story 24-005).
--
-- "Somewhere for lunch near my office" needs the office as a point, and the
-- office was free text only (`household_members.school_or_work_location`).
-- This is its own table rather than columns on household_members because who
-- may read it differs: like the home address, an office's coordinates are
-- for the person themselves, the household's adults and its Admins — never a
-- child or a househelper, who read every member row.
--
-- Written by the person, or by an Admin managing them, always from a place
-- the server re-read from the provider by its id: the browser never supplies
-- an address or a point. Only an adult has an office here.
--
-- Rollback: drop table public.member_work_places.

create table public.member_work_places (
  member_id uuid primary key references public.household_members(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  place_id text not null check (length(place_id) between 1 and 300),
  name text not null check (length(trim(name)) between 1 and 200),
  address text check (address is null or length(trim(address)) <= 300),
  latitude numeric(9, 6) not null check (latitude between -90 and 90),
  longitude numeric(9, 6) not null check (longitude between -180 and 180),
  set_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.member_work_places is
  'An adult''s office, picked from a place search with its coordinates. Readable by the person, adults and Admins; written by the person or an Admin.';

create trigger member_work_places_set_updated_at
  before update on public.member_work_places
  for each row execute function wh.set_updated_at();

alter table public.member_work_places enable row level security;

create policy member_work_places_select on public.member_work_places for select
  to authenticated
  using (
    member_id = wh.member_id(household_id)
    or wh.has_role(household_id, array['head', 'administrator', 'adult'])
  );

-- The person themselves, or an Admin; only for an adult of this household,
-- and recording who set it.
create policy member_work_places_insert on public.member_work_places for insert
  to authenticated
  with check (
    (member_id = wh.member_id(household_id) or wh.is_household_admin(household_id))
    and set_by_member_id = wh.member_id(household_id)
    and exists (
      select 1 from public.household_members m
      where m.id = member_id and m.household_id = member_work_places.household_id and m.member_type = 'adult'
    )
  );

create policy member_work_places_update on public.member_work_places for update
  to authenticated
  using (member_id = wh.member_id(household_id) or wh.is_household_admin(household_id))
  with check (
    (member_id = wh.member_id(household_id) or wh.is_household_admin(household_id))
    and set_by_member_id = wh.member_id(household_id)
    and exists (
      select 1 from public.household_members m
      where m.id = member_id and m.household_id = member_work_places.household_id and m.member_type = 'adult'
    )
  );

create policy member_work_places_delete on public.member_work_places for delete
  to authenticated
  using (member_id = wh.member_id(household_id) or wh.is_household_admin(household_id));

notify pgrst, 'reload schema';
