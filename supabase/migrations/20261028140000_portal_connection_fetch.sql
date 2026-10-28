-- Portal fetch, keyed by a connection (Connections framework, slice 3).
--
-- Slice 1/2 gave a household generic, named connections. The portal engine
-- (scrape URLs, persisted session, idempotency cursors, fetch queue) was built
-- for one school integration; here it learns to run against a browser-automation
-- *connection* instead. Additive: a `connection_id` is added beside the existing
-- `integration_id` (now nullable) so the school flow keeps working while any
-- feature can fetch a connection. Adults manage a connection's pages (connections
-- are adult-managed); the worker reads the connection's secret with the service
-- role, exactly as it read the school sign-in.

-- 1. Scrape URLs ---------------------------------------------------------------
alter table public.portal_scrape_urls
  alter column integration_id drop not null,
  add column connection_id uuid references public.connections (id) on delete cascade;

create unique index portal_scrape_urls_connection_url on public.portal_scrape_urls (connection_id, url) where connection_id is not null;
create index portal_scrape_urls_connection on public.portal_scrape_urls (connection_id) where connection_id is not null;

-- An adult manages a connection's pages (the connection row itself is adult-managed).
create policy portal_scrape_urls_insert_connection on public.portal_scrape_urls for insert
  to authenticated
  with check (connection_id is not null and household_id in (select wh.adult_households()));

create policy portal_scrape_urls_update_connection on public.portal_scrape_urls for update
  to authenticated
  using (connection_id is not null and household_id in (select wh.adult_households()))
  with check (connection_id is not null and household_id in (select wh.adult_households()));

create policy portal_scrape_urls_delete_connection on public.portal_scrape_urls for delete
  to authenticated
  using (connection_id is not null and household_id in (select wh.adult_households()));

-- 2. Sessions ------------------------------------------------------------------
alter table public.portal_sessions
  alter column integration_id drop not null,
  add column connection_id uuid references public.connections (id) on delete cascade;

create unique index portal_sessions_connection on public.portal_sessions (connection_id) where connection_id is not null;

-- A connection's state (connected / reconnect_needed / never), for its household's
-- members to see on the Connections page — never the session blob.
create or replace function public.portal_connection_status(p_household_id uuid)
returns table (connection_id uuid, state text, reason text, last_ok_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.connection_id, s.state, s.reason, s.last_ok_at, s.updated_at
  from public.portal_sessions s
  where s.household_id = p_household_id
    and s.connection_id is not null
    and p_household_id in (select wh.member_households());
$$;

comment on function public.portal_connection_status is
  'A household''s connection fetch states (connected / reconnect_needed / never) and why. Member-readable; never returns the session blob.';

revoke all on function public.portal_connection_status(uuid) from public, anon;
grant execute on function public.portal_connection_status(uuid) to authenticated;

-- 3. Cursors -------------------------------------------------------------------
alter table public.portal_fetch_cursors
  alter column integration_id drop not null,
  add column connection_id uuid references public.connections (id) on delete cascade;

create unique index portal_fetch_cursors_connection_unique on public.portal_fetch_cursors (connection_id, scrape_url, item_hash) where connection_id is not null;
create index portal_fetch_cursors_connection_lookup on public.portal_fetch_cursors (connection_id, scrape_url, created_at) where connection_id is not null;

-- 4. Fetch queue ---------------------------------------------------------------
alter table public.portal_fetch_jobs
  alter column integration_id drop not null,
  add column connection_id uuid references public.connections (id) on delete cascade;

create unique index portal_fetch_jobs_connection_one_open on public.portal_fetch_jobs (connection_id)
  where connection_id is not null and status in ('pending', 'running');
create index portal_fetch_jobs_connection on public.portal_fetch_jobs (connection_id) where connection_id is not null;

-- An adult enqueues a fetch for one of their household's connections; deduped to the open job.
create or replace function public.enqueue_connection_fetch_job(p_connection_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
  v_job uuid;
begin
  select household_id into v_household from public.connections where id = p_connection_id;
  if v_household is null or v_household not in (select wh.adult_households()) then
    raise exception 'not permitted';
  end if;
  select id into v_job from public.portal_fetch_jobs
    where connection_id = p_connection_id and status in ('pending', 'running') limit 1;
  if v_job is not null then return v_job; end if;
  insert into public.portal_fetch_jobs (household_id, connection_id) values (v_household, p_connection_id) returning id into v_job;
  return v_job;
end;
$$;

comment on function public.enqueue_connection_fetch_job is 'An adult enqueues a fetch for one of their connections; deduped to the open job.';
revoke all on function public.enqueue_connection_fetch_job(uuid) from public, anon;
grant execute on function public.enqueue_connection_fetch_job(uuid) to authenticated;

-- The worker claims the next pending job; now also returns the connection it is
-- for. The return columns change, so the function is dropped and recreated (a
-- plain create-or-replace cannot change a function's return type).
drop function if exists public.claim_portal_fetch_job();
create function public.claim_portal_fetch_job()
returns table (id uuid, household_id uuid, integration_id uuid, connection_id uuid, attempts int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  select j.id, j.household_id, j.integration_id, j.connection_id, j.attempts into r
    from public.portal_fetch_jobs j
    where j.status = 'pending'
    order by j.requested_at
    for update skip locked
    limit 1;
  if not found then return; end if;
  update public.portal_fetch_jobs
    set status = 'running', started_at = now(), attempts = portal_fetch_jobs.attempts + 1
    where portal_fetch_jobs.id = r.id;
  id := r.id; household_id := r.household_id; integration_id := r.integration_id; connection_id := r.connection_id; attempts := r.attempts + 1;
  return next;
end;
$$;

revoke all on function public.claim_portal_fetch_job() from public, anon, authenticated;
grant execute on function public.claim_portal_fetch_job() to service_role;

-- The twice-daily sweep: enqueue every connected browser-automation connection
-- with no open job (alongside the legacy school integrations).
create or replace function public.enqueue_all_portal_fetch_jobs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
  v_count2 int;
begin
  insert into public.portal_fetch_jobs (household_id, integration_id)
  select i.household_id, i.id
    from public.integrations i
    join public.portal_sessions s on s.integration_id = i.id and s.state = 'connected'
    where i.kind = 'school'
      and not exists (select 1 from public.portal_fetch_jobs j where j.integration_id = i.id and j.status in ('pending', 'running'));
  get diagnostics v_count = row_count;

  insert into public.portal_fetch_jobs (household_id, connection_id)
  select s.household_id, s.connection_id
    from public.portal_sessions s
    join public.connections c on c.id = s.connection_id and c.connector_type = 'browser-automation'
    where s.connection_id is not null and s.state = 'connected'
      and not exists (select 1 from public.portal_fetch_jobs j where j.connection_id = s.connection_id and j.status in ('pending', 'running'));
  get diagnostics v_count2 = row_count;

  return v_count + v_count2;
end;
$$;

notify pgrst, 'reload schema';
