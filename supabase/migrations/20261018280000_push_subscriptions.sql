-- Push notifications (story 23-015): the devices a member asked WonderHome
-- to reach, and the clock that sends a reminder at its own time.
--
-- 1. push_subscriptions: one row per browser or installed app a member turned
--    push on for. The endpoint and its two keys are what the device's push
--    service gave it; WonderHome holds no other secret about the device. A
--    member sees and removes only their own; only the server sends to them,
--    records the last send and retires a subscription the push service says
--    is gone.
--
-- 2. Every five minutes the database asks the app to deliver what has come
--    due (`/api/v1/notifications/dispatch`), so a reminder set for 7:30 lands
--    at 7:30 rather than whenever somebody next opens the app. The request
--    carries the deployment's cron secret, read from Vault at the moment of
--    the call: until a person stores it as `cron_secret`, the call is refused
--    by the app and nothing happens.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 8 and 100),
  -- "Chrome on Android", so a person can tell their devices apart.
  label text check (label is null or length(label) <= 80),
  created_at timestamptz not null default now(),
  last_sent_at timestamptz,
  failure_count integer not null default 0 check (failure_count >= 0)
);

comment on table public.push_subscriptions is
  'Devices a member turned push notifications on for. Members see and remove their own; only the server sends and updates them.';

create index push_subscriptions_member on public.push_subscriptions (member_id);

alter table public.push_subscriptions enable row level security;

create policy push_subscriptions_select_own on public.push_subscriptions for select
  to authenticated
  using (member_id = wh.member_id(household_id));

create policy push_subscriptions_insert_own on public.push_subscriptions for insert
  to authenticated
  with check (member_id = wh.member_id(household_id));

create policy push_subscriptions_delete_own on public.push_subscriptions for delete
  to authenticated
  using (member_id = wh.member_id(household_id));

-- No update policy: what a device's push service issued is replaced by a new
-- subscription, never edited, and send results are the server's to record.

-- The five-minute delivery clock, where the database offers pg_cron, pg_net
-- and Vault (the hosted project does; a local test database skips it).
do $clock$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_namespace where nspname = 'vault') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    perform cron.schedule(
      'wonderhome-notification-dispatch',
      '*/5 * * * *',
      $job$
        select net.http_post(
          url := 'https://home.wonderapps.biz/api/v1/notifications/dispatch',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 20000
        )
        where exists (select 1 from vault.decrypted_secrets where name = 'cron_secret');
      $job$
    );
  end if;
end
$clock$;
