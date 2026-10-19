-- How the family is related (the owner, 2026-10-19).
--
-- An Admin writes rows on Members & roles: "Kunal is father of Asmi",
-- "Upasana is wife of Kunal". Each row is a person, a relation and a person:
--   member_id          — who the sentence starts with
--   relation           — a kind from the app's list (father, wife, …) or the
--                        household's own words, as typed
--   related_member_id  — who it ends with
-- The other way round ("Asmi is daughter of Kunal") is said by the app, never
-- stored, so a pair is related once, in either direction.
--
-- Every member of the household reads the rows; only an Admin writes them.
-- Policies use the set forms (wh.member_households(), wh.admin_households()),
-- evaluated once per statement. Both people must be active family members of
-- the row's household — never a househelper, never someone from elsewhere.
-- Nothing else points at a row, so removing one is a plain delete.

create table if not exists public.member_relationships (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  relation text not null check (length(trim(relation)) between 1 and 40),
  related_member_id uuid not null references public.household_members(id) on delete cascade,
  created_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_relationships_two_people check (member_id <> related_member_id)
);

comment on table public.member_relationships is
  'How the family is related: "member_id is relation of related_member_id", one row per pair. Every member reads; Admins write.';

-- A pair is related once, whichever way round it was written.
create unique index if not exists member_relationships_pair_key
  on public.member_relationships (household_id, least(member_id, related_member_id), greatest(member_id, related_member_id));
create index if not exists member_relationships_member_idx on public.member_relationships (member_id);
create index if not exists member_relationships_related_idx on public.member_relationships (related_member_id);
create index if not exists member_relationships_created_by_idx on public.member_relationships (created_by_member_id);

create or replace function wh.assert_relationship_family()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok integer;
begin
  -- One person twice is the two_people check's to refuse, by its own name.
  if new.member_id = new.related_member_id then
    return new;
  end if;
  select count(*) into v_ok
  from public.household_members m
  where m.id in (new.member_id, new.related_member_id)
    and m.household_id = new.household_id
    and m.member_type in ('adult', 'child')
    and m.status <> 'inactive';
  if v_ok <> 2 then
    raise exception 'Both people must be family members of household %', new.household_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger member_relationships_family
  before insert or update on public.member_relationships
  for each row execute function wh.assert_relationship_family();

create trigger member_relationships_set_updated_at
  before update on public.member_relationships
  for each row execute function wh.set_updated_at();

alter table public.member_relationships enable row level security;

create policy member_relationships_select on public.member_relationships for select
  to authenticated using (household_id in (select wh.member_households()));

create policy member_relationships_insert on public.member_relationships for insert
  to authenticated with check (household_id in (select wh.admin_households()));

create policy member_relationships_update on public.member_relationships for update
  to authenticated
  using (household_id in (select wh.admin_households()))
  with check (household_id in (select wh.admin_households()));

create policy member_relationships_delete on public.member_relationships for delete
  to authenticated using (household_id in (select wh.admin_households()));

notify pgrst, 'reload schema';
