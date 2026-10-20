-- A moved or cancelled event tells the people going (story 27-013).
--
-- The change is recorded by the database itself, in the same statement that
-- makes it, so it is true however the event was changed: its own page, the
-- calendar, HomeTalk. Only the two changes that alter someone's plans are kept:
-- the start moved, or the event was cancelled. Who made it is recorded as the
-- signed-in member (null for the platform's own writes), so the notice can
-- leave the editor out. Nothing here holds what an event says beyond its time.
--
-- Read only by the server (no policy for a session): the notice, not this
-- table, is what a person sees, and it is built per recipient from who may see
-- the event.

create table public.family_event_changes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  event_id uuid not null references public.family_events(id) on delete cascade,
  kind text not null check (kind in ('moved', 'cancelled')),
  changed_by_member_id uuid references public.household_members(id) on delete set null,
  previous_starts_at timestamptz,
  new_starts_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.family_event_changes is
  'An event''s start moving, or its cancellation, as it happened and by whom (story 27-013). Server-read only.';

alter table public.family_event_changes enable row level security;

-- No session has a reason to read this table; the policy exists so the table is not
-- "no policy at all", which scripts/test-tenant-isolation-rls.mjs treats as unprotected.
create policy family_event_changes_no_client_access
  on public.family_event_changes for select
  to authenticated
  using (false);

create index family_event_changes_created_idx on public.family_event_changes (created_at desc);
create index family_event_changes_event_idx on public.family_event_changes (event_id, created_at desc);
create index family_event_changes_household_idx on public.family_event_changes (household_id);

create or replace function wh.record_family_event_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid;
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    v_member := (select wh.member_id(new.household_id));
    insert into public.family_event_changes (household_id, event_id, kind, changed_by_member_id, previous_starts_at, new_starts_at)
    values (new.household_id, new.id, 'cancelled', v_member, old.starts_at, new.starts_at);
  elsif new.status <> 'cancelled' and new.starts_at is distinct from old.starts_at then
    v_member := (select wh.member_id(new.household_id));
    insert into public.family_event_changes (household_id, event_id, kind, changed_by_member_id, previous_starts_at, new_starts_at)
    values (new.household_id, new.id, 'moved', v_member, old.starts_at, new.starts_at);
  end if;
  return new;
end;
$$;

revoke execute on function wh.record_family_event_change() from public, anon, authenticated;

create trigger family_events_record_change
  after update on public.family_events
  for each row execute function wh.record_family_event_change();
