-- Story 20-006: provider-neutral billing.
--
-- Three things, each a rule the application could otherwise forget:
--
--   1. A paid plan is entered only through a verified payment. A plan marked
--      `requires_payment` cannot be written onto a household's subscription
--      from a household session at all — only by the server, applying a
--      verified provider event. Every plan starts unmarked, so nothing changes
--      until a deployment actually sells a plan.
--   2. One open checkout per household and plan. A retry — a double tap, a
--      timeout, a redeploy mid-request — finds the same intent, and the intent
--      id is the idempotency key the provider sees, so it cannot become a
--      second transaction.
--   3. A provider event is applied once. Its own id is unique per provider,
--      so a redelivery is recorded as a duplicate and changes nothing.

alter table public.plans
  add column requires_payment boolean not null default false;

comment on column public.plans.requires_payment is
  'Whether this plan can only be entered through a verified payment (story 20-006). Off for every plan until a deployment sells it.';

-- When the last billing event was applied, so an older one delivered late
-- cannot rewind the subscription.
alter table public.household_subscriptions
  add column last_billing_event_at timestamptz;

-- The household's own writes may not put it on a plan that needs a payment.
drop policy household_subscriptions_insert_admin on public.household_subscriptions;
drop policy household_subscriptions_update_admin on public.household_subscriptions;

create policy household_subscriptions_insert_admin on public.household_subscriptions for insert
  to authenticated
  with check (
    wh.is_household_admin(household_id)
    and not exists (select 1 from public.plans p where p.key = plan_key and p.requires_payment)
  );

create policy household_subscriptions_update_admin on public.household_subscriptions for update
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (
    wh.is_household_admin(household_id)
    and not exists (select 1 from public.plans p where p.key = plan_key and p.requires_payment)
  );

create table public.billing_intents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  plan_key text not null references public.plans(key),
  provider text not null check (provider ~ '^[a-z][a-z0-9_.-]{1,40}$'),
  status text not null default 'open' check (status in ('open', 'completed', 'expired', 'failed')),
  provider_session_id text check (length(provider_session_id) <= 200),
  checkout_url text check (length(checkout_url) <= 2000),
  expires_at timestamptz,
  created_by_member_id uuid references public.household_members(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_intents_completed_has_time check ((status = 'completed') = (completed_at is not null)),
  constraint billing_intents_url_has_session check (checkout_url is null or provider_session_id is not null)
);

comment on table public.billing_intents is
  'A household''s intent to move to a paid plan (story 20-006). Its id is the idempotency key the billing provider sees, so a retry is never a second transaction.';

-- The rule that makes a retry the same intent.
create unique index billing_intents_one_open_per_plan
  on public.billing_intents (household_id, plan_key)
  where status = 'open';

create index billing_intents_household_idx on public.billing_intents (household_id, created_at desc);

create trigger billing_intents_set_updated_at
  before update on public.billing_intents
  for each row execute function wh.set_updated_at();

alter table public.billing_intents enable row level security;

-- What the household is buying is an Admin's business. Everything after the
-- intent is opened — the session, completing it — is written by the server.
create policy billing_intents_select_admin on public.billing_intents for select
  to authenticated using (wh.is_household_admin(household_id));

create policy billing_intents_insert_admin on public.billing_intents for insert
  to authenticated
  with check (
    wh.is_household_admin(household_id)
    and created_by_member_id = wh.member_id(household_id)
    and status = 'open'
    and provider_session_id is null
    and checkout_url is null
  );

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider ~ '^[a-z][a-z0-9_.-]{1,40}$'),
  provider_event_id text not null check (length(provider_event_id) between 1 and 200),
  household_id uuid not null references public.households(id) on delete cascade,
  event_type text not null check (event_type in
    ('subscription.activated', 'subscription.renewed', 'payment.failed', 'payment.recovered', 'subscription.cancelled')),
  occurred_at timestamptz not null,
  intent_id uuid references public.billing_intents(id) on delete set null,
  applied boolean not null default false,
  -- A closed word about what happened, never provider prose.
  outcome text check (outcome in ('applied', 'ignored_older', 'ignored_other_subscription', 'ignored_no_plan', 'unknown_plan')),
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

comment on table public.billing_events is
  'Every verified billing event, once (story 20-006). Written only by the server; a redelivery is a unique-key no-op.';

create index billing_events_household_idx on public.billing_events (household_id, occurred_at desc);

alter table public.billing_events enable row level security;

-- An Admin can see why their plan changed. Nobody writes from a session.
create policy billing_events_select_admin on public.billing_events for select
  to authenticated using (wh.is_household_admin(household_id));

notify pgrst, 'reload schema';
