-- Wave 5 (story 14-013), §14 and §15: rate limits, and what happened to
-- every forwarded email.
--
-- §15 Rate limits. A fixed-window counter per (bucket, subject). The bucket
-- is a closed word, e.g. `hometalk.turn`, `homesend.intake`, `ai.model`,
-- `homesend.email`. The subject is whatever the limit is per: a member id,
-- a household id, or an IP hash (never a raw address). One call counts one
-- hit and says whether it is still within the limit. The count is atomic,
-- so concurrent requests cannot both slip under it.
--
-- Access:
--   - Only the server calls it, through the narrow `public.rate_limit_hit`
--     wrapper granted to service_role alone. PostgREST only resolves RPCs in
--     `public`, and `wh` stays unexposed.
--   - The counters table has RLS on and a deny-all policy: no session can
--     read or reset a limit.
--   - Rows older than a day are swept opportunistically by the function
--     itself, and for real by `/platform/retention`.
--
-- §14 Email events. One row per thing that happened to an inbound email
-- delivery. Each row is a closed-word `kind`, an optional latency and an
-- optional count, and never anything from the email itself. The household
-- is null when there is none yet: a bad signature, or no configured
-- receiving address matched. The platform-admin HomeSend metrics count
-- these rows and evaluate the §14 alert conditions over them. The rows are
-- operational telemetry, so members cannot read them and only the service
-- role writes them.

create table public.rate_limit_counters (
  bucket text not null check (bucket ~ '^[a-z][a-z0-9_.]{1,40}$'),
  subject text not null check (length(subject) between 1 and 100),
  window_start timestamptz not null,
  hits integer not null default 0 check (hits >= 0),
  primary key (bucket, subject, window_start)
);

comment on table public.rate_limit_counters is
  'Wave 5 §15: fixed-window request counters per (bucket, subject). Written only through public.rate_limit_hit by the service role; no session can read or reset them.';

alter table public.rate_limit_counters enable row level security;

-- No session may read, write or reset a counter: only the service role,
-- which bypasses RLS, through `public.rate_limit_hit`.
create policy rate_limit_counters_no_client_access
  on public.rate_limit_counters for all
  to anon, authenticated
  using (false)
  with check (false);

create index rate_limit_counters_window on public.rate_limit_counters (window_start);

create or replace function wh.rate_limit_hit(p_bucket text, p_subject text, p_window_seconds integer, p_max integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_hits integer;
begin
  if p_window_seconds < 1 or p_max < 1 then
    raise exception 'rate_limit_hit: window and limit must be positive' using errcode = '22023';
  end if;
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limit_counters as c (bucket, subject, window_start, hits)
  values (p_bucket, p_subject, v_window_start, 1)
  on conflict (bucket, subject, window_start) do update set hits = c.hits + 1
  returning c.hits into v_hits;

  -- Keep the table small without a scheduler: about one call in a hundred
  -- clears windows that ended more than a day ago.
  if random() < 0.01 then
    delete from public.rate_limit_counters where window_start < now() - interval '1 day';
  end if;

  return v_hits <= p_max;
end;
$$;

comment on function wh.rate_limit_hit(text, text, integer, integer) is
  'Counts one hit for (bucket, subject) in the current fixed window and returns whether it is still within p_max.';

create or replace function public.rate_limit_hit(p_bucket text, p_subject text, p_window_seconds integer, p_max integer)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select wh.rate_limit_hit(p_bucket, p_subject, p_window_seconds, p_max);
$$;

revoke execute on function wh.rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;
revoke execute on function public.rate_limit_hit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, text, integer, integer) to service_role;

create table public.homesend_email_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete cascade,
  kind text not null check (kind in (
    'delivered',
    'signature_failed',
    'unrouted',
    'duplicate',
    'fetch_failed',
    'attachment_failed',
    'attachment_too_large',
    'classification_failed',
    'processed',
    'rate_limited',
    'retry_queued'
  )),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  count integer check (count is null or count >= 0),
  created_at timestamptz not null default now()
);

comment on table public.homesend_email_events is
  'Wave 5 §14: one closed-word row per thing that happened to an inbound email delivery. Never any content. Null household when none was resolved (bad signature, no matching address). Service-role only.';

alter table public.homesend_email_events enable row level security;

-- Platform telemetry: members never read or write it; the service role
-- (the webhook, the platform-admin metrics) bypasses RLS.
create policy homesend_email_events_no_client_access
  on public.homesend_email_events for all
  to anon, authenticated
  using (false)
  with check (false);

create index homesend_email_events_created on public.homesend_email_events (created_at);
create index homesend_email_events_kind_created on public.homesend_email_events (kind, created_at);

-- §15 async processing and §16 "provider timeout: persist first and retry
-- where safe". The job queue (20260917020032) has always been there, but
-- nothing could reach it: its claim and complete functions live in `wh`,
-- which PostgREST does not expose. These narrow wrappers are granted to the
-- service role alone, the same shape as `public.autonomy_for`. The first
-- consumer is a HomeSend item whose classification failed because the
-- provider was down or timed out. The item itself is already kept; the job
-- asks for it to be read again later.
create or replace function public.claim_jobs(p_worker_id text, p_limit integer default 10, p_lease_seconds integer default 60)
returns setof public.jobs
language sql
security definer
set search_path = ''
as $$
  select * from wh.claim_jobs(p_worker_id, p_limit, p_lease_seconds);
$$;

create or replace function public.complete_job(p_job_id uuid, p_error text default null)
returns public.jobs
language sql
security definer
set search_path = ''
as $$
  select * from wh.complete_job(p_job_id, p_error);
$$;

revoke execute on function public.claim_jobs(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.complete_job(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_jobs(text, integer, integer) to service_role;
grant execute on function public.complete_job(uuid, text) to service_role;

-- §17 A retried request must not run twice, even while the first attempt
-- is still working. The idempotency store now reserves its key before the
-- work runs: a row with status 102 (Processing) and a two-minute expiry.
-- It completes that row with the real response afterwards, or deletes it
-- after a failure so a proper retry can run. Members could only insert
-- and select their household's keys; completing and releasing a
-- reservation needs update and delete on the same rows, and nothing wider.
create policy idempotency_keys_update_member
  on public.idempotency_keys for update
  to authenticated
  using (wh.is_member(household_id))
  with check (wh.is_member(household_id));

create policy idempotency_keys_delete_member
  on public.idempotency_keys for delete
  to authenticated
  using (wh.is_member(household_id));

notify pgrst, 'reload schema';
