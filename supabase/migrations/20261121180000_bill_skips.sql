-- 11-022: recurring bills done properly (the owner, 2026-11-21). "Skip a
-- month" moves a recurring bill past a month nobody pays (a holiday, a
-- waived fee) without recording a payment. Each skip is one row here, so
-- the month reads "Skipped" and is never mistaken for one still to fill in.
-- New table only, so the code runs before or after it: reads find no skips,
-- and Skip says it isn't switched on yet. Who may edit a bill (an Admin) may
-- skip a month.

create table if not exists public.obligation_skips (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  obligation_id uuid not null references public.obligations(id) on delete cascade,
  period_label text not null check (period_label ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  skipped_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (obligation_id, period_label)
);

comment on table public.obligation_skips is
  'Months a recurring bill was skipped (11-022): nothing paid and nothing owed for that period.';

create index if not exists obligation_skips_household_id_idx on public.obligation_skips (household_id);
create index if not exists obligation_skips_skipped_by_member_id_idx on public.obligation_skips (skipped_by_member_id);

alter table public.obligation_skips enable row level security;

drop policy if exists obligation_skips_select on public.obligation_skips;
create policy obligation_skips_select on public.obligation_skips for select
  to authenticated
  using (household_id in (select wh.member_households()));

drop policy if exists obligation_skips_insert on public.obligation_skips;
create policy obligation_skips_insert on public.obligation_skips for insert
  to authenticated
  with check (household_id in (select wh.admin_households()));

drop policy if exists obligation_skips_delete on public.obligation_skips;
create policy obligation_skips_delete on public.obligation_skips for delete
  to authenticated
  using (household_id in (select wh.admin_households()));

grant select, insert, delete on public.obligation_skips to authenticated;

notify pgrst, 'reload schema';
