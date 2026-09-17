-- Durable background work (ADR-007).
--
-- Applied to the wonder-home Supabase project as version 20260917020032.
--
-- The outcome engine must evaluate whether outcomes are on track, notifications
-- must be delivered at a useful moment rather than the moment of the event, and
-- the agent loop must act over time. All of that needs work that survives a
-- restart and happens without a request.
--
-- Jobs live in the same database as the rows they act on, so a job and its
-- effects commit together: a job cannot claim to have done something the
-- database never recorded.
--
-- household_id is nullable here, unlike every other tenant table: some work is
-- genuinely platform-wide (expiring idempotency keys, for instance). The RLS
-- policy below only ever exposes household-scoped rows, so a platform job is
-- invisible to every household rather than visible to all of them.

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  kind text not null check (kind ~ '^[a-z][a-z0-9_.]{1,60}$'),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'succeeded', 'failed', 'dead')),
  run_after timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts >= 1),
  claimed_at timestamptz,
  -- The lease. A worker that dies mid-job leaves this in the past, and the job
  -- becomes claimable again rather than being stuck forever.
  claimed_until timestamptz,
  last_error text,
  -- Lets a caller say "only one of these should be pending at a time".
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.jobs is
  'Durable background work. Claimed with FOR UPDATE SKIP LOCKED so concurrent workers never take the same job.';

alter table public.jobs enable row level security;

create index jobs_claimable_idx on public.jobs (run_after) where status = 'pending';
create index jobs_reclaim_idx on public.jobs (claimed_until) where status = 'claimed';
create index jobs_household_idx on public.jobs (household_id, created_at desc);

create unique index jobs_dedupe_pending_idx
  on public.jobs (household_id, kind, dedupe_key)
  where dedupe_key is not null and status in ('pending', 'claimed');

create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function wh.set_updated_at();

-- Administrators can see their own household's queued work. Nobody writes jobs
-- from a browser: enqueueing happens server-side through the service role, so a
-- client cannot schedule work for itself or anyone else.
create policy jobs_select_household_admin
  on public.jobs for select
  to authenticated
  using (household_id is not null and wh.is_household_admin(household_id));

-- ---------------------------------------------------------------------------
-- Claiming
-- ---------------------------------------------------------------------------

create or replace function wh.claim_jobs(
  p_worker_id text,
  p_limit integer default 10,
  p_lease_seconds integer default 60
)
returns setof public.jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with claimable as (
    select j.id from public.jobs j
    where (j.status = 'pending' and j.run_after <= now())
       -- An expired lease means the worker holding it is gone.
       or (j.status = 'claimed' and j.claimed_until < now())
    order by j.run_after
    limit greatest(p_limit, 1)
    for update skip locked
  )
  update public.jobs j
  set status = 'claimed',
      attempts = j.attempts + 1,
      claimed_at = now(),
      claimed_until = now() + make_interval(secs => greatest(p_lease_seconds, 5)),
      last_error = case when j.status = 'claimed' then 'lease expired; reclaimed' else j.last_error end
  from claimable c
  where j.id = c.id
  returning j.*;
end;
$$;

comment on function wh.claim_jobs(text, integer, integer) is
  'Atomically claims due jobs and expired leases. SKIP LOCKED means concurrent workers take disjoint sets.';

create or replace function wh.complete_job(p_job_id uuid, p_error text default null)
returns public.jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs;
begin
  select * into v_job from public.jobs where id = p_job_id for update;
  if v_job.id is null then
    raise exception 'No such job %', p_job_id using errcode = 'no_data_found';
  end if;

  if p_error is null then
    update public.jobs
    set status = 'succeeded', claimed_until = null, last_error = null
    where id = p_job_id
    returning * into v_job;

  elsif v_job.attempts >= v_job.max_attempts then
    -- Out of attempts: park it rather than retrying forever, so a permanently
    -- broken job is visible instead of being a silent hot loop.
    update public.jobs
    set status = 'dead', claimed_until = null, last_error = left(p_error, 500)
    where id = p_job_id
    returning * into v_job;

  else
    -- Exponential backoff, capped at an hour.
    update public.jobs
    set status = 'pending',
        claimed_until = null,
        last_error = left(p_error, 500),
        run_after = now() + make_interval(secs => least(power(2, v_job.attempts)::integer * 15, 3600))
    where id = p_job_id
    returning * into v_job;
  end if;

  return v_job;
end;
$$;

comment on function wh.complete_job(uuid, text) is
  'Marks a job done, or schedules a retry with exponential backoff, or gives up and marks it dead once max_attempts is spent.';

notify pgrst, 'reload schema';
