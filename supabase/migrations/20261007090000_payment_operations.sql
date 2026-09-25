-- Payment operations (story 20-011).
--
-- 1. A payment's outcome reaches the household's Admin as a notification whose
--    source is the ledger row itself, so the notice and the record never
--    disagree about which payment it was.
alter table public.notifications drop constraint notifications_source_type_check;
alter table public.notifications add constraint notifications_source_type_check
  check (source_type in ('obligation', 'school_item', 'school_day', 'meal', 'grocery_list', 'pet_care_need', 'family_event',
                         'health_appointment', 'health_routine', 'health_checkup', 'approval', 'reminder',
                         'payment', 'payment_refund'));

-- 2. Reconciliation: what each run compared, and every difference it found
--    between our ledger and the provider, in closed words. Service-role only:
--    platform staff read it through the server, and no household session can
--    see another household's payments here, or its own through this table.
create table public.billing_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('razorpay', 'stripe')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  checked integer not null default 0 check (checked >= 0),
  matched integer not null default 0 check (matched >= 0),
  differences integer not null default 0 check (differences >= 0),
  unreachable integer not null default 0 check (unreachable >= 0),
  outcome text not null default 'running' check (outcome in ('running', 'completed', 'skipped_not_configured', 'failed'))
);

comment on table public.billing_reconciliation_runs is
  'One pass comparing the payments ledger with a provider (story 20-011). Counts only.';

create table public.billing_reconciliation_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.billing_reconciliation_runs(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  provider text not null check (provider in ('razorpay', 'stripe')),
  kind text not null check (kind in ('missing_at_provider', 'status_mismatch', 'amount_mismatch', 'currency_mismatch')),
  ledger_status text not null,
  provider_status text,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.billing_reconciliation_findings is
  'A difference between our ledger and what the provider reports, in closed words (story 20-011). Never a card detail, never provider prose.';

create index billing_reconciliation_findings_open on public.billing_reconciliation_findings (created_at desc) where resolved_at is null;
create index billing_reconciliation_findings_payment on public.billing_reconciliation_findings (payment_id);
create index billing_reconciliation_runs_started on public.billing_reconciliation_runs (started_at desc);

alter table public.billing_reconciliation_runs enable row level security;
alter table public.billing_reconciliation_findings enable row level security;
revoke all on public.billing_reconciliation_runs from anon, authenticated;
revoke all on public.billing_reconciliation_findings from anon, authenticated;

-- 3. A staff refund names why, in the same closed words a provider refund uses.
comment on column public.payment_refunds.requested_by is
  'The person who asked for the refund: platform staff for a staff refund, null when it was made at the provider.';

notify pgrst, 'reload schema';
