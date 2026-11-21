-- 11-026: split a bill between adults (the owner, 2026-11-21). Each adult's
-- share is kept in basis points (100.00% = 10000), so it fits every month's
-- amount; the money each owes is worked out from the amount, adding up to it
-- exactly. Nothing is paid between people. New table only, so the code runs
-- before or after it: reads find no split, and saving one says it isn't
-- switched on yet. Who may edit a bill (an Admin) may split it.

create table if not exists public.obligation_shares (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  obligation_id uuid not null references public.obligations(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  basis_points integer not null check (basis_points between 1 and 10000),
  created_at timestamptz not null default now(),
  unique (obligation_id, member_id)
);

comment on table public.obligation_shares is
  'How a bill is split between adults (11-026), as basis points that add up to 10000 per bill.';

create index if not exists obligation_shares_household_id_idx on public.obligation_shares (household_id);
create index if not exists obligation_shares_member_id_idx on public.obligation_shares (member_id);

-- A share is only ever for someone in the bill's own household.
create or replace function wh.assert_share_member_in_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid;
begin
  select household_id into v_household from public.household_members where id = new.member_id;
  if v_household is distinct from new.household_id then
    raise exception 'Member % is not part of household %', new.member_id, new.household_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists obligation_shares_member_in_household on public.obligation_shares;
create trigger obligation_shares_member_in_household
  before insert or update on public.obligation_shares
  for each row execute function wh.assert_share_member_in_household();

alter table public.obligation_shares enable row level security;

drop policy if exists obligation_shares_select on public.obligation_shares;
create policy obligation_shares_select on public.obligation_shares for select
  to authenticated
  using (household_id in (select wh.member_households()));

drop policy if exists obligation_shares_insert on public.obligation_shares;
create policy obligation_shares_insert on public.obligation_shares for insert
  to authenticated
  with check (household_id in (select wh.admin_households()));

drop policy if exists obligation_shares_delete on public.obligation_shares;
create policy obligation_shares_delete on public.obligation_shares for delete
  to authenticated
  using (household_id in (select wh.admin_households()));

grant select, insert, delete on public.obligation_shares to authenticated;

notify pgrst, 'reload schema';
