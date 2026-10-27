-- Story 08-033 — the twice-daily portal fetch schedule.
--
-- enqueue_all_portal_fetch_jobs() (prior migration) puts one job on the queue
-- for every connected portal that has no open job; the Fly worker drains the
-- queue. Running it on a schedule is what the Connect-school UI promises when it
-- says "let WonderHome check twice a day". pg_cron runs in the database on one
-- clock, so it fires once regardless of how many worker machines are up and
-- survives a worker restart — unlike a setInterval inside the worker.
--
-- Times are UTC. 01:30 and 13:30 UTC are roughly 07:00 and 19:00 IST: a morning
-- and an evening sweep. The enqueue function is idempotent, so a household that
-- already has an open job is skipped.
do $schedule$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'wonderhome-portal-fetch-morning',
      '30 1 * * *',
      $job$ select public.enqueue_all_portal_fetch_jobs(); $job$
    );
    perform cron.schedule(
      'wonderhome-portal-fetch-evening',
      '30 13 * * *',
      $job$ select public.enqueue_all_portal_fetch_jobs(); $job$
    );
  end if;
end
$schedule$;
