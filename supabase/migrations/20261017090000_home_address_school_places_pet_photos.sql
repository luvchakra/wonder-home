-- Where the household lives, where each child goes to school, and a photo
-- for each pet.
--
-- 1. `household_addresses`: one home address per household, picked from a
--    place search (Google Places, `places/google.ts`) or typed when no search
--    is configured. A home address is the most sensitive thing a household
--    tells WonderHome about where it is, so only the household's adults and
--    Admins can read it: never a helper, never a child. Only an Admin sets or
--    removes it. Precise coordinates are kept because they are what makes
--    "schools near home" work, and they never leave the server except as
--    the bias of a place search the Admin is making.
--
-- 2. `school_enrolments` gains the place a school was picked from: its
--    place id, its address and its coordinates. All nullable: a school typed
--    by hand is still a school.
--
-- 3. `household_members.nickname_preferred`: the household calls this person
--    by their nickname. Greetings and the Family screen use it; their full
--    name stays the record.
--
-- 4. `pets.photo_path`: a pet's photo lives in the same private `avatars`
--    bucket as members' photos, under the household's folder, so the existing
--    storage policies (members read, Admins write) already govern it.

create table public.household_addresses (
  household_id uuid primary key references public.households(id) on delete cascade,
  formatted_address text not null check (length(trim(formatted_address)) between 1 and 300),
  -- Null when the address was typed rather than picked from a search.
  place_id text check (length(place_id) between 1 and 300),
  latitude numeric(9, 6) check (latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude between -180 and 180),
  set_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_addresses_coordinates_together check ((latitude is null) = (longitude is null))
);

comment on table public.household_addresses is
  'The household''s home address: picked from a place search (with its place id and coordinates) or typed. Readable by adults and Admins only; written by Admins.';

create trigger household_addresses_set_updated_at
  before update on public.household_addresses
  for each row execute function wh.set_updated_at();

alter table public.household_addresses enable row level security;

create policy household_addresses_select_adults on public.household_addresses for select
  to authenticated using (wh.has_role(household_id, array['head', 'administrator', 'adult']));

create policy household_addresses_insert_admin on public.household_addresses for insert
  to authenticated
  with check (wh.is_household_admin(household_id) and set_by_member_id = wh.member_id(household_id));

create policy household_addresses_update_admin on public.household_addresses for update
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id) and set_by_member_id = wh.member_id(household_id));

create policy household_addresses_delete_admin on public.household_addresses for delete
  to authenticated using (wh.is_household_admin(household_id));

alter table public.school_enrolments
  add column place_id text check (length(place_id) between 1 and 300),
  add column school_address text check (length(trim(school_address)) <= 300),
  add column latitude numeric(9, 6) check (latitude between -90 and 90),
  add column longitude numeric(9, 6) check (longitude between -180 and 180),
  add constraint school_enrolments_coordinates_together check ((latitude is null) = (longitude is null));

comment on column public.school_enrolments.place_id is
  'The place the school was picked from in a search, or null when it was typed.';

alter table public.pets
  add column photo_path text check (length(photo_path) between 1 and 300);

comment on column public.pets.photo_path is
  'Storage object path in the private "avatars" bucket (<household>/pets/<pet>), or null. Never a URL: reads mint a short-lived signed URL.';

alter table public.household_members
  add column nickname_preferred boolean not null default false;

comment on column public.household_members.nickname_preferred is
  'True when the household calls this member by their nickname. Only meaningful while a nickname is set.';

notify pgrst, 'reload schema';
