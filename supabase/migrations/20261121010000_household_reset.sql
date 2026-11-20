-- Reset home (story 15-014): the owner's Danger zone.
--
-- The owner asked (2026-11-20): "in settings give option to reset home, when it
-- cleans up the entire home, remove all members and all related data, mark it
-- as danger zone, give option to download full data before reset".
--
-- Three functions:
--
--   wh.household_tables()              every public table that carries a household_id,
--                                      read from the catalog, so a table added later is
--                                      covered by the reset and the download without
--                                      anyone remembering to list it.
--   wh.household_reset_kept_tables()   the few household tables a reset keeps: the
--                                      plan, billing history, metering and the audit
--                                      trail (platform-level, said so on screen).
--   public.household_export_rows()     one page of one household table, read as the
--                                      caller (security invoker): the download is what
--                                      the owner's own session may read, nothing more.
--   public.reset_household()           the reset itself, one transaction: every member
--                                      but the owner goes, every row of every other
--                                      household table goes, one audit entry stays.
--
-- Safe in either order with the code: until this runs, the download and the
-- reset both refuse with "not available yet" (PGRST202), and nothing else reads
-- these functions.

create or replace function wh.household_tables()
returns setof text
language sql
stable
set search_path = ''
as $$
  select c.relname::text
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and not c.relispartition
    and exists (
      select 1 from pg_catalog.pg_attribute a
      where a.attrelid = c.oid and a.attname = 'household_id' and not a.attisdropped
    )
  order by 1
$$;

comment on function wh.household_tables() is
  'Every public table carrying a household_id (story 15-014). The reset and the full download both start from this list.';

create or replace function wh.household_reset_kept_tables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    -- The audit trail outlives the reset and records it.
    'audit_events',
    -- The plan and its billing history are platform-level (said so on screen).
    'household_subscriptions',
    'billing_intents',
    'billing_events',
    'billing_invoices',
    'payments',
    'payment_refunds',
    'payment_customers',
    'billing_reconciliation_findings',
    -- Metering for the plan: a reset is not a way to start a period's allowance again.
    'usage_counters',
    'trivia_generation_usage',
    -- Step-up attempts: a reset must not clear the lockout count.
    'step_up_verifications'
  ]::text[]
$$;

comment on function wh.household_reset_kept_tables() is
  'Household tables a reset keeps (story 15-014): audit, plan and billing history, metering, step-up attempts. Mirrored in packages/core/src/household/reset-tables.json; scripts/test-household-reset-rls.mjs fails if they differ.';

grant execute on function wh.household_tables() to authenticated, service_role;
grant execute on function wh.household_reset_kept_tables() to authenticated, service_role;

