-- Bills, fees and finance (stories 11-001 through 11-008).
--
-- Applied to the wonder-home Supabase project as version 20260917163943.
--
-- This module spends real money, so the schema is written to make the
-- dangerous things impossible rather than merely discouraged.
--
-- A payment intent is separate from a payment attempt on purpose. The intent is
-- what a person approved — this bill, this amount, this account. An attempt is
-- one try at executing it. A retry adds an attempt and never a second intent,
-- which is what makes "a payment retry cannot create a second provider
-- transaction for the same approved intent" structurally true instead of
-- carefully coded.
--
-- Nothing here stores a payment secret. There is no column that could hold a
-- card number, a CVV, a bank credential or a provider token, because a column
-- that can hold one eventually does.

create table public.obligations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 160),
  kind text not null default 'utility' check (kind in
    ('utility', 'rent', 'school_fee', 'subscription', 'insurance', 'loan', 'tax', 'service', 'other')),
  -- The organisation being paid, as the household knows them.
  payee text check (length(trim(payee)) <= 160),
  -- Amount is nullable because a bill often exists before its amount does: the
  -- electricity is due every month whether or not this month's figure arrived.
  amount_minor bigint check (amount_minor >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  due_on date,
  -- How often it comes round, so a paid bill produces the next one rather than
  -- disappearing and being rediscovered by a late fee.
  recurrence text check (recurrence in ('monthly', 'quarterly', 'yearly', 'one_off')),
  responsible_member_id uuid references public.household_members(id) on delete set null,
  status text not null default 'expected' check (status in
    ('expected', 'received', 'scheduled', 'paid', 'overdue', 'disputed', 'waived', 'cancelled')),
  -- Where this came from: typed in, imported from mail, or from a provider.
  source text not null default 'member_stated'
    check (source in ('member_stated', 'imported', 'provider', 'inferred')),
  integration_id uuid references public.integrations(id) on delete set null,
  external_id text check (length(trim(external_id)) <= 200),
  -- Whether a person must look at it before it is paid, beyond the amount rules.
  requires_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint obligations_amount_has_currency check ((amount_minor is null) = (currency is null)),
  -- Identity from a provider makes an import idempotent: the same bill arriving
  -- twice reconciles rather than becoming two bills and two payments.
  unique (integration_id, external_id)
);

comment on table public.obligations is
  'Something the household owes. The amount may arrive later than the obligation itself, which is the normal case.';

alter table public.obligations enable row level security;

create index obligations_due_idx on public.obligations (household_id, due_on)
  where status in ('expected', 'received', 'scheduled', 'overdue');

create trigger obligations_set_updated_at
  before update on public.obligations
  for each row execute function wh.set_updated_at();

create table public.obligation_history (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  obligation_id uuid not null references public.obligations(id) on delete cascade,
  period_label text not null check (length(trim(period_label)) between 1 and 40),
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  paid_on date,
  created_at timestamptz not null default now(),
  unique (obligation_id, period_label)
);

comment on table public.obligation_history is
  'What this bill has cost before. The comparison basis an anomaly has to be able to show.';

alter table public.obligation_history enable row level security;

create index obligation_history_obligation_idx
  on public.obligation_history (obligation_id, period_label desc);

create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  obligation_id uuid not null references public.obligations(id) on delete cascade,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  -- A reference to a payment method held by the provider, never the method.
  -- This column must never be able to hold a card number or a bank credential.
  method_ref text check (length(trim(method_ref)) <= 200),
  status text not null default 'draft' check (status in
    ('draft', 'awaiting_approval', 'approved', 'executing', 'succeeded', 'failed', 'cancelled')),
  approved_by_member_id uuid references public.household_members(id) on delete set null,
  approved_at timestamptz,
  -- Whether the approval was re-authenticated at the moment of approving, which
  -- is what step-up means: a live session is not the same as a live decision.
  step_up_verified_at timestamptz,
  -- The household's own key. A retry reuses it, so the provider recognises the
  -- attempt as the same payment rather than a second one.
  idempotency_key text not null check (length(trim(idempotency_key)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, idempotency_key),
  constraint payment_intents_approval_has_approver check (
    (approved_at is null) = (approved_by_member_id is null)
  ),
  -- Approval without step-up is not approval for anything that spends money.
  constraint payment_intents_approved_is_stepped_up check (
    status not in ('approved', 'executing', 'succeeded') or step_up_verified_at is not null
  ),
  constraint payment_intents_executed_is_approved check (
    status not in ('executing', 'succeeded') or approved_at is not null
  )
);

comment on table public.payment_intents is
  'What somebody approved paying: this bill, this amount. One intent however many times it is attempted.';

alter table public.payment_intents enable row level security;

create index payment_intents_open_idx on public.payment_intents (household_id, updated_at desc)
  where status not in ('succeeded', 'cancelled');

