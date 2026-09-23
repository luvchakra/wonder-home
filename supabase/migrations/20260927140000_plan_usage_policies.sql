-- Story 20-007: fair-use and burst policies, as plan data.
--
-- A plan feature can now say two more things, both optional:
--   * a burst policy — at most `burst_limit` uses per fixed
--     `burst_window_seconds` window — for the short spike a script or a
--     stuck client makes;
--   * a fair-use level — `fair_use_limit` uses in the period, past which the
--     household is not refused but served more cheaply (HomeTalk answers
--     from its own rules instead of a model, and says so).
-- Neither is ever hard-coded in a domain module; the entitlement service
-- reads them from here. Every plan starts with neither, so nothing changes
-- until platform staff set one — and every change they make is kept.

alter table public.plan_features
  add column burst_limit integer,
  add column burst_window_seconds integer,
  add column fair_use_limit bigint,
  add constraint plan_features_burst_is_whole check ((burst_limit is null) = (burst_window_seconds is null)),
  add constraint plan_features_burst_positive check (burst_limit is null or (burst_limit > 0 and burst_window_seconds between 10 and 86400)),
  add constraint plan_features_fair_use_positive check (fair_use_limit is null or fair_use_limit > 0),
  add constraint plan_features_fair_use_within_limit check (fair_use_limit is null or limit_per_period is null or fair_use_limit <= limit_per_period);

comment on column public.plan_features.fair_use_limit is
  'Uses in the period past which the household is served more cheaply, never refused (story 20-007).';

-- Who changed a plan's usage policy, when, why, and from what to what.
-- Platform-level rather than household-scoped: a plan belongs to no one
-- household. Append-only, written by the server, read by platform staff.
create table public.plan_policy_events (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null references public.plans(key),
  feature_key text not null check (feature_key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  actor_profile_id uuid references public.profiles(id) on delete set null,
  reason_code text not null check (reason_code ~ '^[a-z][a-z0-9_]{1,40}$'),
  before jsonb not null,
  after jsonb not null,
  created_at timestamptz not null default now()
);

comment on table public.plan_policy_events is
  'Every change to a plan feature''s burst or fair-use policy (story 20-007). Append-only; server-written.';

create index plan_policy_events_plan_idx on public.plan_policy_events (plan_key, created_at desc);

alter table public.plan_policy_events enable row level security;
-- No policies: only the service role reads or writes it.

notify pgrst, 'reload schema';
