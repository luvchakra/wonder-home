-- Story 20-008: controlled entitlement experiments.
--
-- An experiment changes one plan feature for a share of the households on
-- the plans it names — turning a feature on, off, or giving it a different
-- allowance — without touching the plan itself. Which households are in the
-- treatment is a pure function of the experiment and the household
-- (a stable hash below `treatment_percent`), decided by the one entitlement
-- service, so the same household always lands on the same side and a direct
-- API call meets exactly the answer the screen does.
--
-- Once running, an experiment's terms are frozen: only stopping it changes
-- anything, so who was in which group can always be recomputed afterwards.
-- Stopping removes the override; nothing a household made meanwhile is
-- touched.

create table public.entitlement_experiments (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{2,60}$'),
  feature_key text not null check (feature_key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  -- Staff's own words about what is being tried. Never shown to a household.
  description text not null check (length(trim(description)) between 10 and 300),
  -- The plans whose households take part.
  plan_keys text[] not null check (cardinality(plan_keys) between 1 and 10),
  treatment_percent integer not null check (treatment_percent between 1 and 100),
  -- What the treatment group gets for the feature.
  treatment_enabled boolean not null,
  treatment_limit integer check (treatment_limit is null or treatment_limit >= 0),
  treatment_period text not null default 'month' check (treatment_period in ('day', 'month', 'year', 'forever')),
  status text not null default 'draft' check (status in ('draft', 'running', 'stopped')),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  stopped_at timestamptz,
  constraint entitlement_experiments_started check ((status = 'draft') = (started_at is null)),
  constraint entitlement_experiments_stopped check ((status = 'stopped') = (stopped_at is not null))
);

comment on table public.entitlement_experiments is
  'Controlled entitlement experiments (story 20-008). Server-written; a household reads only the terms of running ones, never the description.';

alter table public.entitlement_experiments enable row level security;

-- The entitlement service reads a running experiment's terms through the
-- member's own session, as it reads the plan itself. Only those columns:
-- staff's description stays staff's.
create policy entitlement_experiments_select_running on public.entitlement_experiments for select
  to authenticated using (status = 'running');

revoke all on public.entitlement_experiments from anon, authenticated;
grant select (key, feature_key, plan_keys, treatment_percent, treatment_enabled, treatment_limit, treatment_period, status)
  on public.entitlement_experiments to authenticated;

-- Terms are frozen once an experiment starts, and it only ever moves
-- draft → running → stopped, so who was in which group can always be
-- recomputed afterwards. Enforced here, whoever writes.
create or replace function wh.entitlement_experiment_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'draft' and (
    new.feature_key is distinct from old.feature_key
    or new.plan_keys is distinct from old.plan_keys
    or new.treatment_percent is distinct from old.treatment_percent
    or new.treatment_enabled is distinct from old.treatment_enabled
    or new.treatment_limit is distinct from old.treatment_limit
    or new.treatment_period is distinct from old.treatment_period
  ) then
    raise exception 'An experiment''s terms cannot change once it has started' using errcode = '23514';
  end if;
  if not (
    new.status = old.status
    or (old.status = 'draft' and new.status = 'running')
    or (old.status = 'running' and new.status = 'stopped')
  ) then
    raise exception 'An experiment moves draft → running → stopped only' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger entitlement_experiments_guard
  before update on public.entitlement_experiments
  for each row execute function wh.entitlement_experiment_guard();

-- Who created, started or stopped an experiment, when and why. Append-only.
create table public.entitlement_experiment_events (
  id uuid primary key default gen_random_uuid(),
  experiment_key text not null references public.entitlement_experiments(key),
  action text not null check (action in ('created', 'started', 'stopped')),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{1,40}$'),
  created_at timestamptz not null default now()
);

comment on table public.entitlement_experiment_events is
  'Every change to an entitlement experiment (story 20-008). Append-only; server-written, staff-read.';

create index entitlement_experiment_events_key_idx on public.entitlement_experiment_events (experiment_key, created_at desc);

alter table public.entitlement_experiment_events enable row level security;

-- Only the service role reads or writes it.
create policy entitlement_experiment_events_no_client_access
  on public.entitlement_experiment_events for all
  to anon, authenticated
  using (false)
  with check (false);

notify pgrst, 'reload schema';
