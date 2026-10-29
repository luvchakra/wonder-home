-- Story 26-022 — subscribe to any calendar by its ICS/webcal share link.
--
-- A household adds a calendar it does not own by its share link, and WonderHome
-- imports that feed's events READ-ONLY into the family calendar, re-syncing
-- periodically. This is different from the free/busy Calendar connector
-- (17-002), which never imports titles: here the person chose this specific
-- feed, so its real event details are imported, read-only, and removed when the
-- feed is removed.
--
-- Design: docs/calendar-subscriptions.md.
--
-- Two additive changes, safe in either deploy order:
--   1. a new `calendar_subscriptions` table (the feed records);
--   2. `family_events.source_subscription_id` (which feed, if any, imported an
--      event) + a partial unique key for idempotent re-sync + restrictive
--      read-only policies so a member can never edit an imported event.
-- On every existing event `source_subscription_id` is null, so the read-only
-- policies are a no-op for today's data and a reader that does not yet know the
-- column keeps working.

-- ---------------------------------------------------------------------------
-- 1. The feed records.
-- ---------------------------------------------------------------------------
create table public.calendar_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by_member_id uuid not null references public.household_members(id),
  name text not null check (length(trim(name)) between 1 and 80),
  -- The normalised https feed URL (webcal:// is normalised to https:// in the
  -- app before it is stored). Never carries credentials.
  url text not null check (length(url) between 8 and 2048),
  -- An optional brand colour-token key (e.g. 'sky', 'rose'); validated in the
  -- app against the theme, kept as text here. Null means the category colour.
  color text check (color is null or length(trim(color)) between 1 and 40),
  -- A feed is either shared with the whole household or personal to the member
  -- who added it. Personal feeds (and their imported events) are seen only by
  -- that member; the imported events carry the matching family_events
  -- visibility so the event RLS enforces it too.
  visibility text not null default 'household' check (visibility in ('household', 'private')),
  owner_member_id uuid references public.household_members(id),
  status text not null default 'active' check (status in ('active', 'error', 'paused')),
  last_sync_at timestamptz,
  -- 'ok' or a closed-word failure reason (e.g. 'link_blocked', 'too_large').
  last_sync_status text check (last_sync_status is null or length(last_sync_status) <= 40),
  -- A household-facing closed-word reason for the last failure, else null.
  last_error text check (last_error is null or length(last_error) <= 200),
  event_count integer not null default 0 check (event_count >= 0),
  -- The delivery clock claims active feeds whose next_sync_at has come.
  next_sync_at timestamptz not null default now(),
  sync_interval_minutes integer not null default 360 check (sync_interval_minutes between 15 and 10080),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A personal feed must name the member it belongs to.
  constraint calendar_subscriptions_private_has_owner
    check (visibility <> 'private' or owner_member_id is not null)
);

comment on table public.calendar_subscriptions is
  'Story 26-022: calendars a household subscribes to by share link (ICS/webcal). Their events are imported read-only into family_events (source_subscription_id) and removed with the feed.';

create index calendar_subscriptions_household_idx
  on public.calendar_subscriptions (household_id);
-- The delivery-clock claim reads active feeds whose next_sync_at has come.
create index calendar_subscriptions_due_idx
  on public.calendar_subscriptions (next_sync_at)
  where status = 'active';
create index calendar_subscriptions_owner_idx
  on public.calendar_subscriptions (household_id, owner_member_id);

create trigger calendar_subscriptions_set_updated_at
  before update on public.calendar_subscriptions
  for each row execute function wh.set_updated_at();

create trigger calendar_subscriptions_member_valid
  before insert or update on public.calendar_subscriptions
  for each row execute function wh.assert_meal_member_in_household('created_by_member_id');

alter table public.calendar_subscriptions enable row level security;

-- A member of the household sees household feeds; a private feed is seen only
-- by its owner. Set forms only (no per-row helper).
create policy calendar_subscriptions_select_member on public.calendar_subscriptions
  for select to authenticated
  using (
    household_id in (select wh.member_households())
    and (
      visibility = 'household'
      or (household_id, owner_member_id) in (select household_id, member_id from wh.my_memberships())
    )
  );

