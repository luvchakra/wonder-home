-- The wonderapps.biz dashboard role (`wonderapps_dashboard`) keeps its
-- read-only policy on the tables it reports on, but never on the table that
-- holds a household's AI provider keys. The owner decided this on 2026-10-18.
--
-- The role and its policies were created outside this repository, so every
-- statement is guarded: on a database without the role (local, CI) this is a
-- no-op.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'wonderapps_dashboard') then
    execute 'drop policy if exists wonderapps_dashboard_read on public.household_ai_credentials';
    execute 'revoke all on public.household_ai_credentials from wonderapps_dashboard';
  end if;
end
$$;
