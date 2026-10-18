-- Every family member signs in as themselves, matched by the email the
-- household gave them.
--
-- An Admin records a member's sign-in email in their details (Family), next to
-- their date of birth. When someone signs in — email and password, Google or
-- any other provider — with that same email, and Supabase has verified the
-- email belongs to them, they become that member: the account is linked to
-- the member row the household already keeps, with the role it already has
-- (Admin, adult, child, househelper). Nothing about what they may see is
-- decided here; their role does that, exactly as for everyone else.
--
-- Only a verified email links. An address someone merely typed at sign-up,
-- unconfirmed, links nothing, or anyone could claim a seat by typing a
-- family member's address.
--
-- The email is the member's, so only Admins and the member themselves read
-- it; only an Admin writes it.

create table public.household_member_emails (
  member_id uuid primary key references public.household_members(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' and length(email) <= 254),
  set_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, email)
);

comment on table public.household_member_emails is
  'The email a member signs in with. A verified sign-in with this email links the account to the member (wh.claim_members_by_email). Admins and the member read it; Admins write it.';

create index household_member_emails_email on public.household_member_emails (email);

create trigger household_member_emails_set_updated_at
  before update on public.household_member_emails
  for each row execute function wh.set_updated_at();

alter table public.household_member_emails enable row level security;

create policy household_member_emails_select_admin_or_self on public.household_member_emails for select
  to authenticated using (wh.is_household_admin(household_id) or member_id = wh.member_id(household_id));

create policy household_member_emails_insert_admin on public.household_member_emails for insert
  to authenticated
  with check (
    wh.is_household_admin(household_id)
    and exists (select 1 from public.household_members m where m.id = member_id and m.household_id = household_member_emails.household_id)
  );

create policy household_member_emails_update_admin on public.household_member_emails for update
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (
    wh.is_household_admin(household_id)
    and exists (select 1 from public.household_members m where m.id = member_id and m.household_id = household_member_emails.household_id)
  );

create policy household_member_emails_delete_admin on public.household_member_emails for delete
  to authenticated using (wh.is_household_admin(household_id));

-- Linking on sign-in --------------------------------------------------------

