-- SEC-13: pg_net leaves the public schema (advisor `extension_in_public`).
--
-- pg_net is not relocatable, so it is dropped and created again in
-- `extensions`. Its functions live in the `net` schema either way, so the
-- cron jobs that call `net.http_post(...)` (notification dispatch, calendar
-- subscription sync) keep working unchanged. Only the extension's own
-- bookkeeping (the in-flight request queue and response log) is reset, which
-- is disposable. Safe in either order: it does nothing where pg_net is
-- absent or already outside public, and earlier migrations'
-- `create extension if not exists pg_net` no-op once it is in `extensions`.
-- The functions that use `search_path = public, pg_temp` are explicit and not
-- flagged by the advisor; they are left as they are (docs/progress note).

create schema if not exists extensions;

do $$
begin
  if exists (
    select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_net' and n.nspname = 'public'
  ) then
    drop extension pg_net;
    create extension pg_net with schema extensions;
  end if;
end $$;
