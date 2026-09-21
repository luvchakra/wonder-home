-- Household feature flags (story 16-008).
--
-- A platform operator's way to turn an experimental or staged capability on
-- for one household without a code deploy — least-privilege, reason-coded,
-- and audited the same way a subscription change already is (16-005). The
-- flag key is free text rather than a fixed catalog: the set of flags this
-- product actually has changes with the code, and a migration is not the
-- place that set should be pinned.
--
-- A household can see its own flags. What WonderHome has turned on for a
-- family is not staff's business to hide from the family it concerns — the
-- same reasoning that already makes a support-access grant visible to the
-- household it was granted for.

create table public.household_feature_flags (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  flag_key text not null check (flag_key ~ '^[a-z][a-z0-9_.]{1,80}$'),
  enabled boolean not null,
  set_by_profile_id uuid references public.profiles(id) on delete set null,
  reason text not null check (length(trim(reason)) between 10 and 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, flag_key)
);

comment on table public.household_feature_flags is
  'One flag per household per key. Written only by platform staff through the admin client; a household reads its own rows.';

alter table public.household_feature_flags enable row level security;

create index household_feature_flags_household_idx
  on public.household_feature_flags (household_id);

create trigger household_feature_flags_set_updated_at
  before update on public.household_feature_flags
  for each row execute function wh.set_updated_at();

create policy household_feature_flags_select_member on public.household_feature_flags for select
  to authenticated using (wh.is_member(household_id));

notify pgrst, 'reload schema';
