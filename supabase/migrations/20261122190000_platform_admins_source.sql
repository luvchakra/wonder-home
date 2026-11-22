-- Platform staff from a deployment variable (owner, 2026-11-22).
--
-- WONDERHOME_PLATFORM_ADMINS lists who may open Platform admin by verified
-- email. The server applies it at sign-in and on a person's first request after
-- a start (`platform/admins-variable.ts`). `source` records where a row came
-- from, so the variable only ever changes rows it made: a row added by hand
-- ('manual', every row before this migration) is never touched by it.
--
-- Safe in either order: older code never reads `source`, and every existing row
-- becomes 'manual'. Newer code tolerates the column being absent (it then
-- treats every row as manual and makes no grants).
--
-- No new policy: staff are still provisioned only by the server, never from a
-- browser session (scripts/test-platform-admin-rls.mjs).

alter table public.platform_admins
  add column if not exists source text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.platform_admins'::regclass and conname = 'platform_admins_source_check'
  ) then
    alter table public.platform_admins
      add constraint platform_admins_source_check check (source in ('variable', 'manual'));
  end if;
end $$;

comment on column public.platform_admins.source is
  'Where this staff row came from: ''variable'' (WONDERHOME_PLATFORM_ADMINS, kept in step with it at sign-in) or ''manual'' (added by hand; the variable never changes it).';
