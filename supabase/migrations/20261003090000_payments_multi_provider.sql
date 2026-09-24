-- Payments across providers (story 20-009): Razorpay and Stripe behind the
-- one billing port story 20-006 built.
--
-- WonderHome owns the business relationship: plans, prices, subscriptions and
-- entitlements are ours. A provider only moves money, and what it reports
-- arrives through a verified webhook and the pure `applyBillingEvent`.
--
--   1. A price catalogue of our own (`plan_prices`), in major units — 299.00,
--      never 29900 — and a mapping from each price to what a provider calls it
--      (`payment_provider_plans`). A provider's plan or price id is never the
--      source of truth, and the browser never names one.
--   2. A ledger of what providers report: payments, invoices and refunds, each
--      once per provider id. Nothing here holds a card number or a secret.
--   3. The subscription learns who bills it, how often and how much, and
--      whether it ends at the end of the period or moves to another plan then.
--
-- Every new table is readable by the household's Admins and written only by
-- the server. Prices are readable by anyone signed in. Nothing is priced here:
-- the catalogue starts empty, and what a plan costs is a person's decision.

-- 1. The price catalogue --------------------------------------------------

create table public.plan_prices (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null references public.plans(key) on delete cascade,
  billing_interval text not null check (billing_interval in ('month', 'year')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  -- Major units, always (CLAUDE.md rule 22). Minor units exist only inside a
  -- provider adapter, on the way out and on the way back.
  amount numeric(12, 2) not null check (amount >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.plan_prices is
  'What each plan costs, per billing interval and currency (story 20-009). Ours, never a provider''s. Empty until a person prices the plans.';

create unique index plan_prices_one_active
  on public.plan_prices (plan_key, billing_interval, currency)
  where active;

create trigger plan_prices_set_updated_at
  before update on public.plan_prices
  for each row execute function wh.set_updated_at();

alter table public.plan_prices enable row level security;

-- A price is public information to anyone deciding whether to pay it.
create policy plan_prices_select_signed_in on public.plan_prices for select
  to authenticated using (active);

create table public.payment_provider_plans (
  id uuid primary key default gen_random_uuid(),
  plan_price_id uuid not null references public.plan_prices(id) on delete cascade,
  provider text not null check (provider in ('razorpay', 'stripe')),
  -- Razorpay's plan id or Stripe's price id: configuration, never truth.
  provider_plan_ref text not null check (length(provider_plan_ref) between 1 and 200),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_plan_ref)
);

comment on table public.payment_provider_plans is
  'Which provider plan or price backs one of our prices (story 20-009). Server-only: the browser never sees or chooses one.';

create unique index payment_provider_plans_one_active
  on public.payment_provider_plans (plan_price_id, provider)
  where active;

create trigger payment_provider_plans_set_updated_at
  before update on public.payment_provider_plans
  for each row execute function wh.set_updated_at();

alter table public.payment_provider_plans enable row level security;
-- No policy: the service role only.

-- 2. The subscription and the checkout learn their terms -----------------

alter table public.household_subscriptions
  add column provider text check (provider in ('razorpay', 'stripe')),
  add column billing_interval text check (billing_interval in ('month', 'year')),
  add column currency text check (currency ~ '^[A-Z]{3}$'),
  add column amount numeric(12, 2) check (amount >= 0),
  -- Cancelled at the provider for the end of the period: the plan stays until then.
  add column cancel_at_period_end boolean not null default false,
  -- A downgrade waits for the end of the paid period, then this plan starts.
  add column scheduled_plan_key text references public.plans(key);

comment on column public.household_subscriptions.cancel_at_period_end is
  'The paid plan ends at current_period_end and the household moves to free then (story 20-009). Nothing is removed before.';
comment on column public.household_subscriptions.scheduled_plan_key is
  'The plan a downgrade moves to at current_period_end (story 20-009).';

alter table public.billing_intents
  add column plan_price_id uuid references public.plan_prices(id),
  add column billing_interval text check (billing_interval in ('month', 'year')),
  add column currency text check (currency ~ '^[A-Z]{3}$');

-- The provider vocabulary on intents and events stays open (a regex), so a
-- future adapter needs no migration; the ledger below names the two we have.

alter table public.billing_events drop constraint billing_events_event_type_check;
alter table public.billing_events add constraint billing_events_event_type_check check (event_type in (
  'subscription.activated', 'subscription.renewed', 'payment.failed', 'payment.recovered', 'subscription.cancelled',
  'subscription.cancel_scheduled', 'payment.succeeded', 'payment.attempt_failed', 'refund.succeeded', 'refund.failed'
));

alter table public.billing_events drop constraint billing_events_outcome_check;
alter table public.billing_events add constraint billing_events_outcome_check check (outcome in (
  'applied', 'ignored_older', 'ignored_other_subscription', 'ignored_no_plan', 'unknown_plan', 'recorded'
));

-- 3. What providers reported: the ledger ----------------------------------

create table public.payment_customers (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  provider text not null check (provider in ('razorpay', 'stripe')),
  provider_customer_id text not null check (length(provider_customer_id) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (provider, provider_customer_id),
  unique (household_id, provider)
);

comment on table public.payment_customers is
  'The household as each provider knows it (story 20-009). One provider''s customer is never used with another.';

alter table public.payment_customers enable row level security;

create policy payment_customers_select_admin on public.payment_customers for select
  to authenticated using (wh.is_household_admin(household_id));

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  provider text not null check (provider in ('razorpay', 'stripe')),
  provider_payment_id text not null check (length(provider_payment_id) between 1 and 200),
  provider_order_ref text check (length(provider_order_ref) <= 200),
  subscription_ref text check (length(subscription_ref) <= 200),
  intent_id uuid references public.billing_intents(id) on delete set null,
  plan_key text references public.plans(key),
  amount numeric(12, 2) check (amount >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in (
    'created', 'requires_action', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded'
  )),
  -- The provider's own code, never its prose (which can carry personal data).
  failure_code text check (failure_code ~ '^[A-Za-z0-9_.-]{1,80}$'),
  -- A closed word for how the customer paid, and the last four digits at most.
  method text check (method in ('card', 'upi', 'netbanking', 'wallet', 'emi', 'bank_transfer', 'other')),
  method_last4 text check (method_last4 ~ '^[0-9]{4}$'),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id)
);

comment on table public.payments is
  'Every payment a provider reported (story 20-009), once per provider id, in major units. No card number, no secret.';

create index payments_household_idx on public.payments (household_id, created_at desc);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function wh.set_updated_at();

alter table public.payments enable row level security;

create policy payments_select_admin on public.payments for select
  to authenticated using (wh.is_household_admin(household_id));

create table public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  provider text not null check (provider in ('razorpay', 'stripe')),
  provider_invoice_id text not null check (length(provider_invoice_id) between 1 and 200),
  payment_id uuid references public.payments(id) on delete set null,
  plan_key text references public.plans(key),
  number text check (length(number) <= 80),
  amount numeric(12, 2) check (amount >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  status text not null check (status in ('paid', 'open', 'void', 'uncollectible')),
  invoice_url text check (invoice_url ~ '^https://'),
  receipt_url text check (receipt_url ~ '^https://'),
  period_start timestamptz,
  period_end timestamptz,
  issued_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_invoice_id)
);

