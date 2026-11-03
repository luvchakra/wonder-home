-- HomeSend's daily tidy (the owner, 2026-11-03: "on daily basis check items
-- pending for review and remove the items which don't make sense anymore,
-- based on due date or other info, use ai to decide").
--
-- Nothing is deleted. An item that no longer applies is archived — the status
-- the 30-day sweep already uses (20261103120000) — with a reason, and stays
-- restorable from HomeSend → Archived. The job itself is in the app
-- (`packages/core/src/homesend/tidy-run.ts`), on the delivery clock.
--
-- 1. `archive_reason`: why an item was archived. The 30-day sweep's own
--    reason is `untouched_30_days`; the tidy's are past_date,
--    already_recorded, superseded, cancelled and unreadable. Cleared by a
--    trigger whenever the item leaves `archived`, so Restore needs no change.
-- 2. `archived_from` may be `routed`: the source item of an entry added as
--    Checking whose questions ended unanswered and whose day has passed.
--    Restore puts it back where it was; the entry itself is never touched.
-- 3. `homesend_tidy_runs`: one row per household per day on its own
--    calendar — the day's claim (so the job runs once a day, whichever
--    worker gets there first) and what it set aside, ids and closed words
--    only, for the one summary line in the grouped HomeSend reminder.
--
-- Safe in either order: the job checks for `archive_reason` and does nothing
-- without it; the reminder reads the runs table in a query of its own that is
-- empty while the table is missing; nothing that reads home_send_items
-- selects the new column.

alter table public.home_send_items add column if not exists archive_reason text;

alter table public.home_send_items drop constraint if exists home_send_items_archive_reason_check;
alter table public.home_send_items add constraint home_send_items_archive_reason_check
  check (archive_reason is null or archive_reason in ('untouched_30_days', 'past_date', 'already_recorded', 'superseded', 'cancelled', 'unreadable'));

alter table public.home_send_items drop constraint if exists home_send_items_archived_from_check;
alter table public.home_send_items add constraint home_send_items_archived_from_check
  check (archived_from is null or archived_from in ('received', 'classified', 'failed', 'routed'));

-- A routed item keeps what it routed to while archived, so Restore puts it back whole.
alter table public.home_send_items drop constraint if exists home_send_items_routed_implies_status;
alter table public.home_send_items add constraint home_send_items_routed_implies_status
  check (routed_table is null or status in ('routed', 'undone') or (status = 'archived' and archived_from = 'routed'));

comment on column public.home_send_items.archive_reason is
  'Why it was archived: untouched_30_days (the 30-day sweep), or the daily tidy''s past_date, already_recorded, superseded, cancelled, unreadable. Null when not archived.';

-- Items archived before this migration were archived by the 30-day sweep.
update public.home_send_items set archive_reason = 'untouched_30_days' where status = 'archived' and archive_reason is null;

-- A reason belongs to an archived row only: leaving `archived` (Restore) clears it.
create or replace function wh.clear_home_send_archive_reason()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.status <> 'archived' then
    new.archive_reason := null;
  end if;
  return new;
end;
$$;

drop trigger if exists home_send_items_clear_archive_reason on public.home_send_items;
create trigger home_send_items_clear_archive_reason
  before update of status on public.home_send_items
  for each row execute function wh.clear_home_send_archive_reason();

-- The 30-day sweep, as before, now saying why.
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
    set archived_from = i.status, status = 'archived', archived_at = p_now, archive_reason = 'untouched_30_days', retry_requested_at = null
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

-- One row per household per day on its own calendar.
create table if not exists public.homesend_tidy_runs (
  household_id uuid not null references public.households(id) on delete cascade,
  run_on date not null,
  state text not null default 'running' check (state in ('running', 'done', 'off', 'failed')),
  -- [{ "id": uuid, "reason": text, "by": "rule"|"ai", "memberId": uuid|null }] — ids and closed words, never content.
  archived jsonb not null default '[]'::jsonb check (jsonb_typeof(archived) = 'array'),
  kept integer not null default 0 check (kept >= 0),
  ai_asked integer not null default 0 check (ai_asked >= 0),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  primary key (household_id, run_on)
);

comment on table public.homesend_tidy_runs is
  'HomeSend daily tidy: one row per household per local day (the claim and what it archived, ids and reasons only). Written by the service role; Admins may read their own.';

-- The delivery clock looks up recent days across households.
create index if not exists homesend_tidy_runs_run_on_idx on public.homesend_tidy_runs (run_on);

alter table public.homesend_tidy_runs enable row level security;

drop policy if exists homesend_tidy_runs_admin_read on public.homesend_tidy_runs;
create policy homesend_tidy_runs_admin_read on public.homesend_tidy_runs
  for select to authenticated
  using (household_id in (select wh.admin_households()));

revoke insert, update, delete on public.homesend_tidy_runs from anon, authenticated;
