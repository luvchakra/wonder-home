-- Bills made ahead (backlog 11-010): what a household already knows about a
-- recurring bill's coming periods.
--
-- A recurring bill is one `obligations` row whose due date moves on when it
-- is paid; its paid periods are `obligation_history`. The periods after the
-- current one are worked out from its due date and how often it comes, and
-- shown ahead without being stored. Only what a person says about one of
-- them is kept here — next month's rent is 26,000, say — so the bill takes
-- that amount when it reaches that period. A period paid ahead is a history
-- row, never one of these.
--
-- `obligations.bill_type` keeps which typical bill it is (electricity,
-- rent, a home loan EMI…, `finance/bill-catalog.ts`), so the payees offered
-- for it follow the home's location and HomeTalk knows "the light bill".

create table public.obligation_periods (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  obligation_id uuid not null references public.obligations(id) on delete cascade,
  period_label text not null check (period_label ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (obligation_id, period_label)
);

comment on table public.obligation_periods is
  'An amount a household gave ahead of time for a recurring bill''s coming period (11-010). The bill takes it when it reaches that period.';

create index obligation_periods_household_idx on public.obligation_periods (household_id);

create trigger obligation_periods_set_updated_at
  before update on public.obligation_periods
  for each row execute function wh.set_updated_at();

create trigger obligation_periods_obligation_valid
  before insert or update on public.obligation_periods
  for each row execute function wh.assert_commerce_row_in_household('obligation_id', 'obligations');

alter table public.obligation_periods enable row level security;

-- The same people who see the bills see what is known ahead: an adult or an
-- Admin, never a child or a helper. Set forms, once per statement.
create policy obligation_periods_select_finance on public.obligation_periods for select
  to authenticated
  using (
    household_id in (select wh.member_households())
    and household_id not in (
      select r.household_id
      from public.household_roles r
      where (r.household_id, r.member_id) in (select household_id, member_id from wh.my_memberships())
        and r.role in ('child', 'helper')
    )
  );

create policy obligation_periods_write_admin on public.obligation_periods for all
  to authenticated
  using (household_id in (select wh.admin_households()))
  with check (household_id in (select wh.admin_households()));

revoke all on public.obligation_periods from anon;
grant select, insert, update, delete on public.obligation_periods to authenticated;

alter table public.obligations
  add column if not exists bill_type text check (bill_type is null or bill_type ~ '^[a-z_]{2,40}$');

-- HomeBrain answers from paid periods and amounts known ahead (11-010), so a
-- write to either that went round a service still marks the store stale.
create or replace trigger obligation_history_marks_context_stale
  after insert or update or delete on public.obligation_history
  for each row execute function wh.mark_context_stale();
create or replace trigger obligation_periods_marks_context_stale
  after insert or update or delete on public.obligation_periods
  for each row execute function wh.mark_context_stale();

notify pgrst, 'reload schema';
