-- Plans, entitlements, usage metering and the connector framework
-- (stories 20-001, 20-002, 20-003 and 17-001; see ADR-008 for why these land
-- ahead of the domains that use them).
--
-- Applied to the wonder-home Supabase project as version 20260917141455.
--
-- Two rules shape everything below.
--
-- Entitlements are data, not code. A plan's features live in rows so that
-- adding a capability or changing a limit is a migration, never an `if` in a
-- domain module. Individual modules ask one service; they never know what a
-- plan costs or what tier someone is on.
--
-- A connector never holds a secret. `credential_ref` names where the credential
-- lives — a secret manager key — and the value itself never reaches this
-- database, because a table that can hold a provider token eventually does.

create table public.plans (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null check (length(trim(name)) between 1 and 60),
  description text check (length(trim(description)) <= 300),
  -- Ordering for presentation only; entitlement never compares plans by rank,
  -- because "higher plan implies more features" is an assumption that breaks
  -- the first time a plan is tailored for one customer.
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.plans is
  'The plan catalogue. Platform-level rather than household-scoped: a plan exists whether or not anyone is on it.';

alter table public.plans enable row level security;

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function wh.set_updated_at();

create table public.plan_features (
  plan_key text not null references public.plans(key) on delete cascade,
  feature_key text not null check (feature_key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  enabled boolean not null default true,
  -- Null means unlimited. Zero means the feature is listed but unusable, which
  -- is different from absent: absent says "not part of this plan", zero says
  -- "you have used your allowance".
  limit_per_period integer check (limit_per_period >= 0),
  period text not null default 'month' check (period in ('day', 'month', 'year', 'forever')),
  created_at timestamptz not null default now(),
  primary key (plan_key, feature_key)
);

comment on table public.plan_features is
  'What each plan allows, as data. A domain module never hard-codes a plan name or a limit.';

alter table public.plan_features enable row level security;

create table public.household_subscriptions (
  household_id uuid primary key references public.households(id) on delete cascade,
  plan_key text not null references public.plans(key),
  status text not null default 'active'
    check (status in ('active', 'past_due', 'cancelled', 'paused')),
  current_period_start timestamptz not null default date_trunc('month', now()),
  current_period_end timestamptz,
  -- The billing provider's identifier, so the provider can be replaced without
  -- the household's own record changing shape.
  external_ref text check (length(trim(external_ref)) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_subscriptions_period_ordered check (
    current_period_end is null or current_period_start < current_period_end
  )
);

comment on table public.household_subscriptions is
  'Which plan a household is on. One row per household: a household has exactly one plan at a time.';

alter table public.household_subscriptions enable row level security;

create trigger household_subscriptions_set_updated_at
  before update on public.household_subscriptions
  for each row execute function wh.set_updated_at();

create table public.usage_counters (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  feature_key text not null check (feature_key ~ '^[a-z][a-z0-9_.]{1,60}$'),
  period_start timestamptz not null,
  used bigint not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  -- The uniqueness that makes the counter atomic: one row per household,
  -- feature and period, incremented with ON CONFLICT rather than read-modify-write.
  unique (household_id, feature_key, period_start)
);

comment on table public.usage_counters is
  'How much of a metered feature a household has used this period. Counts only — never what was said, asked or generated.';

alter table public.usage_counters enable row level security;

create index usage_counters_household_idx on public.usage_counters (household_id, period_start desc);

-- ---------------------------------------------------------------------------
-- Atomic metering
--
-- Concurrent requests must not be able to spend the same allowance twice, so
-- the increment and the limit check happen in one statement inside the
-- database. A read followed by a write in application code is exactly the race
-- this avoids.
-- ---------------------------------------------------------------------------

create or replace function wh.record_usage(
  p_household_id uuid,
  p_feature_key text,
  p_period_start timestamptz,
  p_amount integer default 1,
  p_limit integer default null
)
returns table (used bigint, allowed boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used bigint;
begin
  if p_amount < 0 then
    raise exception 'Usage cannot be negative' using errcode = 'check_violation';
  end if;

  insert into public.usage_counters (household_id, feature_key, period_start, used)
  values (p_household_id, p_feature_key, p_period_start, p_amount)
  on conflict (household_id, feature_key, period_start)
  do update set used = public.usage_counters.used + p_amount, updated_at = now()
  returning public.usage_counters.used into v_used;

  -- The caller is told whether this particular increment stayed within the
  -- allowance. Recording it either way keeps the count honest: a request that
  -- went over still happened, and hiding that would make the meter useless.
  return query select v_used, (p_limit is null or v_used <= p_limit);
end;
$$;

comment on function wh.record_usage is
  'Increments a usage counter and reports whether the allowance still holds, in one atomic statement.';

-- ---------------------------------------------------------------------------
-- Connector framework (17-001)
-- ---------------------------------------------------------------------------

create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  kind text not null check (kind in
    ('school', 'commerce', 'calendar', 'email', 'messaging', 'weather', 'smart_home', 'payment')),
  provider text not null check (provider ~ '^[a-z][a-z0-9_.-]{1,60}$'),
  status text not null default 'not_connected' check (status in
    ('not_connected', 'connecting', 'connected', 'degraded', 'error', 'revoked')),
  scopes text[] not null default '{}',
  -- Where the credential lives, never the credential. A row here is safe to
  -- read in a support session; a token would not be.
  credential_ref text check (length(trim(credential_ref)) <= 200),
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error_code text check (length(trim(last_error_code)) <= 80),
  last_error_at timestamptz,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One connection per provider per household: two would race each other's
  -- cursors and double-import everything they touch.
  unique (household_id, kind, provider),
  constraint integrations_error_has_code check (
    status <> 'error' or last_error_code is not null
  )
);

comment on table public.integrations is
  'A household''s connection to one provider. Holds where a credential lives, never the credential itself.';

alter table public.integrations enable row level security;

create index integrations_household_idx on public.integrations (household_id, kind);

create trigger integrations_set_updated_at
  before update on public.integrations
  for each row execute function wh.set_updated_at();

create table public.integration_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  -- The provider's own identifier for the thing. This plus the integration is
  -- what makes an import idempotent: the same item arriving twice reconciles
  -- onto one canonical row rather than creating a second.
  external_id text not null check (length(trim(external_id)) between 1 and 200),
  event_type text not null check (length(trim(event_type)) between 1 and 80),
  -- A hash rather than the payload: enough to notice the content changed,
  -- without keeping a copy of a child's homework or a family's mail.
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received'
    check (status in ('received', 'processed', 'ignored', 'failed')),
  error_code text check (length(trim(error_code)) <= 80),
  unique (integration_id, external_id, payload_hash)
);

comment on table public.integration_events is
  'What a provider sent and whether it was processed. Identity and a content hash only, never the payload.';

alter table public.integration_events enable row level security;

create index integration_events_pending_idx on public.integration_events (household_id, received_at desc)
  where status = 'received';

-- ---------------------------------------------------------------------------
-- Seed the catalogue
--
-- Free, Pro and Max as the backlog names them. The rows are the specification:
-- changing what a plan allows is a migration, and it is reviewable as a diff.
-- ---------------------------------------------------------------------------

insert into public.plans (key, name, description, sort_order) values
  ('free', 'Free', 'The household basics, with WonderHome watching quietly.', 0),
  ('pro', 'Pro', 'The full household: school, commerce, meals, bills and family time.', 1),
  ('max', 'Max', 'Everything, with autonomous action and deeper integrations.', 2);

insert into public.plan_features (plan_key, feature_key, enabled, limit_per_period, period) values
  -- Free: the outcome engine, notifications and conversation, with a small
  -- allowance of AI work. Nothing that spends money or reaches a provider.
  ('free', 'household.outcomes', true, null, 'forever'),
  ('free', 'household.notifications', true, null, 'forever'),
  ('free', 'home.maintenance', true, null, 'forever'),
  ('free', 'conversation.text', true, 200, 'month'),
  ('free', 'ai.agent_runs', true, 20, 'month'),

  ('pro', 'household.outcomes', true, null, 'forever'),
  ('pro', 'household.notifications', true, null, 'forever'),
  ('pro', 'home.maintenance', true, null, 'forever'),
  ('pro', 'conversation.text', true, 2000, 'month'),
  ('pro', 'conversation.voice', true, 500, 'month'),
  ('pro', 'ai.agent_runs', true, 500, 'month'),
  ('pro', 'school.connector', true, null, 'forever'),
  ('pro', 'commerce.orders', true, 100, 'month'),
  ('pro', 'meals.planning', true, null, 'forever'),
  ('pro', 'finance.bills', true, null, 'forever'),
  ('pro', 'family.events', true, null, 'forever'),
  ('pro', 'home.weather', true, null, 'forever'),

  ('max', 'household.outcomes', true, null, 'forever'),
  ('max', 'household.notifications', true, null, 'forever'),
  ('max', 'home.maintenance', true, null, 'forever'),
  ('max', 'conversation.text', true, null, 'forever'),
  ('max', 'conversation.voice', true, null, 'forever'),
  ('max', 'ai.agent_runs', true, null, 'forever'),
  ('max', 'school.connector', true, null, 'forever'),
  ('max', 'commerce.orders', true, null, 'forever'),
  ('max', 'meals.planning', true, null, 'forever'),
  ('max', 'finance.bills', true, null, 'forever'),
  ('max', 'family.events', true, null, 'forever'),
  ('max', 'home.weather', true, null, 'forever'),
  ('max', 'ai.autonomous_action', true, null, 'forever'),
  ('max', 'integrations.deep', true, null, 'forever');

-- ---------------------------------------------------------------------------
-- Row level security
--
-- The catalogue is readable by anyone signed in: a household has to be able to
-- see what it could upgrade to. Nothing about plans is writable from a session
-- — the platform boundary owns that.
--
-- A household reads its own subscription and usage and writes neither. Usage is
-- recorded by the server through wh.record_usage, because a member who could
-- write the counter could reset it.
-- ---------------------------------------------------------------------------

create policy plans_select_authenticated on public.plans for select
  to authenticated using (active);

create policy plan_features_select_authenticated on public.plan_features for select
  to authenticated using (true);

create policy household_subscriptions_select_member on public.household_subscriptions for select
  to authenticated using (wh.is_member(household_id));

create policy usage_counters_select_member on public.usage_counters for select
  to authenticated using (wh.is_member(household_id));

create policy integrations_select_member on public.integrations for select
  to authenticated using (wh.is_member(household_id));

create policy integrations_write_admin on public.integrations for all
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

create policy integration_events_select_admin on public.integration_events for select
  to authenticated using (wh.is_household_admin(household_id));

-- Deliberately no member-writable policy on plans, plan_features,
-- household_subscriptions, usage_counters or integration_events: a household
-- that could grant itself a plan, reset a meter or forge a provider event has
-- no entitlement system at all.

notify pgrst, 'reload schema';