comment on table public.billing_invoices is
  'Invoices and receipts a provider issued (story 20-009), with links to the provider''s own copy.';

create index billing_invoices_household_idx on public.billing_invoices (household_id, issued_at desc);

alter table public.billing_invoices enable row level security;

create policy billing_invoices_select_admin on public.billing_invoices for select
  to authenticated using (wh.is_household_admin(household_id));

create table public.payment_refunds (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  provider text not null check (provider in ('razorpay', 'stripe')),
  provider_refund_id text check (length(provider_refund_id) between 1 and 200),
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed', 'cancelled')),
  reason text check (reason in ('requested_by_customer', 'duplicate', 'service_issue', 'other')),
  requested_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint payment_refunds_completed_has_time check ((status = 'succeeded') = (completed_at is not null))
);

comment on table public.payment_refunds is
  'Refunds, pending until the provider confirms them (story 20-009). A refund is never marked done because an API call returned.';

create unique index payment_refunds_provider_id on public.payment_refunds (provider, provider_refund_id) where provider_refund_id is not null;
create index payment_refunds_payment_idx on public.payment_refunds (payment_id);

alter table public.payment_refunds enable row level security;

create policy payment_refunds_select_admin on public.payment_refunds for select
  to authenticated using (wh.is_household_admin(household_id));

notify pgrst, 'reload schema';
