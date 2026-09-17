-- Platform administration boundary (stories 16-001, 16-002, 16-004).
--
-- Applied to the wonder-home Supabase project as version 20260917014240.
--
-- Platform staff are a separate authorization boundary from household roles.
-- Being Head of Family grants nothing here, and being platform staff grants no
-- household access by itself — the two systems deliberately do not compose.
--
-- Support access is time-boxed, reason-coded and visible to the household it
-- concerns. That last part matters: a family can see who looked at their home
-- and why, which is the difference between support access and surveillance.
--
-- Note what is NOT here: no household RLS policy consults wh.has_support_access().
-- Threading support access through every tenant policy would put a backdoor in
-- all of them, where one mistake reopens every household. Instead the admin
-- surface uses the service-role client and checks the grant explicitly, so the
-- check lives in one reviewable place and every use is audited.

create table public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  role text not null check (role in ('support', 'operator', 'owner')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.platform_admins is
  'Platform staff. A separate authorization boundary from household roles: being Head of Family grants nothing here, and being platform staff grants no household access by itself.';

alter table public.platform_admins enable row level security;

create trigger platform_admins_set_updated_at
  before update on public.platform_admins
  for each row execute function wh.set_updated_at();

create or replace function wh.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.platform_admins a
    where a.profile_id = auth.uid() and a.status = 'active'
  );
$$;

comment on function wh.is_platform_admin() is
  'True for active platform staff. Deliberately unrelated to household membership.';

grant execute on function wh.is_platform_admin() to authenticated;

-- Staff see the roster; anyone else sees only their own row, if they have one.
-- There is no INSERT or UPDATE policy: staff are provisioned out of band, not
-- by anything reachable from a browser session.
create policy platform_admins_select_self_or_staff
  on public.platform_admins for select
  to authenticated
  using (profile_id = auth.uid() or wh.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Support access
-- ---------------------------------------------------------------------------

create table public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  admin_profile_id uuid not null references public.profiles(id) on delete cascade,
  -- A free-text reason alone becomes "investigating"; a code makes the grant
  -- countable and reviewable.
  reason_code text not null check (reason_code in
    ('user_reported_issue', 'billing_dispute', 'data_correction', 'security_investigation', 'legal_request')),
  reason_note text not null check (length(trim(reason_note)) between 10 and 500),
  scope text not null default 'read' check (scope in ('read', 'write')),
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint support_access_grants_bounded check (expires_at > granted_at)
);

comment on table public.support_access_grants is
  'Time-boxed, reason-coded staff access to one household. Readable by that household''s administrators: a family can see who looked at their home and why.';

alter table public.support_access_grants enable row level security;

create index support_access_grants_household_idx
  on public.support_access_grants (household_id, granted_at desc);
create index support_access_grants_admin_idx
  on public.support_access_grants (admin_profile_id);

create or replace function wh.has_support_access(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.support_access_grants g
    join public.platform_admins a on a.profile_id = g.admin_profile_id
    where g.household_id = p_household_id
      and g.admin_profile_id = auth.uid()
      and a.status = 'active'
      and g.revoked_at is null
      and g.expires_at > now()
  );
$$;

comment on function wh.has_support_access(uuid) is
  'True while an unexpired, unrevoked grant exists. Not consulted by household RLS policies: support access is applied in the application layer so it cannot become a silent backdoor in every policy.';

grant execute on function wh.has_support_access(uuid) to authenticated;

create policy support_access_grants_select_household_admin
  on public.support_access_grants for select
  to authenticated
  using (wh.is_household_admin(household_id) or wh.is_platform_admin());

notify pgrst, 'reload schema';