-- One page of one household table, as the caller sees it.
--
-- Security invoker: row level security and column grants apply exactly as on
-- every screen, so the download never shows the owner something their own
-- session could not read (another member's private health record, say). Columns
-- that hold a secret are left out by name as well, belt and braces.
create or replace function public.household_export_rows(
  p_household_id uuid,
  p_table text,
  p_offset integer,
  p_limit integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_rel regclass;
  v_cols text;
  v_order text;
  v_rows jsonb;
begin
  if p_household_id is null or p_offset is null or p_offset < 0 or p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception 'invalid_page' using errcode = '22023';
  end if;
  if not exists (select 1 from wh.household_tables() t where t = p_table) then
    raise exception 'not_a_household_table' using errcode = '22023';
  end if;
  if p_household_id not in (select wh.member_households()) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  v_rel := format('public.%I', p_table)::regclass;

  select string_agg(format('%I', a.attname), ', ' order by a.attnum)
    into v_cols
  from pg_catalog.pg_attribute a
  where a.attrelid = v_rel
    and a.attnum > 0
    and not a.attisdropped
    and has_column_privilege(v_rel, a.attnum, 'SELECT')
    and a.attname !~* '(token|secret|password|api_key|key_hash|credential|state_hash|request_hash)';

  if v_cols is null then
    return '[]'::jsonb;
  end if;

  select string_agg(format('%I', a.attname), ', ' order by k.ord)
    into v_order
  from pg_catalog.pg_index i
  cross join lateral unnest(i.indkey) with ordinality as k(attnum, ord)
  join pg_catalog.pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
  where i.indrelid = v_rel and i.indisprimary;

  execute format(
    'select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from (select %s from public.%I where household_id = $1 order by %s offset $2 limit $3) r',
    v_cols, p_table, coalesce(v_order, '1')
  )
  into v_rows
  using p_household_id, p_offset, p_limit;

  return v_rows;
end;
$$;

comment on function public.household_export_rows(uuid, text, integer, integer) is
  'One page of one household table for the full download (story 15-014). Security invoker: RLS and column grants apply; secret-named columns are left out.';

revoke all on function public.household_export_rows(uuid, text, integer, integer) from public, anon;
grant execute on function public.household_export_rows(uuid, text, integer, integer) to authenticated;

-- The reset.
--
-- Only the service role may call it: the server proves the owner's identity
-- (a fresh password or Google sign-in) before it does, and a function a
-- browser could call directly would skip that. It still checks, itself, that
-- the profile it is told about is this household's owner, and that the typed
-- name is this household's: a call aimed at another household fails here.
--
-- One transaction: a failure part-way leaves the home exactly as it was.
-- Foreign keys between household tables are met by deleting in passes; rows a
-- trigger touches while it runs are caught by the next pass, and the function
-- refuses (and so rolls back) if anything is still there after twelve.
create or replace function public.reset_household(
  p_household_id uuid,
  p_actor_profile_id uuid,
  p_confirm_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household public.households%rowtype;
  v_owner_profile uuid;
  v_members integer;
  v_invites integer;
  v_rows bigint := 0;
  v_count bigint;
  v_tables text[];
  v_table text;
  v_blocked integer;
  v_remaining boolean;
  v_pass integer := 0;
begin
  if p_household_id is null or p_actor_profile_id is null then
    raise exception 'invalid_request' using errcode = '22023';
  end if;

  select * into v_household from public.households where id = p_household_id for update;
  if not found then
    raise exception 'household_not_found' using errcode = 'P0002';
  end if;

  select m.profile_id into v_owner_profile
  from public.household_members m
  where m.id = v_household.owner_member_id
    and m.household_id = p_household_id
    and m.status = 'active'
    and m.member_type = 'adult';

  if v_owner_profile is null or v_owner_profile <> p_actor_profile_id then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  if lower(btrim(coalesce(p_confirm_name, ''))) <> lower(btrim(v_household.name)) then
    raise exception 'name_mismatch' using errcode = '22023';
  end if;

  select count(*) into v_members
  from public.household_members
  where household_id = p_household_id and id <> v_household.owner_member_id;

  select count(*) into v_invites
  from public.household_invitations
  where household_id = p_household_id and accepted_at is null and revoked_at is null;

  v_tables := array(
    select t from wh.household_tables() t
    where t <> all (wh.household_reset_kept_tables() || array['household_members', 'household_roles'])
    order by t
  );

  loop
    v_pass := v_pass + 1;
    v_blocked := 0;

    foreach v_table in array v_tables loop
      begin
        execute format('delete from public.%I where household_id = $1', v_table) using p_household_id;
        get diagnostics v_count = row_count;
        v_rows := v_rows + v_count;
      exception when foreign_key_violation then
        v_blocked := v_blocked + 1;
      end;
    end loop;

    -- People last: the owner stays, with the one role a new household gives them.
    begin
      delete from public.household_roles
      where household_id = p_household_id
        and (member_id <> v_household.owner_member_id or role <> 'head');
      get diagnostics v_count = row_count;
      v_rows := v_rows + v_count;

      delete from public.household_members
      where household_id = p_household_id and id <> v_household.owner_member_id;
      get diagnostics v_count = row_count;
      v_rows := v_rows + v_count;
    exception when foreign_key_violation then
      v_blocked := v_blocked + 1;
    end;

    v_remaining := false;
    foreach v_table in array v_tables loop
      execute format('select exists (select 1 from public.%I where household_id = $1)', v_table)
        into v_remaining using p_household_id;
      exit when v_remaining;
    end loop;

    exit when v_blocked = 0 and not v_remaining;

    if v_pass >= 12 then
      raise exception 'reset_incomplete' using errcode = 'P0001';
    end if;
  end loop;

  -- The home row itself goes back to how a new household starts: name and
  -- time zone (chosen at creation) stay; the rest is set again in setup.
  update public.households
  set key_member_id = null,
      region = null,
      currency = null,
      measurement_system = null,
      default_language = null,
      updated_at = now()
  where id = p_household_id;

  -- A new household's owner holds the head role; make sure it is there.
  insert into public.household_roles (household_id, member_id, role)
  values (p_household_id, v_household.owner_member_id, 'head')
  on conflict do nothing;

  insert into public.audit_events (
    household_id, actor_member_id, actor_profile_id, event_type, target_table, target_id, metadata
  )
  values (
    p_household_id, v_household.owner_member_id, p_actor_profile_id, 'household.reset',
    'households', p_household_id,
    jsonb_build_object(
      'members_removed', v_members,
      'invitations_revoked', v_invites,
      'rows_deleted', v_rows,
      'tables_cleared', coalesce(array_length(v_tables, 1), 0),
      'passes', v_pass
    )
  );

  return jsonb_build_object(
    'household_id', p_household_id,
    'owner_member_id', v_household.owner_member_id,
    'members_removed', v_members,
    'invitations_revoked', v_invites,
    'rows_deleted', v_rows,
    'tables_cleared', coalesce(array_length(v_tables, 1), 0)
  );
end;
$$;

comment on function public.reset_household(uuid, uuid, text) is
  'Reset home (story 15-014): the owner only, the home''s name typed, one transaction. Keeps the owner, the plan and billing history, metering and the audit trail. Service role only; the server checks step-up first.';

revoke all on function public.reset_household(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reset_household(uuid, uuid, text) to service_role;
