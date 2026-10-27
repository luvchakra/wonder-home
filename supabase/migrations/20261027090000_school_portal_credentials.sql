-- A connected school portal's sign-in, stored securely (story 08-032).
--
-- Some school portals have no API: a parent signs in with a username and
-- password (Loop Learning is one). To read a child's homework, exams and
-- notices, WonderHome keeps that sign-in — the same way the household's own
-- model and speech keys are kept: a table with NO select policy at all, so
-- nothing reachable from a browser can read it back, not even the household
-- that set it. The server reads it with the service role to run the connector,
-- and nothing else can. Writing is an administrator's act; a status function
-- says only that a portal is connected and as whom, never the password.
--
-- No portal is live yet. Storing a sign-in connects the account; the working
-- fetch is added once the portal's own endpoints are known (CLAUDE.md governs
-- when a provider goes live). A school portal is read-only and never an
-- authorization channel.

create table public.school_portal_credentials (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  integration_id uuid not null unique references public.integrations (id) on delete cascade,
  portal_url text not null check (length(trim(portal_url)) between 1 and 2048),
  username text not null check (length(trim(username)) between 1 and 320),
  password text not null check (length(password) between 1 and 1024),
  set_by_member_id uuid references public.household_members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.school_portal_credentials is
  'A connected school portal''s sign-in (url, username, password). Deliberately has NO select policy: the server reads it with the service role to run the connector; nothing reachable from a browser can read it at all. Never an authorization channel.';

create index school_portal_credentials_household on public.school_portal_credentials (household_id);

create trigger school_portal_credentials_set_updated_at
  before update on public.school_portal_credentials
  for each row execute function wh.set_updated_at();

create trigger school_portal_credentials_member_valid
  before insert or update on public.school_portal_credentials
  for each row execute function wh.assert_meal_member_in_household('set_by_member_id');

alter table public.school_portal_credentials enable row level security;

-- Writing is an administrator's act (the same pattern as household_ai_credentials
-- and 20261017180100). The password is never readable: select is revoked on the
-- table and granted back only on the non-secret columns, so an update's WHERE
-- still works but the password never leaves the server.
create policy school_portal_credentials_write_admin on public.school_portal_credentials for all
  to authenticated
  using (household_id in (select wh.admin_households()))
  with check (household_id in (select wh.admin_households()));

revoke select on public.school_portal_credentials from authenticated, anon;
grant select (id, household_id, integration_id, portal_url, username, set_by_member_id, created_at, updated_at)
  on public.school_portal_credentials to authenticated;

-- Which of a household's school portals have a stored sign-in, and as whom —
-- never the password. The same bargain voice_credential_status strikes.
create or replace function public.school_portal_credential_status(p_household_id uuid)
returns table (integration_id uuid, portal_url text, username text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.integration_id, c.portal_url, c.username, c.updated_at
  from public.school_portal_credentials c
  where c.household_id = p_household_id
    and p_household_id in (select wh.admin_households());
$$;

comment on function public.school_portal_credential_status is
  'Which of a household''s school portals have a stored sign-in, and as whom. Admin only; never returns the password.';

revoke all on function public.school_portal_credential_status(uuid) from public, anon;
grant execute on function public.school_portal_credential_status(uuid) to authenticated;

notify pgrst, 'reload schema';
