-- The delivery clock moves to GitHub Actions (owner, 2026-11-23: "i thought this process is resource intensive,
-- can we move these jobs to GitHub instead"). GitHub's own schedule is best-effort (runs land hours apart), so the
-- database keeps the time: every 5 minutes pg_cron asks the GitHub API to run `delivery-clock.yml`, which delivers
-- what is due and writes a heartbeat per step. Vercel's dispatch tick (`wonderhome-notification-dispatch`, kept)
-- skips every step whose heartbeat is fresh and takes over by itself when it goes stale.
--
-- Safe without the token: until the owner saves a fine-grained token (this repository only, Actions: Read and
-- write) as the Vault secret `github_dispatch_token`, the function returns 'no-token' and sends nothing, and Vercel
-- keeps doing all of it. Safe on a database without Vault or pg_net (a local test database): the function compiles
-- (its Vault and pg_net calls are dynamic) and answers 'no-vault' or 'no-net'; the schedule is made only where
-- pg_cron exists. The token is read at call time and never logged; pg_net keeps its request log for 6 hours, and
-- that log is readable only by the database owner.

create or replace function wh.trigger_delivery_clock()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if to_regclass('vault.decrypted_secrets') is null then
    return 'no-vault';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'net' and p.proname = 'http_post'
  ) then
    return 'no-net';
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1 limit 1'
    into v_token
    using 'github_dispatch_token';
  if v_token is null or btrim(v_token) = '' then
    return 'no-token';
  end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
    using
      'https://api.github.com/repos/luvchakra/wonder-home/actions/workflows/delivery-clock.yml/dispatches',
      jsonb_build_object('ref', 'main'),
      jsonb_build_object(
        'Accept', 'application/vnd.github+json',
        'Authorization', 'Bearer ' || btrim(v_token),
        'Content-Type', 'application/json',
        'User-Agent', 'wonderhome-delivery-clock',
        'X-GitHub-Api-Version', '2022-11-28'
      ),
      10000;
  return 'dispatched';
end;
$$;

comment on function wh.trigger_delivery_clock() is
  'Every 5 minutes (pg_cron wonderhome-delivery-clock-github): asks GitHub to run delivery-clock.yml with the Vault secret github_dispatch_token. Returns no-vault, no-net or no-token and sends nothing when one is missing; Vercel then keeps delivering.';

revoke execute on function wh.trigger_delivery_clock() from public, anon, authenticated, service_role;

-- The schedule, where the hosted project offers pg_cron (a local test database skips it). Re-running replaces it.
do $clock$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('wonderhome-delivery-clock-github', '*/5 * * * *', 'select wh.trigger_delivery_clock();');
  end if;
end
$clock$;