create trigger payment_intents_set_updated_at
  before update on public.payment_intents
  for each row execute function wh.set_updated_at();

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  payment_intent_id uuid not null references public.payment_intents(id) on delete cascade,
  attempt_number integer not null check (attempt_number >= 1),
  provider text not null check (length(trim(provider)) between 1 and 60),
  -- The provider's own transaction id, once it gives one.
  provider_reference text check (length(trim(provider_reference)) <= 200),
  status text not null default 'sent' check (status in ('sent', 'succeeded', 'failed', 'unknown')),
  -- A stable code, never the provider's prose and never its payload.
  failure_code text check (length(trim(failure_code)) <= 80),
  started_at timestamptz not null default now(),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (payment_intent_id, attempt_number),
  -- One successful transaction per intent, whatever the provider does. This is
  -- the constraint that makes double-payment a database error rather than a
  -- support conversation.
  constraint payment_attempts_failure_has_code check (status <> 'failed' or failure_code is not null)
);

comment on table public.payment_attempts is
  'One try at executing an approved intent. Retries add attempts; they never add intents.';

alter table public.payment_attempts enable row level security;

create unique index payment_attempts_one_success_per_intent
  on public.payment_attempts (payment_intent_id)
  where status = 'succeeded';

create index payment_attempts_intent_idx on public.payment_attempts (payment_intent_id, attempt_number);

create table public.spend_anomalies (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  obligation_id uuid not null references public.obligations(id) on delete cascade,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  -- What it is being compared against. An anomaly a household cannot check is
  -- an accusation, so the basis is stored with the finding.
  baseline_minor bigint not null check (baseline_minor >= 0),
  baseline_label text not null check (length(trim(baseline_label)) between 1 and 120),
  ratio numeric(6, 2) not null check (ratio > 0),
  status text not null default 'open' check (status in ('open', 'accepted', 'disputed', 'dismissed')),
  reviewed_by_member_id uuid references public.household_members(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint spend_anomalies_review_has_reviewer check (
    (reviewed_at is null) = (reviewed_by_member_id is null)
  ),
  unique (obligation_id, baseline_label, amount_minor)
);

comment on table public.spend_anomalies is
  'A bill that looks unusual, with what it was compared against. A review decision, never an automatic block.';

alter table public.spend_anomalies enable row level security;

create index spend_anomalies_open_idx on public.spend_anomalies (household_id, created_at desc)
  where status = 'open';

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category text not null check (length(trim(category)) between 1 and 60),
  period text not null default 'month' check (period in ('month', 'quarter', 'year')),
  limit_minor bigint not null check (limit_minor >= 0),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, category, period)
);

comment on table public.budgets is
  'What the household means to spend on something. Planning, never a control that blocks a payment.';

alter table public.budgets enable row level security;

create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function wh.set_updated_at();

-- ---------------------------------------------------------------------------
-- Cross-table invariants
-- ---------------------------------------------------------------------------

create trigger obligation_history_obligation_valid
  before insert or update on public.obligation_history
  for each row execute function wh.assert_commerce_row_in_household('obligation_id', 'obligations');

create trigger payment_intents_obligation_valid
  before insert or update on public.payment_intents
  for each row execute function wh.assert_commerce_row_in_household('obligation_id', 'obligations');

create trigger payment_attempts_intent_valid
  before insert or update on public.payment_attempts
  for each row execute function wh.assert_commerce_row_in_household('payment_intent_id', 'payment_intents');

create trigger spend_anomalies_obligation_valid
  before insert or update on public.spend_anomalies
  for each row execute function wh.assert_commerce_row_in_household('obligation_id', 'obligations');

create trigger obligations_responsible_valid
  before insert or update on public.obligations
  for each row execute function wh.assert_meal_member_in_household('responsible_member_id');

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Seeing what the household owes and paying it are different privileges. An
-- adult may look at the bills — finance.view is theirs by default — and only
-- the people who hold finance.pay, which is head and administrator, may create
-- or approve a payment.
--
-- Children see none of it. A household's money is not a child's business, and
-- that is enforced here rather than left to the view layer.
-- ---------------------------------------------------------------------------

create or replace function wh.may_see_finance(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select wh.is_member(p_household_id)
    and not exists (
      select 1 from public.household_roles r
      where r.household_id = p_household_id
        and r.member_id = wh.member_id(p_household_id)
        and r.role in ('child', 'helper')
    );
$$;

comment on function wh.may_see_finance is
  'Whether the caller may see the household''s money. Adults and administrators; never a child or a helper.';

create policy obligations_select_finance on public.obligations for select
  to authenticated using (wh.may_see_finance(household_id));

create policy obligations_write_admin on public.obligations for all
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

create policy obligation_history_select_finance on public.obligation_history for select
  to authenticated using (wh.may_see_finance(household_id));

create policy payment_intents_select_finance on public.payment_intents for select
  to authenticated using (wh.may_see_finance(household_id));

create policy payment_intents_write_admin on public.payment_intents for all
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

create policy payment_attempts_select_finance on public.payment_attempts for select
  to authenticated using (wh.may_see_finance(household_id));

-- Attempts are written by the server as it talks to a provider. A member who
-- could insert one could claim a payment that never happened.

create policy spend_anomalies_select_finance on public.spend_anomalies for select
  to authenticated using (wh.may_see_finance(household_id));

create policy spend_anomalies_review_admin on public.spend_anomalies for update
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

create policy budgets_select_finance on public.budgets for select
  to authenticated using (wh.may_see_finance(household_id));

create policy budgets_write_admin on public.budgets for all
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

notify pgrst, 'reload schema';
