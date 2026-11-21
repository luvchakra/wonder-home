-- 11-024: "Usually paid by autopay" (the owner, 2026-11-21). An Admin marks a
-- bill as one the bank or card pays on its own. On its due date, once its
-- amount is known, the daily pass records it as paid, Checking, with Undo, and
-- tells the bill's owner. WonderHome never pays anything: this only writes
-- down what the household's autopay does. New tables only, so the code runs
-- before or after this: without them no bill is on autopay, and switching it
-- on says it isn't switched on yet.

-- Which bills are paid by autopay: one row per bill, present means on.
create table if not exists public.obligation_autopay (
  obligation_id uuid primary key references public.obligations(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  enabled_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.obligation_autopay is
  'Bills an Admin marked "Usually paid by autopay" (11-024). WonderHome never pays: the daily pass only records the payment, Checking, with Undo.';

create index if not exists obligation_autopay_household_id_idx on public.obligation_autopay (household_id);
create index if not exists obligation_autopay_enabled_by_idx on public.obligation_autopay (enabled_by_member_id);

alter table public.obligation_autopay enable row level security;

drop policy if exists obligation_autopay_select on public.obligation_autopay;
create policy obligation_autopay_select on public.obligation_autopay for select
  to authenticated
  using (household_id in (select wh.member_households()));

drop policy if exists obligation_autopay_insert on public.obligation_autopay;
create policy obligation_autopay_insert on public.obligation_autopay for insert
  to authenticated
  with check (household_id in (select wh.admin_households()));

drop policy if exists obligation_autopay_delete on public.obligation_autopay;
create policy obligation_autopay_delete on public.obligation_autopay for delete
  to authenticated
  using (household_id in (select wh.admin_households()));

grant select, insert, delete on public.obligation_autopay to authenticated;

-- Each period the daily pass marked paid by autopay: one per bill and month,
-- so it is never marked twice. `paid` keeps what the payment replaced, so
-- Undo puts the bill back. Written only by the daily pass (service role); a
-- member may only move it to undone (Undo) through the app.
create table if not exists public.obligation_autopay_runs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  obligation_id uuid not null references public.obligations(id) on delete cascade,
  period_label text not null check (period_label ~ '^\d{4}-\d{2}$'),
  due_on date not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency text not null,
  owner_member_id uuid references public.household_members(id) on delete set null,
  paid jsonb not null default '{}'::jsonb,
  state text not null default 'checking' check (state in ('checking', 'confirmed', 'flagged', 'undone')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  settled_by_member_id uuid references public.household_members(id) on delete set null,
  unique (obligation_id, period_label)
);

comment on table public.obligation_autopay_runs is
  'Periods recorded as paid by autopay (11-024): Checking until a payment message confirms them; Undo puts the bill back.';

create index if not exists obligation_autopay_runs_household_idx on public.obligation_autopay_runs (household_id, created_at desc);
create index if not exists obligation_autopay_runs_owner_idx on public.obligation_autopay_runs (owner_member_id);
create index if not exists obligation_autopay_runs_settled_by_idx on public.obligation_autopay_runs (settled_by_member_id);

alter table public.obligation_autopay_runs enable row level security;

drop policy if exists obligation_autopay_runs_select on public.obligation_autopay_runs;
create policy obligation_autopay_runs_select on public.obligation_autopay_runs for select
  to authenticated
  using (household_id in (select wh.member_households()));

drop policy if exists obligation_autopay_runs_update on public.obligation_autopay_runs;
create policy obligation_autopay_runs_update on public.obligation_autopay_runs for update
  to authenticated
  using (household_id in (select wh.member_households()))
  with check (household_id in (select wh.member_households()) and state = 'undone');

grant select on public.obligation_autopay_runs to authenticated;
grant update (state, settled_at, settled_by_member_id) on public.obligation_autopay_runs to authenticated;

-- The notice "Marked as paid by autopay" is its own source.
alter table public.notifications drop constraint if exists notifications_source_type_check;
alter table public.notifications add constraint notifications_source_type_check
  check (source_type in ('obligation', 'school_item', 'school_day', 'meal', 'grocery_list', 'pet_care_need', 'family_event',
                         'health_appointment', 'health_routine', 'health_checkup', 'approval', 'reminder',
                         'payment', 'payment_refund',
                         'homesend_item', 'event_replies', 'helper_absence', 'grocery_order', 'event_change', 'weather_plan',
                         'goal_checkin', 'chat_thread', 'ai_key', 'autopay',
                         'digest'));

notify pgrst, 'reload schema';