create or replace function wh.claim_members_by_email()
returns table (household_id uuid, member_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_email text;
  v_row record;
begin
  if v_profile_id is null then
    return;
  end if;

  -- The verified address only: an unconfirmed sign-up proves nothing.
  select lower(btrim(u.email)) into v_email
  from auth.users u
  where u.id = v_profile_id and u.email_confirmed_at is not null;

  if v_email is null or v_email = '' then
    return;
  end if;

  for v_row in
    select e.member_id, e.household_id, m.display_name
    from public.household_member_emails e
    join public.household_members m on m.id = e.member_id and m.household_id = e.household_id
    where e.email = v_email
      and m.profile_id is null
      -- A member who was removed stays removed; signing in does not bring them back.
      and m.status in ('active', 'invited')
      -- Someone already in this household as another member is not linked twice.
      and not exists (
        select 1 from public.household_members x
        where x.household_id = e.household_id and x.profile_id = v_profile_id
      )
    for update of m
  loop
    insert into public.profiles (id, display_name)
    values (v_profile_id, v_row.display_name)
    on conflict (id) do nothing;

    update public.household_members m
    set profile_id = v_profile_id, status = 'active'
    where m.id = v_row.member_id and m.profile_id is null;

    -- A member recorded without any role gets the one their type means, so a
    -- linked account is never roleless; an existing role is never changed.
    insert into public.household_roles (household_id, member_id, role)
    select v_row.household_id, v_row.member_id, m.member_type
    from public.household_members m
    where m.id = v_row.member_id
      and not exists (select 1 from public.household_roles r where r.member_id = v_row.member_id)
    on conflict do nothing;

    -- An invitation still waiting for this member has done its job.
    update public.household_invitations i
    set accepted_at = now(), accepted_member_id = v_row.member_id
    where i.member_id = v_row.member_id and i.accepted_at is null and i.revoked_at is null;

    insert into public.audit_events (
      household_id, actor_member_id, actor_profile_id, event_type, target_table, target_id, metadata
    )
    values (
      v_row.household_id, v_row.member_id, v_profile_id, 'member.signed_in_by_email',
      'household_members', v_row.member_id, jsonb_build_object('via', 'email_match')
    );

    household_id := v_row.household_id;
    member_id := v_row.member_id;
    return next;
  end loop;
end;
$$;

comment on function wh.claim_members_by_email() is
  'Links the signed-in account to every unlinked, active member whose recorded sign-in email equals the account''s verified email. The member keeps the role the household gave them.';

revoke all on function wh.claim_members_by_email() from public;
grant execute on function wh.claim_members_by_email() to authenticated;

create or replace function public.claim_members_by_email()
returns table (household_id uuid, member_id uuid)
language sql
security invoker
set search_path = ''
as $$
  select household_id, member_id from wh.claim_members_by_email();
$$;

revoke execute on function public.claim_members_by_email() from public, anon;
grant execute on function public.claim_members_by_email() to authenticated;

-- Invitations for a member already on record ---------------------------------
--
-- An invitation that names a member (the Invite button in Family) may be for a
-- child, and may be shared as a link with no email at all. Accepting it links
-- the account to that member with the role they already have — never the
-- invitation's, which would make a child an adult.

alter table public.household_invitations drop constraint if exists household_invitations_member_type_check;
alter table public.household_invitations drop constraint if exists household_invitations_role_check;
alter table public.household_invitations drop constraint if exists household_invitations_email_check;
alter table public.household_invitations alter column email drop not null;

alter table public.household_invitations
  add constraint household_invitations_member_type_check check (member_type in ('adult', 'helper', 'child')),
  add constraint household_invitations_role_check check (role in ('administrator', 'adult', 'helper', 'child')),
  -- A child is only ever invited to the member already on record.
  add constraint household_invitations_child_names_member check (member_type <> 'child' or member_id is not null),
  -- Without a member to claim, an invitation is to an address.
  add constraint household_invitations_email_check check (
    (email is not null and position('@' in email) > 1) or (email is null and member_id is not null)
  );

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
  v_claimed boolean := false;
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

    -- The invitation names a member already on record without a login: the
    -- new account becomes that member, with the role they already have.
    if v_invitation.member_id is not null then
      update public.household_members m
      set profile_id = v_profile_id, status = 'active'
      where m.id = v_invitation.member_id
        and m.household_id = v_invitation.household_id
        and m.profile_id is null
        and m.status in ('active', 'invited')
      returning m.id into v_member_id;
      v_claimed := v_member_id is not null;

      -- The member keeps the role they have. One recorded without any role
      -- gets the invitation's, so a linked account is never roleless.
      if v_claimed and not exists (select 1 from public.household_roles r where r.member_id = v_member_id) then
        insert into public.household_roles (household_id, member_id, role)
        values (v_invitation.household_id, v_member_id, v_invitation.role)
        on conflict do nothing;
      end if;
    end if;

    if v_member_id is null then
      -- A child is never created by an invitation: a child invitation whose
      -- member is gone or already linked is no longer usable.
      if v_invitation.member_type = 'child' then
        raise exception 'This invitation is no longer valid'
          using errcode = 'invalid_parameter_value';
      end if;

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
  end if;

  update public.household_invitations
  set accepted_at = now(), accepted_member_id = v_member_id
  where id = v_invitation.id;

  insert into public.audit_events (
    household_id, actor_member_id, actor_profile_id, event_type, target_table, target_id, metadata
  )
  values (
    v_invitation.household_id, v_member_id, v_profile_id, 'invitation.accepted',
    'household_invitations', v_invitation.id,
    jsonb_build_object('role', v_invitation.role, 'claimed', v_claimed)
  );

  return query select v_invitation.household_id, v_member_id;
end;
$$;

comment on function wh.accept_invitation(text, text) is
  'Validates an invitation token digest and creates the membership in one transaction — or, when the invitation names an unlinked member, links the new account to that member with the role they already have. Never creates a child.';

notify pgrst, 'reload schema';
