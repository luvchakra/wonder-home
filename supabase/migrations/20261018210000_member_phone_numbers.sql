-- Story 01-011: a phone number for every member, and sign-in by phone.
--
-- Every member can have a phone number on record: an adult, a child, and a
-- househelper especially, who may have no email at all and will mostly use
-- WonderHome from a phone. An Admin records it in the member's details
-- (Family), next to the sign-in email.
--
-- When someone signs in by phone (a one-time code by SMS, Supabase Auth) and
-- Supabase has verified the number is theirs, they become the member recorded
-- with that number: the account is linked to the member row the household
-- already keeps, with the role it already has. Exactly as for email
-- (wh.claim_members_by_email): only a verified number links, a removed member
-- stays removed, and nothing here grants anything their role does not.
--
-- The number is stored in E.164 (+919876543210), so a match never depends on
-- spaces or a leading 0. Admins, the member themselves and the household's
-- adults read it (an adult needs the helper's number to call her); only an
-- Admin writes it.

create table public.household_member_phones (
  member_id uuid primary key references public.household_members(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  set_by_member_id uuid references public.household_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, phone)
);

comment on table public.household_member_phones is
  'A member''s phone number, E.164. A verified phone sign-in with this number links the account to the member (wh.claim_members_by_phone). Admins, the member and the household''s adults read it; Admins write it.';

create index household_member_phones_phone on public.household_member_phones (phone);

create trigger household_member_phones_set_updated_at
  before update on public.household_member_phones
  for each row execute function wh.set_updated_at();

alter table public.household_member_phones enable row level security;

create policy household_member_phones_select_admin_self_or_adult on public.household_member_phones for select
  to authenticated using (
    wh.is_household_admin(household_id)
    or member_id = wh.member_id(household_id)
    or exists (
      select 1 from public.household_members me
      where me.id = wh.member_id(household_member_phones.household_id)
        and me.member_type = 'adult'
    )
  );

create policy household_member_phones_insert_admin on public.household_member_phones for insert
  to authenticated
  with check (
    wh.is_household_admin(household_id)
    and exists (select 1 from public.household_members m where m.id = member_id and m.household_id = household_member_phones.household_id)
  );

create policy household_member_phones_update_admin on public.household_member_phones for update
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (
    wh.is_household_admin(household_id)
    and exists (select 1 from public.household_members m where m.id = member_id and m.household_id = household_member_phones.household_id)
  );

create policy household_member_phones_delete_admin on public.household_member_phones for delete
  to authenticated using (wh.is_household_admin(household_id));

revoke all on public.household_member_phones from anon;

-- Linking on sign-in --------------------------------------------------------

create or replace function wh.claim_members_by_phone()
returns table (household_id uuid, member_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_phone text;
  v_row record;
begin
  if v_profile_id is null then
    return;
  end if;

  -- The verified number only. Supabase keeps it as digits without the "+".
  select '+' || regexp_replace(u.phone, '[^0-9]', '', 'g') into v_phone
  from auth.users u
  where u.id = v_profile_id and u.phone_confirmed_at is not null and coalesce(u.phone, '') <> '';

  if v_phone is null or v_phone !~ '^\+[1-9][0-9]{7,14}$' then
    return;
  end if;

  for v_row in
    select p.member_id, p.household_id, m.display_name
    from public.household_member_phones p
    join public.household_members m on m.id = p.member_id and m.household_id = p.household_id
    where p.phone = v_phone
      and m.profile_id is null
      -- A member who was removed stays removed; signing in does not bring them back.
      and m.status in ('active', 'invited')
      -- Someone already in this household as another member is not linked twice.
      and not exists (
        select 1 from public.household_members x
        where x.household_id = p.household_id and x.profile_id = v_profile_id
      )
    for update of m
  loop
    insert into public.profiles (id, display_name)
    values (v_profile_id, v_row.display_name)
    on conflict (id) do nothing;

    update public.household_members m
    set profile_id = v_profile_id, status = 'active'
    where m.id = v_row.member_id and m.profile_id is null;

    insert into public.household_roles (household_id, member_id, role)
    select v_row.household_id, v_row.member_id, m.member_type
    from public.household_members m
    where m.id = v_row.member_id
      and not exists (select 1 from public.household_roles r where r.member_id = v_row.member_id)
    on conflict do nothing;

    update public.household_invitations i
    set accepted_at = now(), accepted_member_id = v_row.member_id
    where i.member_id = v_row.member_id and i.accepted_at is null and i.revoked_at is null;

    insert into public.audit_events (
      household_id, actor_member_id, actor_profile_id, event_type, target_table, target_id, metadata
    )
    values (
      v_row.household_id, v_row.member_id, v_profile_id, 'member.signed_in_by_phone',
      'household_members', v_row.member_id, jsonb_build_object('via', 'phone_match')
    );

    household_id := v_row.household_id;
    member_id := v_row.member_id;
    return next;
  end loop;
end;
$$;

comment on function wh.claim_members_by_phone() is
  'Links the signed-in account to every unlinked, active member whose recorded phone number equals the account''s verified phone. The member keeps the role the household gave them.';

revoke all on function wh.claim_members_by_phone() from public;
grant execute on function wh.claim_members_by_phone() to authenticated;

create or replace function public.claim_members_by_phone()
returns table (household_id uuid, member_id uuid)
language sql
security invoker
set search_path = ''
as $$
  select household_id, member_id from wh.claim_members_by_phone();
$$;

revoke execute on function public.claim_members_by_phone() from public, anon;
grant execute on function public.claim_members_by_phone() to authenticated;