-- An adult of the household manages household feeds; only the owner manages
-- their own private feed.
create policy calendar_subscriptions_write_adult on public.calendar_subscriptions
  for all to authenticated
  using (
    household_id in (select wh.adult_households())
    and (
      visibility = 'household'
      or (household_id, owner_member_id) in (select household_id, member_id from wh.my_memberships())
    )
  )
  with check (
    household_id in (select wh.adult_households())
    and (
      visibility = 'household'
      or (household_id, owner_member_id) in (select household_id, member_id from wh.my_memberships())
    )
  );

-- ---------------------------------------------------------------------------
-- 2. The link from an imported event back to its feed.
-- ---------------------------------------------------------------------------
-- on delete cascade is how "removing a feed removes its events" works: a delete
-- of the subscription removes its imported events in the same statement.
alter table public.family_events
  add column source_subscription_id uuid references public.calendar_subscriptions(id) on delete cascade;

comment on column public.family_events.source_subscription_id is
  'Story 26-022: the calendar subscription that imported this event, else null. Imported events are read-only to members and removed with the feed.';

-- Every foreign key gets an index.
create index family_events_source_subscription_idx
  on public.family_events (source_subscription_id)
  where source_subscription_id is not null;

-- Idempotent re-sync: one imported event per (feed, external_id). external_id
-- is the ICS UID (plus the occurrence date for an expanded recurring series).
create unique index family_events_subscription_uid_key
  on public.family_events (source_subscription_id, external_id)
  where source_subscription_id is not null;

-- Imported events are read-only to members: only the sync (service-role admin
-- client, which bypasses RLS) ever writes them. These RESTRICTIVE policies are
-- AND-ed with the existing permissive ones and are deliberately NOT applied to
-- SELECT, so imported events stay visible under the normal event visibility.
create policy family_events_subscription_no_insert on public.family_events
  as restrictive for insert to authenticated
  with check (source_subscription_id is null);

create policy family_events_subscription_no_update on public.family_events
  as restrictive for update to authenticated
  using (source_subscription_id is null)
  with check (source_subscription_id is null);

create policy family_events_subscription_no_delete on public.family_events
  as restrictive for delete to authenticated
  using (source_subscription_id is null);

-- ---------------------------------------------------------------------------
-- 3. The delivery-clock claim (service role only).
-- ---------------------------------------------------------------------------
-- Claims a bounded batch of active feeds that are due, pushing next_sync_at
-- forward atomically (FOR UPDATE SKIP LOCKED) so two concurrent sync runs never
-- pick the same feed. The web endpoint syncs each returned feed.
create or replace function public.claim_due_calendar_subscriptions(p_limit integer default 25)
returns setof public.calendar_subscriptions
language sql
security definer
set search_path = ''
as $$
  update public.calendar_subscriptions s
  set next_sync_at = now() + make_interval(mins => s.sync_interval_minutes)
  where s.id in (
    select c.id from public.calendar_subscriptions c
    where c.status = 'active' and c.next_sync_at <= now()
    order by c.next_sync_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  returning s.*;
$$;

revoke all on function public.claim_due_calendar_subscriptions(integer) from public;
revoke all on function public.claim_due_calendar_subscriptions(integer) from authenticated;
-- Only the service role (the sync endpoint) claims feeds.
grant execute on function public.claim_due_calendar_subscriptions(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 4. The schedule, where the hosted project offers pg_cron, pg_net and Vault.
-- ---------------------------------------------------------------------------
-- Every 15 minutes the database calls the sync endpoint; the endpoint claims
-- the feeds that are actually due (each feed's own ~6h cadence lives in
-- next_sync_at), so the sweep is cheap when nothing is due. Authorised by the
-- same Bearer cron_secret as the notification dispatch clock; refused until a
-- person stores the secret in Vault.
do $schedule$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_namespace where nspname = 'vault') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule(
      'wonderhome-calendar-subscription-sync',
      '*/15 * * * *',
      $job$
        select net.http_post(
          url := 'https://home.wonderapps.biz/api/v1/calendar/subscriptions/sync',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 30000
        )
        where exists (select 1 from vault.decrypted_secrets where name = 'cron_secret');
      $job$
    );
  end if;
end
$schedule$;
