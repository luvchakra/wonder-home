-- A household's AI key that stopped working (the owner, 2026-10-26: Gemini
-- ran out of credits and voice stopped with no word to anyone).
--
-- When a provider refuses a key because it is out of credits, out of quota
-- or not valid, the server records it here by the key's fingerprint (a
-- SHA-256 of the key; the key itself is never stored again). The notice pass
-- matches fingerprints to the household's own keys and tells an Admin, by
-- email too; the first successful call with that key resolves it.
--
-- Service role only: no policy grants anyone else a row, and the functions
-- below are callable by service_role alone.
--
-- Rollback: drop the functions and the table, then re-create
-- notifications_source_type_check from 20261021060000_chat_notices.sql
-- (after resolving any open 'ai_key' notifications).

create table public.ai_key_alerts (
  id uuid primary key default gen_random_uuid(),
  key_fingerprint text not null check (key_fingerprint ~ '^[0-9a-f]{64}$'),
  provider text not null check (provider in ('anthropic', 'google', 'openai')),
  kind text not null check (kind in ('out_of_credits', 'quota_exhausted', 'key_rejected')),
  failures integer not null default 1 check (failures > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz
);

comment on table public.ai_key_alerts is
  'A provider refused a key (by its SHA-256 fingerprint): out of credits, out of quota, or not valid. Resolved by the next call that works. Service role only.';

-- One open alert per key; the delivery clock reads recently changed ones.
create unique index ai_key_alerts_open_idx on public.ai_key_alerts (key_fingerprint) where resolved_at is null;
create index ai_key_alerts_last_seen_idx on public.ai_key_alerts (last_seen_at desc);

alter table public.ai_key_alerts enable row level security;
revoke all on public.ai_key_alerts from anon, authenticated;
create policy ai_key_alerts_no_client_access on public.ai_key_alerts for all to anon, authenticated using (false) with check (false);

-- Record a refusal: a new open alert, or one more on the open one.
create or replace function public.record_ai_key_alert(p_fingerprint text, p_provider text, p_kind text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ai_key_alerts (key_fingerprint, provider, kind)
  values (p_fingerprint, p_provider, p_kind)
  on conflict (key_fingerprint) where resolved_at is null
  do update set failures = public.ai_key_alerts.failures + 1,
                last_seen_at = now(),
                -- A plain refusal never hides a clearer one already seen.
                kind = case when public.ai_key_alerts.kind = 'quota_exhausted' then excluded.kind else public.ai_key_alerts.kind end;
$$;

-- A call with the key worked: whatever was open for it is over.
create or replace function public.resolve_ai_key_alert(p_fingerprint text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_key_alerts set resolved_at = now(), last_seen_at = now()
  where key_fingerprint = p_fingerprint and resolved_at is null;
$$;

-- The household's keys that have an open alert: which key, which provider, what went wrong, since when.
create or replace function public.household_ai_key_alerts(p_household_id uuid)
returns table (id uuid, purpose text, provider text, kind text, failures integer, first_seen_at timestamptz, last_seen_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, k.purpose, a.provider, a.kind, a.failures, a.first_seen_at, a.last_seen_at
  from (
    select 'assistant'::text as purpose, c.api_key from public.household_ai_credentials c where c.household_id = p_household_id
    union all
    select 'gemini_voice'::text, v.api_key from public.household_gemini_voice_credentials v where v.household_id = p_household_id
  ) k
  join public.ai_key_alerts a
    on a.key_fingerprint = encode(pg_catalog.sha256(convert_to(k.api_key, 'UTF8')), 'hex')
   and a.resolved_at is null;
$$;

-- Households whose keys' alerts changed since a moment: the delivery clock sweeps these.
create or replace function public.ai_key_alert_households(p_since timestamptz)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with changed as (
    select key_fingerprint from public.ai_key_alerts where last_seen_at >= p_since limit 200
  )
  select c.household_id from public.household_ai_credentials c
    join changed on changed.key_fingerprint = encode(pg_catalog.sha256(convert_to(c.api_key, 'UTF8')), 'hex')
  union
  select v.household_id from public.household_gemini_voice_credentials v
    join changed on changed.key_fingerprint = encode(pg_catalog.sha256(convert_to(v.api_key, 'UTF8')), 'hex');
$$;

revoke all on function public.record_ai_key_alert(text, text, text) from public, anon, authenticated;
revoke all on function public.resolve_ai_key_alert(text) from public, anon, authenticated;
revoke all on function public.household_ai_key_alerts(uuid) from public, anon, authenticated;
revoke all on function public.ai_key_alert_households(timestamptz) from public, anon, authenticated;
grant execute on function public.record_ai_key_alert(text, text, text) to service_role;
grant execute on function public.resolve_ai_key_alert(text) to service_role;
grant execute on function public.household_ai_key_alerts(uuid) to service_role;
grant execute on function public.ai_key_alert_households(timestamptz) to service_role;

alter table public.notifications drop constraint notifications_source_type_check;
alter table public.notifications add constraint notifications_source_type_check
  check (source_type in ('obligation', 'school_item', 'school_day', 'meal', 'grocery_list', 'pet_care_need', 'family_event',
                         'health_appointment', 'health_routine', 'health_checkup', 'approval', 'reminder',
                         'payment', 'payment_refund',
                         'homesend_item', 'event_replies', 'helper_absence', 'grocery_order', 'event_change', 'weather_plan',
                         'goal_checkin', 'chat_thread', 'ai_key',
                         'digest'));
