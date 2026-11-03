-- HomeSend lifecycle (the owner, 2026-11-03: "go, 30-day auto-archive is okay").
--
-- 1. `archived`: a waiting or failed item untouched for 30 days on its
--    household's own calendar is set aside — kept, hidden from the inbox,
--    shown under "Archived" with Restore. Never deleted here; real purge is
--    story 15-013.
-- 2. "Try again" on a failed item: how many times a person asked (capped at
--    five in the app, as the job queue's own cap) and whether a read-again is
--    queued now.
--
-- Safe in either order: the app reads these columns in a query of their own
-- that falls back to "never archived, never retried" while they are missing,
-- and lists `archived` rows only by asking for that status.

alter table public.home_send_items drop constraint if exists home_send_items_status_check;
alter table public.home_send_items add constraint home_send_items_status_check
  check (status in ('received', 'classified', 'routed', 'dismissed', 'undone', 'failed', 'archived'));

alter table public.home_send_items
  add column if not exists archived_at timestamptz,
  add column if not exists archived_from text,
  add column if not exists retry_count integer not null default 0,
  add column if not exists retry_requested_at timestamptz;

alter table public.home_send_items drop constraint if exists home_send_items_archived_from_check;
alter table public.home_send_items add constraint home_send_items_archived_from_check
  check (archived_from is null or archived_from in ('received', 'classified', 'failed'));

-- An archived row says when and from where; nothing else carries either.
alter table public.home_send_items drop constraint if exists home_send_items_archived_consistent;
alter table public.home_send_items add constraint home_send_items_archived_consistent
  check ((status = 'archived') = (archived_at is not null) and (status = 'archived') = (archived_from is not null));

alter table public.home_send_items drop constraint if exists home_send_items_retry_count_check;
alter table public.home_send_items add constraint home_send_items_retry_count_check
  check (retry_count between 0 and 10);

comment on column public.home_send_items.archived_at is 'When the 30-day sweep set it aside. Restore clears it.';
comment on column public.home_send_items.archived_from is 'Where Restore puts it back: received, classified or failed.';
comment on column public.home_send_items.retry_count is 'Times a person asked HomeSend to read a failed item again (the app caps it at 5).';
comment on column public.home_send_items.retry_requested_at is 'Set while a read-again is queued; cleared when it has run.';

-- What the sweep and the inbox filter on: what is still waiting, by when it was last touched.
create index if not exists home_send_items_waiting_touched_idx
  on public.home_send_items (updated_at)
  where status in ('received', 'classified', 'failed');
-- The "Archived" list and its count.
create index if not exists home_send_items_archived_idx
  on public.home_send_items (household_id, created_at desc)
  where status = 'archived';

-- The 30-day archive, for every household, bounded: untouched for 30 days on
-- the household's own calendar (its timezone, not the server's). Idempotent:
-- an archived row is no longer waiting, so a second run moves nothing. Each
-- move is audited. Service role only (the delivery clock).
create or replace function public.archive_stale_home_send_items(p_now timestamptz default now(), p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  moved integer := 0;
begin
  with due as (
    select i.id
    from public.home_send_items i
    join public.households h on h.id = i.household_id
    where i.status in ('received', 'classified', 'failed')
      and i.updated_at < p_now - interval '29 days'
      and (p_now at time zone coalesce(nullif(h.timezone, ''), 'UTC'))::date
        - (i.updated_at at time zone coalesce(nullif(h.timezone, ''), 'UTC'))::date >= 30
    order by i.updated_at
    limit greatest(1, least(coalesce(p_limit, 200), 1000))
    for update of i skip locked
  ),
  archived as (
    update public.home_send_items i
    set archived_from = i.status, status = 'archived', archived_at = p_now, retry_requested_at = null
    from due
    where i.id = due.id
    returning i.id, i.household_id
  ),
  audited as (
    insert into public.audit_events (household_id, event_type, target_table, target_id, metadata)
    select household_id, 'homesend.archived', 'home_send_items', id, '{"after_days": 30}'::jsonb from archived
    returning 1
  )
  select count(*) into moved from audited;
  return moved;
end;
$$;

revoke all on function public.archive_stale_home_send_items(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.archive_stale_home_send_items(timestamptz, integer) to service_role;

comment on function public.archive_stale_home_send_items(timestamptz, integer) is
  'HomeSend 30-day archive: waiting/failed items untouched for 30 days on the household''s calendar become archived (kept, restorable). Bounded, idempotent, service role only.';
