-- The assistant never quietly runs without its model (2026-11-21).
--
-- 1. HomeSend: something sent in while the provider refused the key or could
--    not be reached is not "unknown content". It is kept as failed with the
--    reason 'model_unavailable', retried until a model reads it, and never
--    asked about or set aside meanwhile (homesend/model-unavailable.ts).
-- 2. AI key alerts: an alert for a key nobody uses any more (not a platform
--    secret, not a household's key) is closed as superseded, so a replaced key
--    leaves no stale warning on the platform admin Overview; an alert closed
--    by a call that worked says so.
--
-- Safe in either order with the code: the code writes 'model_unavailable'
-- and falls back to the old "unknown" reading when this constraint refuses it
-- (23514); old code never writes it. The new column is nullable and only read
-- when present; the new function is called best-effort.
--
-- Rollback: update public.home_send_items set status = 'classified', failure_reason = null,
-- classified_kind = 'unknown' where failure_reason = 'model_unavailable'; then restore the previous
-- failure_reason check (20260924090000_homesend_multimodal_intake.sql), drop function
-- public.supersede_ai_key_alerts(text[]), alter table public.ai_key_alerts drop column resolved_reason, and
-- re-create resolve_ai_key_alert from 20261026130000_ai_key_alerts.sql.

-- The column's check was declared inline (named by Postgres); drop whichever check lists the reasons.
do $$
declare
  v_name text;
begin
  for v_name in
    select con.conname from pg_constraint con
     where con.conrelid = 'public.home_send_items'::regclass and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%transcription_failed%'
  loop
    execute format('alter table public.home_send_items drop constraint %I', v_name);
  end loop;
end
$$;
alter table public.home_send_items add constraint home_send_items_failure_reason_check
  check (failure_reason in (
    'security_rejected', 'unsupported_type', 'unreadable', 'too_large',
    'link_blocked', 'link_unreachable', 'transcription_unavailable', 'transcription_failed',
    'model_unavailable'
  ));

-- The retry sweep reads these: few rows, by household, newest first.
create index if not exists home_send_items_model_unavailable_idx
  on public.home_send_items (household_id, created_at desc)
  where failure_reason = 'model_unavailable';

alter table public.ai_key_alerts
  add column if not exists resolved_reason text check (resolved_reason is null or resolved_reason in ('worked', 'superseded'));

comment on column public.ai_key_alerts.resolved_reason is
  'Why it closed: a call with the key worked, or the key is no longer used by the platform or any household (superseded).';

create or replace function public.resolve_ai_key_alert(p_fingerprint text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.ai_key_alerts set resolved_at = now(), last_seen_at = now(), resolved_reason = 'worked'
  where key_fingerprint = p_fingerprint and resolved_at is null;
$$;

-- Close open alerts whose key is neither one of the platform's current secrets (p_keep, their
-- fingerprints, computed by the server from the values in use) nor any household's own key.
create or replace function public.supersede_ai_key_alerts(p_keep text[])
returns integer
language sql
security definer
set search_path = ''
as $$
  with closed as (
    update public.ai_key_alerts a
       set resolved_at = now(), resolved_reason = 'superseded'
     where a.resolved_at is null
       and not (a.key_fingerprint = any (coalesce(p_keep, '{}'::text[])))
       and not exists (
         select 1 from public.household_ai_credentials c
          where encode(pg_catalog.sha256(convert_to(c.api_key, 'UTF8')), 'hex') = a.key_fingerprint)
       and not exists (
         select 1 from public.household_gemini_voice_credentials v
          where encode(pg_catalog.sha256(convert_to(v.api_key, 'UTF8')), 'hex') = a.key_fingerprint)
       and not exists (
         select 1 from public.household_voice_credentials s
          where encode(pg_catalog.sha256(convert_to(s.api_key, 'UTF8')), 'hex') = a.key_fingerprint)
    returning 1
  )
  select count(*)::integer from closed;
$$;

revoke all on function public.supersede_ai_key_alerts(text[]) from public, anon, authenticated;
grant execute on function public.supersede_ai_key_alerts(text[]) to service_role;
revoke all on function public.resolve_ai_key_alert(text) from public, anon, authenticated;
grant execute on function public.resolve_ai_key_alert(text) to service_role;
