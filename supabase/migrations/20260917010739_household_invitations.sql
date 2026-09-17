-- Household invitations (story 01-002).
--
-- Applied to the wonder-home Supabase project as version 20260917010739.
--
-- An invitation is a capability: whoever holds the token can join the
-- household, so the token is treated as a credential. Only its SHA-256 digest
-- is stored — a leaked database backup does not hand anyone a working
-- invitation, and the plaintext exists only in the link that was sent.
--
-- Acceptance runs through wh.accept_invitation(). The invitee is not a member
-- of the household yet, so no membership-based policy can let them read the
-- invitation they are accepting; a SECURITY DEFINER function validates the
-- token and creates the membership in one transaction.

create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  invited_by_member_id uuid not null references public.household_members(id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  member_type text not null default 'adult' check (member_type in ('adult', 'helper')),
  role text not null default 'adult' check (role in ('administrator', 'adult', 'helper')),
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  -- SHA-256 of the token. Never the token itself.
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.household_invitations is
  'Pending invitations. Only the token digest is stored; the plaintext lives solely in the link that was sent.';

alter table public.household_invitations enable row level security;

create index household_invitations_household_idx
  on public.household_invitations (household_id, created_at desc);

-- At most one live invitation per email per household: re-inviting supersedes
-- rather than accumulating parallel working tokens.
create unique index household_invitations_one_live_per_email
  on public.household_invitations (household_id, lower(email))
  where revoked_at is null and accepted_at is null;

create trigger household_invitations_set_updated_at
  before update on public.household_invitations
  for each row execute function wh.set_updated_at();

-- Administrators manage invitations for their own household. The invitee never
-- reads this table directly — acceptance goes through the function below.
create policy household_invitations_select_admin
  on public.household_invitations for select
  to authenticated
  using (wh.is_household_admin(household_id));

create policy household_invitations_insert_admin
  on public.household_invitations for insert
  to authenticated
  with check (wh.is_household_admin(household_id));

create policy household_invitations_update_admin
  on public.household_invitations for update
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

-- ---------------------------------------------------------------------------
-- Acceptance
-- ---------------------------------------------------------------------------

create or replace function wh.accept_invitation(p_token_hash text, p_display_name text default null)
returns table (household_id uuid, member_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_invitation public.household_invitations%rowtype;
  v_member_id uuid;
begin
  if v_profile_id is null then
    raise exception 'Authentication required to accept an invitation'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_invitation
  from public.household_invitations i
  where i.token_hash = p_token_hash
  for update;

  -- One message for every unusable token: an invalid token and a revoked one
  -- must be indistinguishable, or the endpoint becomes an oracle.
  if v_invitation.id is null
     or v_invitation.revoked_at is not null
     or v_invitation.accepted_at is not null
     or v_invitation.expires_at <= now() then
    raise exception 'This invitation is no longer valid'
      using errcode = 'invalid_parameter_value';
  end if;

  -- Already a member of this household: accept idempotently rather than
  -- creating a second identity for the same person.
  select m.id into v_member_id
  from public.household_members m
  where m.household_id = v_invitation.household_id
    and m.profile_id = v_profile_id;

  if v_member_id is null then
    insert into public.profiles (id, display_name)
    values (v_profile_id, coalesce(p_display_name, v_invitation.display_name))
    on conflict (id) do nothing;

    insert into public.household_members (household_id, profile_id, member_type, display_name)
    values (
      v_invitation.household_id,
      v_profile_id,
      v_invitation.member_type,
      coalesce(p_display_name, v_invitation.display_name)
    )
    returning id into v_member_id;

    insert into public.household_roles (household_id, member_id, role)
    values (v_invitation.household_id, v_member_id, v_invitation.role)
    on conflict do nothing;
  end if;

  update public.household_invitations
  set accepted_at = now(), accepted_member_id = v_member_id
  where id = v_invitation.id;

  insert into public.audit_events (
    household_id, actor_member_id, actor_profile_id, event_type, target_table, target_id, metadata
  )
  values (
    v_invitation.household_id, v_member_id, v_profile_id, 'invitation.accepted',
    'household_invitations', v_invitation.id, jsonb_build_object('role', v_invitation.role)
  );

  return query select v_invitation.household_id, v_member_id;
end;
$$;

comment on function wh.accept_invitation(text, text) is
  'Validates an invitation token digest and creates the membership in one transaction. The only path by which a non-member joins a household.';

grant execute on function wh.accept_invitation(text, text) to authenticated;

create or replace function public.accept_invitation(p_token_hash text, p_display_name text default null)
returns table (household_id uuid, member_id uuid)
language sql
security invoker
set search_path = ''
as $$
  select household_id, member_id from wh.accept_invitation(p_token_hash, p_display_name);
$$;

revoke execute on function public.accept_invitation(text, text) from public, anon;
grant execute on function public.accept_invitation(text, text) to authenticated;

notify pgrst, 'reload schema';
