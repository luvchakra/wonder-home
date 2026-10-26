-- A household's members see that one of its AI keys stopped working (the
-- owner, 2026-10-26: "show error message in app"). HomeTalk and Settings →
-- AI Assistant read this through the member's own session, so a screen needs
-- no service role. It returns what went wrong and since when — never a key
-- or a fingerprint — and only for a household the caller belongs to.
--
-- Rollback: drop function public.my_household_ai_key_alerts(uuid).

create or replace function public.my_household_ai_key_alerts(p_household_id uuid)
returns table (id uuid, purpose text, provider text, kind text, failures integer, first_seen_at timestamptz, last_seen_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.purpose, a.provider, a.kind, a.failures, a.first_seen_at, a.last_seen_at
  from public.household_ai_key_alerts(p_household_id) a
  where p_household_id in (select wh.member_households());
$$;

revoke all on function public.my_household_ai_key_alerts(uuid) from public, anon;
grant execute on function public.my_household_ai_key_alerts(uuid) to authenticated, service_role;
