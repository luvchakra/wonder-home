-- HomePlaces: the household's place book.
--
-- Places the family saved from a HomePlaces answer, and places they said are
-- "not for us". It is everything HomePlaces learns: saved places are
-- suggested first and their kinds are preferred, turned-down places never
-- come back. Nothing here is a model's opinion; it is the family's own word.
--
-- `place_id` is the provider's id (Google Places), so the same place is one
-- row however often it comes up. Every member reads the book; an adult or
-- Admin changes it. Coordinates are the place's own public location, never a
-- person's.

create table public.household_places (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  place_id text not null check (length(place_id) between 1 and 300),
  name text not null check (length(trim(name)) between 1 and 200),
  address text check (address is null or length(address) <= 300),
  kind text check (kind is null or length(kind) <= 80),
  latitude numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  maps_uri text check (maps_uri is null or (length(maps_uri) <= 500 and maps_uri like 'https://%')),
  status text not null check (status in ('saved', 'not_for_us')),
  note text check (note is null or length(note) <= 300),
  set_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, place_id)
);

comment on table public.household_places is
  'HomePlaces place book: places a household saved or turned down ("not_for_us"). Ranking learns only from these.';

create trigger household_places_set_updated_at
  before update on public.household_places
  for each row execute function wh.set_updated_at();

alter table public.household_places enable row level security;

create policy household_places_select_member on public.household_places for select
  to authenticated using (wh.is_member(household_id));

create policy household_places_insert_adult on public.household_places for insert
  to authenticated
  with check (
    wh.has_role(household_id, array['head', 'administrator', 'adult'])
    and (set_by_member_id is null or set_by_member_id = wh.member_id(household_id))
  );

create policy household_places_update_adult on public.household_places for update
  to authenticated
  using (wh.has_role(household_id, array['head', 'administrator', 'adult']))
  with check (
    wh.has_role(household_id, array['head', 'administrator', 'adult'])
    and (set_by_member_id is null or set_by_member_id = wh.member_id(household_id))
  );

create policy household_places_delete_adult on public.household_places for delete
  to authenticated using (wh.has_role(household_id, array['head', 'administrator', 'adult']));

notify pgrst, 'reload schema';
