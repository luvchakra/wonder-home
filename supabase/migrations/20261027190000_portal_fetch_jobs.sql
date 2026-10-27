-- Portal fetch job queue (story 08-033).
--
-- The Fly worker pulls work from here rather than being poked directly, so a
-- burst of "Fetch now" taps and the twice-daily schedule are smoothed, retried
-- and capped in one place, and the queue survives a worker restart. An Admin's
-- "Fetch now" enqueues one job; pg_cron enqueues the connected portals twice a
-- day; the worker claims jobs with FOR UPDATE SKIP LOCKED so two workers never
-- take the same one. Jobs are not sensitive (no portal content lives here, only
-- which connection to run and how it went), so a household may read its own.

create table public.portal_fetch_jobs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  integration_id uuid not null references public.integrations (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  reason text check (reason is null or length(trim(reason)) between 1 and 400),
  attempts int not null default 0,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

comment on table public.portal_fetch_jobs is
  'Queue of portal fetches for the Fly worker. Holds which connection to run and how it went, never portal content. A household may read its own jobs; the worker runs them with the service role.';

create index portal_fetch_jobs_pending on public.portal_fetch_jobs (requested_at) where status = 'pending';
create index portal_fetch_jobs_integration on public.portal_fetch_jobs (integration_id);
create index portal_fetch_jobs_household on public.portal_fetch_jobs (household_id);
-- At most one open (pending or running) job per connection.
create unique index portal_fetch_jobs_one_open on public.portal_fetch_jobs (integration_id) where status in ('pending', 'running');

alter table public.portal_fetch_jobs enable row level security;

-- A household may see its own jobs' state; nobody writes directly (enqueue goes
-- through the function below, the worker through the service role).
create policy portal_fetch_jobs_select on public.portal_fetch_jobs for select
  to authenticated
  using (household_id in (select wh.member_households()));

-- An Admin's "Fetch now": enqueue one job for a connection, deduped to any open one.
create or replace function public.enqueue_portal_fetch_job(p_integration_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_job uuid;
begin
  select household_id into v_household from public.integrations where id = p_integration_id;
  if v_household is null or v_household not in (select wh.admin_households()) then
    raise exception 'not permitted';
  end if;
  select id into v_job from public.portal_fetch_jobs
    where integration_id = p_integration_id and status in ('pending', 'running') limit 1;
  if v_job is not null then return v_job; end if;
  insert into public.portal_fetch_jobs (household_id, integration_id) values (v_household, p_integration_id) returning id into v_job;
  return v_job;
end;
$$;

comment on function public.enqueue_portal_fetch_job is 'An Admin enqueues a fetch for one of their connected portals; deduped to the open job.';
revoke all on function public.enqueue_portal_fetch_job(uuid) from public, anon;
grant execute on function public.enqueue_portal_fetch_job(uuid) to authenticated;

-- The worker claims the next pending job. Service role only; SKIP LOCKED so
-- concurrent workers never take the same job.
create or replace function public.claim_portal_fetch_job()
returns table (id uuid, household_id uuid, integration_id uuid, attempts int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  select j.id, j.household_id, j.integration_id, j.attempts into r
    from public.portal_fetch_jobs j
    where j.status = 'pending'
    order by j.requested_at
    for update skip locked
    limit 1;
  if not found then return; end if;
  update public.portal_fetch_jobs
    set status = 'running', started_at = now(), attempts = portal_fetch_jobs.attempts + 1
    where portal_fetch_jobs.id = r.id;
  id := r.id; household_id := r.household_id; integration_id := r.integration_id; attempts := r.attempts + 1;
  return next;
end;
$$;

comment on function public.claim_portal_fetch_job is 'The worker claims the next pending fetch job (service role only, SKIP LOCKED).';
revoke all on function public.claim_portal_fetch_job() from public, anon, authenticated;
grant execute on function public.claim_portal_fetch_job() to service_role;

-- The twice-daily schedule: enqueue every connected portal that has no open job.
-- Runs as owner from pg_cron; service role only otherwise.
create or replace function public.enqueue_all_portal_fetch_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  insert into public.portal_fetch_jobs (household_id, integration_id)
  select i.household_id, i.id
    from public.integrations i
    join public.portal_sessions s on s.integration_id = i.id and s.state = 'connected'
    where i.kind = 'school'
      and not exists (
        select 1 from public.portal_fetch_jobs j where j.integration_id = i.id and j.status in ('pending', 'running')
      );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.enqueue_all_portal_fetch_jobs is 'Enqueue a fetch for every connected portal with no open job (the twice-daily schedule, via pg_cron).';
revoke all on function public.enqueue_all_portal_fetch_jobs() from public, anon, authenticated;
grant execute on function public.enqueue_all_portal_fetch_jobs() to service_role;

notify pgrst, 'reload schema';
