-- Guardian-controlled child profiles (story 01-004).
--
-- Applied to the wonder-home Supabase project as version 20260917011744.
--
-- A child is a member of the household without being an account holder:
-- household_members.profile_id stays null, so nothing about representing a
-- child in the system requires that child to have an email address, a password
-- or a session. Guardianship is a separate link rather than an attribute, since
-- a child can have several guardians and a guardian several children.
--
-- Age-based permissions are deliberately NOT stored. They are derived from
-- date_of_birth whenever they are asked for (packages/core/src/identity/age.ts),
-- which is what makes "age changes trigger re-evaluation" true by construction:
-- there is no cached band to go stale.

create table public.member_guardians (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_member_id uuid not null references public.household_members(id) on delete cascade,
  guardian_member_id uuid not null references public.household_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (child_member_id, guardian_member_id),
  constraint member_guardians_not_self check (child_member_id <> guardian_member_id)
);

comment on table public.member_guardians is
  'Which adults are responsible for which child. A child needs no account of their own to be represented here.';

alter table public.member_guardians enable row level security;

create index member_guardians_child_idx on public.member_guardians (child_member_id);
create index member_guardians_guardian_idx on public.member_guardians (guardian_member_id);

-- Both ends of the link must be in the household the row claims.
create or replace function wh.assert_guardian_pair_same_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_child uuid;
  v_guardian uuid;
begin
  select household_id into v_child from public.household_members where id = new.child_member_id;
  select household_id into v_guardian from public.household_members where id = new.guardian_member_id;

  if v_child is distinct from new.household_id or v_guardian is distinct from new.household_id then
    raise exception 'Guardian and child must belong to household %', new.household_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger member_guardians_same_household
  before insert or update on public.member_guardians
  for each row execute function wh.assert_guardian_pair_same_household();

create policy member_guardians_select_member
  on public.member_guardians for select
  to authenticated
  using (wh.is_member(household_id));

create policy member_guardians_insert_admin
  on public.member_guardians for insert
  to authenticated
  with check (wh.is_household_admin(household_id));

create policy member_guardians_delete_admin
  on public.member_guardians for delete
  to authenticated
  using (wh.is_household_admin(household_id));

-- ---------------------------------------------------------------------------
-- Child creation
--
-- A child member has no profile, so there is no invitation and no acceptance;
-- an administrator creates the record, their child role and their guardian
-- links in one transaction.
-- ---------------------------------------------------------------------------

create or replace function wh.create_child_member(
  p_household_id uuid,
  p_display_name text,
  p_date_of_birth date default null,
  p_guardian_member_ids uuid[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_member_id uuid;
  v_child_member_id uuid;
  v_guardian uuid;
begin
  if not wh.is_household_admin(p_household_id) then
    raise exception 'Only a household administrator can add a child'
      using errcode = 'insufficient_privilege';
  end if;

  v_actor_member_id := wh.member_id(p_household_id);

  insert into public.household_members
    (household_id, profile_id, member_type, display_name, date_of_birth)
  values (p_household_id, null, 'child', p_display_name, p_date_of_birth)
  returning id into v_child_member_id;

  insert into public.household_roles (household_id, member_id, role)
  values (p_household_id, v_child_member_id, 'child');

  foreach v_guardian in array coalesce(p_guardian_member_ids, array[]::uuid[]) loop
    insert into public.member_guardians (household_id, child_member_id, guardian_member_id)
    values (p_household_id, v_child_member_id, v_guardian)
    on conflict do nothing;
  end loop;

  insert into public.audit_events
    (household_id, actor_member_id, actor_profile_id, event_type, target_table, target_id, metadata)
  values (p_household_id, v_actor_member_id, auth.uid(), 'child.created',
          'household_members', v_child_member_id,
          jsonb_build_object('guardians', coalesce(array_length(p_guardian_member_ids, 1), 0)));

  return v_child_member_id;
end;
$$;

comment on function wh.create_child_member(uuid, text, date, uuid[]) is
  'Creates a guardian-controlled child member with no account of their own, plus their child role and guardian links.';

grant execute on function wh.create_child_member(uuid, text, date, uuid[]) to authenticated;

create or replace function public.create_child_member(
  p_household_id uuid,
  p_display_name text,
  p_date_of_birth date default null,
  p_guardian_member_ids uuid[] default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select wh.create_child_member(p_household_id, p_display_name, p_date_of_birth, p_guardian_member_ids);
$$;

revoke execute on function public.create_child_member(uuid, text, date, uuid[]) from public, anon;
grant execute on function public.create_child_member(uuid, text, date, uuid[]) to authenticated;

notify pgrst, 'reload schema';
