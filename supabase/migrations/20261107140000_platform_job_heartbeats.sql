-- Background jobs move to GitHub Actions (the owner, 2026-11-07: "to reduce load
-- on Vercel, transfer processes to GitHub as much as possible").
--
-- One row per background step (`clock.homesend-tidy`, `daily.retention`, …):
-- when the GitHub runner last finished it cleanly. The Vercel side of the same
-- step (the delivery clock, the daily cron, the calendar sync) skips it while
-- that time is fresh and picks it up again by itself once it goes stale, so the
-- cut-over needs no switch and a broken runner never leaves a job undone.
-- The work's own claims (per-household day rows, leases, compare-and-set
-- updates) still decide who does each piece; this only saves Vercel the call.
--
-- Platform-level, no household: counts only in `summary`, never an id or a
-- title. Service role only: RLS on, a deny-all policy for anon and
-- authenticated, and no grant to either.
--
-- Safe in either order: the code treats a missing table as "never ran on
-- GitHub", so Vercel keeps doing everything until this exists and a run lands.

create table if not exists public.platform_job_heartbeats (
  step text primary key check (step ~ '^[a-z][a-z0-9.-]{1,63}$'),
  runner text not null check (runner in ('github', 'vercel', 'manual')),
  last_ok_at timestamptz,
  last_error_at timestamptz,
  last_error text check (last_error is null or char_length(last_error) <= 200),
  run_url text check (run_url is null or run_url ~ '^https://github\.com/'),
  summary jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.platform_job_heartbeats enable row level security;

revoke all on table public.platform_job_heartbeats from anon, authenticated;

drop policy if exists platform_job_heartbeats_no_client_access on public.platform_job_heartbeats;
create policy platform_job_heartbeats_no_client_access
  on public.platform_job_heartbeats for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.platform_job_heartbeats is
  'When each background step last finished on the GitHub runner. Vercel skips a step while it is fresh (packages/core/src/jobs/heartbeat.ts). Service role only; counts, never household data.';
