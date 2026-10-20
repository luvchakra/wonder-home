-- Where each family member is right now, by consent (the owner, 2026-10-20:
-- "show current location of each member here. obviously this is consent
-- based, located in setting of that user, for child, adult controls it").
--
-- `member_location_sharing`: whether a member shares. Off unless turned on.
-- An adult (or a helper) turns their own on and off; a child's is turned on
-- and off by their guardian or an Admin, never by anyone else.
--
-- `member_locations`: only the latest position, never a history — one row per
-- member, overwritten. It is written only by the member themselves, from
-- their own device, and only while their sharing is on. Turning sharing off
-- deletes it at once. The household's adults read it (and the member their
-- own); children and helpers read nobody else's. It is never given to a model.
--
-- Rollback: drop table public.member_locations; drop table public.member_location_sharing;

create table if not exists public.member_location_sharing (
  member_id uuid primary key references public.household_members(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  enabled boolean not null default false,
  set_by uuid references public.household_members(id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.member_location_sharing is
  'Whether a member shares where they are with the household''s adults. Off unless turned on: by the adult themselves, or for a child by their guardian or an Admin.';

create index if not exists member_location_sharing_household_idx on public.member_location_sharing (household_id);
create index if not exists member_location_sharing_set_by_idx on public.member_location_sharing (set_by);

create table if not exists public.member_locations (
  member_id uuid primary key references public.household_members(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  -- About eleven metres: enough to tell home from school, no finer.
  latitude numeric(8, 4) not null check (latitude between -90 and 90),
  longitude numeric(8, 4) not null check (longitude between -180 and 180),
  accuracy_m integer check (accuracy_m is null or accuracy_m between 0 and 100000),
  recorded_at timestamptz not null default now()
);

comment on table public.member_locations is
  'The latest position a sharing member''s own device reported, overwritten, never a history; gone when sharing is turned off.';

create index if not exists member_locations_household_idx on public.member_locations (household_id);

alter table public.member_location_sharing enable row level security;
alter table public.member_locations enable row level security;

-- Who may change a member's sharing: an adult or helper for themselves; for a
-- child, their guardian or an Admin (`wh.may_change_child`).
create or replace function wh.may_set_location_sharing(p_household_id uuid, p_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.id = p_member_id and m.household_id = p_household_id
      and (
        (m.member_type <> 'child' and m.id = wh.member_id(p_household_id))
        or (m.member_type = 'child' and wh.may_change_child(p_household_id, p_member_id))
      )
  );
$$;

revoke all on function wh.may_set_location_sharing(uuid, uuid) from public;
grant execute on function wh.may_set_location_sharing(uuid, uuid) to authenticated;

comment on function wh.may_set_location_sharing is
  'Whether the caller may turn a member''s location sharing on or off: an adult or helper for themselves, a child''s guardian or an Admin for the child.';

-- Every member sees who shares (so a child knows theirs is on).
drop policy if exists member_location_sharing_read on public.member_location_sharing;
create policy member_location_sharing_read on public.member_location_sharing for select
  to authenticated
  using (household_id in (select wh.member_households()));

drop policy if exists member_location_sharing_write on public.member_location_sharing;
create policy member_location_sharing_write on public.member_location_sharing for all
  to authenticated
  using (household_id in (select wh.member_households()) and wh.may_set_location_sharing(household_id, member_id))
  with check (
    wh.may_set_location_sharing(household_id, member_id)
    and (set_by is null or (household_id, set_by) in (select household_id, member_id from wh.my_memberships()))
  );

grant select, insert, update, delete on public.member_location_sharing to authenticated;

-- The member's own position: read by themselves and the household's adults.
drop policy if exists member_locations_read on public.member_locations;
create policy member_locations_read on public.member_locations for select
  to authenticated
  using (
    (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
    or exists (
      select 1 from public.household_members me
      where me.household_id = member_locations.household_id
        and me.profile_id = (select auth.uid())
        and me.member_type = 'adult'
        and me.status = 'active'
    )
  );

-- Written only by the member, for themselves, while their sharing is on.
drop policy if exists member_locations_write_own on public.member_locations;
create policy member_locations_write_own on public.member_locations for all
  to authenticated
  using ((household_id, member_id) in (select household_id, member_id from wh.my_memberships()))
  with check (
    (household_id, member_id) in (select household_id, member_id from wh.my_memberships())
    and exists (
      select 1 from public.member_location_sharing s
      where s.member_id = member_locations.member_id and s.household_id = member_locations.household_id and s.enabled
    )
  );

grant select, insert, update, delete on public.member_locations to authenticated;

-- Off means gone: turning sharing off (or removing it) deletes the position.
create or replace function wh.forget_location_when_sharing_stops()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'DELETE') or (new.enabled = false) then
    delete from public.member_locations where member_id = coalesce(new.member_id, old.member_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists member_location_sharing_forgets on public.member_location_sharing;
create trigger member_location_sharing_forgets
  after insert or update or delete on public.member_location_sharing
  for each row execute function wh.forget_location_when_sharing_stops();

notify pgrst, 'reload schema';
