-- AI key in one place (owner, 2026-11-21): each key alert records where the
-- refused key came from (never anything of the key itself), so Platform admin
-- can say which copy is being refused. Builds on 20261121020000 (superseded
-- alerts, daily re-tell).
--
-- Safe in either order: the code calls the four-argument record function and
-- falls back to the three-argument one when this is not applied yet, and reads
-- key_source only when the column exists.
--
-- Rollback: drop function public.record_ai_key_alert(text, text, text, text);
--           alter table public.ai_key_alerts drop column key_source;

alter table public.ai_key_alerts
  add column if not exists key_source text
    check (key_source is null or key_source in ('platform_saved', 'household', 'household_voice', 'tooling', 'deployment_variable', 'github_secret'));

comment on column public.ai_key_alerts.key_source is
  'Where the refused key came from when it was last refused: saved in Platform admin, a household''s own key or voice key, or a developer''s environment. Never anything of the key.';

create or replace function public.record_ai_key_alert(p_fingerprint text, p_provider text, p_kind text, p_source text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.ai_key_alerts (key_fingerprint, provider, kind, key_source)
  values (p_fingerprint, p_provider, p_kind, p_source)
  on conflict (key_fingerprint) where resolved_at is null
  do update set failures = public.ai_key_alerts.failures + 1,
                last_seen_at = now(),
                key_source = coalesce(excluded.key_source, public.ai_key_alerts.key_source),
                kind = case when public.ai_key_alerts.kind = 'quota_exhausted' then excluded.kind else public.ai_key_alerts.kind end;
$$;

revoke all on function public.record_ai_key_alert(text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_ai_key_alert(text, text, text, text) to service_role;
