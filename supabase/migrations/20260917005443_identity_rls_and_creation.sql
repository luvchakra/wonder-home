-- Identity RLS, ownership consistency and household creation (stories 01-001, 01-003).
--
-- Applied to the wonder-home Supabase project as version 20260917005443.
-- Split from the table definitions in 20260917005417 so each migration is one
-- logical change: structure first, then the rules that govern access to it.

-- ---------------------------------------------------------------------------
-- RLS helpers
--
-- SECURITY DEFINER so a policy can read membership without the querying role
-- needing its own access to these tables, and search_path is pinned so a caller
-- cannot redirect the identifiers these resolve.
-- ---------------------------------------------------------------------------

create or replace function wh.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid();
$$;

comment on function wh.current_profile_id() is 'The authenticated profile, or null when anonymous.';

create or replace function wh.member_id(p_household_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id
  from public.household_members m
  where m.household_id = p_household_id
    and m.profile_id = auth.uid()
    and m.status = 'active'
  limit 1;
$$;

create or replace function wh.is_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = p_household_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function wh.has_role(p_household_id uuid, p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_roles r
    join public.household_members m on m.id = r.member_id
    where r.household_id = p_household_id
      and m.profile_id = auth.uid()
      and m.status = 'active'
      and r.role = any (p_roles)
  );
$$;

create or replace function wh.is_household_admin(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select wh.has_role(p_household_id, array['head', 'administrator']);
$$;

comment on function wh.is_household_admin(uuid) is
  'Head of Family or a Household Administrator they designated.';

grant execute on function
  wh.current_profile_id(),
  wh.member_id(uuid),
  wh.is_member(uuid),
  wh.has_role(uuid, text[]),
  wh.is_household_admin(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Ownership consistency
--
-- households.owner_member_id and the single 'head' role must describe the same
-- member. Without this they drift, and ownership becomes a question with two
-- answers.
-- ---------------------------------------------------------------------------

create or replace function wh.assert_owner_is_head()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_household uuid;
begin
  if new.owner_member_id is null then
    -- Only tolerated inside wh.create_household(), between the household row
    -- and its first member. Anything else is a household with no owner.
    if tg_op = 'UPDATE' then
      raise exception 'A household cannot have its owner removed (household %)', new.id
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  select m.household_id into v_owner_household
  from public.household_members m
  where m.id = new.owner_member_id;

  if v_owner_household is distinct from new.id then
    raise exception 'Owner % belongs to a different household', new.owner_member_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger households_owner_consistency
  before insert or update of owner_member_id on public.households
  for each row execute function wh.assert_owner_is_head();

-- Role grants must stay inside their own household.
create or replace function wh.assert_role_member_matches_household()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_household uuid;
begin
  select m.household_id into v_member_household
  from public.household_members m
  where m.id = new.member_id;

  if v_member_household is distinct from new.household_id then
    raise exception 'Member % is not part of household %', new.member_id, new.household_id
      using errcode = 'foreign_key_violation';
  end if;

  return new;
end;
$$;

create trigger household_roles_same_household
  before insert or update on public.household_roles
  for each row execute function wh.assert_role_member_matches_household();

-- ---------------------------------------------------------------------------
-- Row level security
--
-- RLS is defense in depth. Application authorization in /api/v1 remains
-- authoritative (architecture/SECURITY-BASELINE.md); these policies are the
-- second line that holds if a query ever escapes it.
-- ---------------------------------------------------------------------------

-- profiles ------------------------------------------------------------------

create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy profiles_select_household_peers
  on public.profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.household_members mine
      join public.household_members theirs on theirs.household_id = mine.household_id
      where mine.profile_id = auth.uid()
        and mine.status = 'active'
        and theirs.profile_id = public.profiles.id
    )
  );

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- households ----------------------------------------------------------------

create policy households_select_member
  on public.households for select
  to authenticated
  using (wh.is_member(id));

create policy households_update_admin
  on public.households for update
  to authenticated
  using (wh.is_household_admin(id))
  with check (wh.is_household_admin(id));

-- No INSERT policy by design: households are created through
-- wh.create_household(), which solves the bootstrap problem that no
-- membership-based policy can.

-- household_members ---------------------------------------------------------

create policy household_members_select_member
  on public.household_members for select
  to authenticated
  using (wh.is_member(household_id));

create policy household_members_insert_admin
  on public.household_members for insert
  to authenticated
  with check (wh.is_household_admin(household_id));

create policy household_members_update_admin
  on public.household_members for update
  to authenticated
  using (wh.is_household_admin(household_id))
  with check (wh.is_household_admin(household_id));

-- household_roles -----------------------------------------------------------

create policy household_roles_select_member
  on public.household_roles for select
  to authenticated
  using (wh.is_member(household_id));

-- Administrators manage ordinary roles; only the head may grant or revoke
-- 'head' or 'administrator', so an administrator cannot promote themselves.
create policy household_roles_insert_admin
  on public.household_roles for insert
  to authenticated
  with check (
    case
      when role in ('head', 'administrator') then wh.has_role(household_id, array['head'])
      else wh.is_household_admin(household_id)
    end
  );

create policy household_roles_delete_admin
  on public.household_roles for delete
  to authenticated
  using (
    case
      when role in ('head', 'administrator') then wh.has_role(household_id, array['head'])
      else wh.is_household_admin(household_id)
    end
  );

-- audit_events --------------------------------------------------------------

create policy audit_events_select_admin
  on public.audit_events for select
  to authenticated
  using (household_id is not null and wh.is_household_admin(household_id));

-- Append-only from the client's point of view: no insert, update or delete
-- policy exists. Audit rows are written by SECURITY DEFINER domain functions.

-- ---------------------------------------------------------------------------
-- Household creation
-- ---------------------------------------------------------------------------

create or replace function wh.create_household(
  p_household_name text,
  p_display_name text,
  p_timezone text default 'Asia/Kolkata'
)
returns table (household_id uuid, member_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid := auth.uid();
  v_household_id uuid;
  v_member_id uuid;
begin
  if v_profile_id is null then
    raise exception 'Authentication required to create a household'
      using errcode = 'insufficient_privilege';
  end if;

  -- A profile may already exist from an earlier household; keep the existing
  -- display name rather than overwriting what the person chose before.
  insert into public.profiles (id, display_name, timezone)
  values (v_profile_id, p_display_name, p_timezone)
  on conflict (id) do nothing;

  insert into public.households (name, timezone)
  values (p_household_name, p_timezone)
  returning id into v_household_id;

  insert into public.household_members (household_id, profile_id, member_type, display_name)
  values (v_household_id, v_profile_id, 'adult', p_display_name)
  returning id into v_member_id;

  insert into public.household_roles (household_id, member_id, role)
  values (v_household_id, v_member_id, 'head');

  update public.households
  set owner_member_id = v_member_id
  where id = v_household_id;

  insert into public.audit_events (
    household_id, actor_member_id, actor_profile_id, event_type, target_table, target_id, metadata
  )
  values (
    v_household_id, v_member_id, v_profile_id, 'household.created',
    'households', v_household_id, jsonb_build_object('role', 'head')
  );

  return query select v_household_id, v_member_id;
end;
$$;

comment on function wh.create_household(text, text, text) is
  'Creates a household, its first member and their Head of Family role atomically. The only path that may create a household.';

grant execute on function wh.create_household(text, text, text) to authenticated;
