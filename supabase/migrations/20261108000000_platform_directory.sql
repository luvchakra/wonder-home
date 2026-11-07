-- Platform admin: account-level lists behind the Households & people totals
-- (owner, 2026-11-07: "on click show list of actual data", account level only).
--
-- Every function is service-role only and re-checks that the named actor is an
-- active platform OWNER, so a mistake in the app's own check still cannot open
-- the lists. They return account fields only: names, plan, counts, dates,
-- sign-in email and role. Never a household's own content. Each list or detail
-- view writes one audit row (household_id null) carrying the filters and page,
-- never the rows. Adds only new functions and one index: safe in either order.

create index if not exists households_created_at_idx on public.households (created_at desc);
create index if not exists support_access_grants_open_idx
  on public.support_access_grants (expires_at desc) where revoked_at is null;

create or replace function wh.platform_owner_guard(p_actor uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_actor is null or not exists (
    select 1 from public.platform_admins a
    where a.profile_id = p_actor and a.status = 'active' and a.role = 'owner'
  ) then
    raise exception 'platform owner only' using errcode = '42501';
  end if;
end $$;

create or replace function wh.platform_directory_audit(p_actor uuid, p_event text, p_meta jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_events (household_id, actor_profile_id, event_type, target_table, metadata)
  values (null, p_actor, p_event, 'platform_directory', p_meta);
$$;

-- Plans add up to households: a household with no subscription row is on Free
-- (the same default billing/account.ts applies).
create or replace function public.platform_plan_breakdown(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform wh.platform_owner_guard(p_actor);
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', p.key, 'name', p.name,
      'count', (select count(*) from public.households h
                 left join public.household_subscriptions s on s.household_id = h.id
                where coalesce(s.plan_key, 'free') = p.key),
      'noRecord', case when p.key = 'free' then
                 (select count(*) from public.households h
                   where not exists (select 1 from public.household_subscriptions s where s.household_id = h.id))
                 else 0 end
    ) order by p.sort_order), '[]'::jsonb)
    from public.plans p
  );
end $$;

create or replace function public.platform_directory_households(
  p_actor uuid, p_plan text, p_search text, p_limit int, p_offset int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 25), 1), 25);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(trim(coalesce(p_search, '')), '');
  v_plan text := nullif(trim(coalesce(p_plan, '')), '');
  v_total bigint;
  v_rows jsonb;
begin
  perform wh.platform_owner_guard(p_actor);

  select count(*) into v_total
    from public.households h
    left join public.household_subscriptions s on s.household_id = h.id
   where (v_plan is null or coalesce(s.plan_key, 'free') = v_plan)
     and (v_search is null or h.name ilike '%' || replace(replace(v_search, '%', ''), '_', '') || '%');

  select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb) into v_rows from (
    select h.id, h.name, h.status, h.created_at,
           coalesce(s.plan_key, 'free') as plan_key,
           coalesce(pl.name, 'Free') as plan_name,
           (select count(*) from public.household_members m where m.household_id = h.id) as members,
           (select max(u.last_sign_in_at) from public.household_members m
              join auth.users u on u.id = m.profile_id where m.household_id = h.id) as last_active
      from public.households h
      left join public.household_subscriptions s on s.household_id = h.id
      left join public.plans pl on pl.key = coalesce(s.plan_key, 'free')
     where (v_plan is null or coalesce(s.plan_key, 'free') = v_plan)
       and (v_search is null or h.name ilike '%' || replace(replace(v_search, '%', ''), '_', '') || '%')
     order by h.created_at desc, h.id
     limit v_limit offset v_offset
  ) r;

  perform wh.platform_directory_audit(p_actor, 'platform.households_viewed',
    jsonb_build_object('plan', v_plan, 'hasSearch', v_search is not null, 'offset', v_offset, 'returned', jsonb_array_length(v_rows)));
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

create or replace function public.platform_directory_household(p_actor uuid, p_household uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_head jsonb;
begin
  perform wh.platform_owner_guard(p_actor);
  select jsonb_build_object(
      'id', h.id, 'name', h.name, 'status', h.status, 'createdAt', h.created_at,
      'planKey', coalesce(s.plan_key, 'free'), 'planName', coalesce(pl.name, 'Free'),
      'lastActive', (select max(u.last_sign_in_at) from public.household_members m
                       join auth.users u on u.id = m.profile_id where m.household_id = h.id),
      'people', coalesce((
        select jsonb_agg(jsonb_build_object(
          'name', m.display_name, 'type', m.member_type,
          'admin', exists (select 1 from public.household_roles r where r.member_id = m.id and r.role in ('head', 'administrator')),
          'signedIn', u.last_sign_in_at is not null) order by m.created_at)
        from public.household_members m left join auth.users u on u.id = m.profile_id
        where m.household_id = h.id), '[]'::jsonb))
    into v_head
    from public.households h
    left join public.household_subscriptions s on s.household_id = h.id
    left join public.plans pl on pl.key = coalesce(s.plan_key, 'free')
   where h.id = p_household;
  if v_head is null then return null; end if;
  perform wh.platform_directory_audit(p_actor, 'platform.households_viewed',
    jsonb_build_object('detail', true, 'householdId', p_household));
  return v_head;
end $$;

create or replace function public.platform_directory_people(
  p_actor uuid, p_search text, p_limit int, p_offset int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 25), 1), 25);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(replace(replace(trim(coalesce(p_search, '')), '%', ''), '_', ''), '');
  v_total bigint;
  v_rows jsonb;
begin
  perform wh.platform_owner_guard(p_actor);

  select count(*) into v_total
    from public.household_members m
    left join auth.users u on u.id = m.profile_id
   where v_search is null or m.display_name ilike '%' || v_search || '%' or u.email ilike '%' || v_search || '%';

  select coalesce(jsonb_agg(r order by r.created_at desc), '[]'::jsonb) into v_rows from (
    select m.id, m.display_name as name, m.member_type as type, m.created_at,
           u.email, u.last_sign_in_at as last_sign_in,
           (u.last_sign_in_at is not null) as has_signed_in,
           exists (select 1 from public.household_roles r where r.member_id = m.id and r.role in ('head', 'administrator')) as admin,
           h.id as household_id, h.name as household_name
      from public.household_members m
      join public.households h on h.id = m.household_id
      left join auth.users u on u.id = m.profile_id
     where v_search is null or m.display_name ilike '%' || v_search || '%' or u.email ilike '%' || v_search || '%'
     order by m.created_at desc, m.id
     limit v_limit offset v_offset
  ) r;

  perform wh.platform_directory_audit(p_actor, 'platform.people_viewed',
    jsonb_build_object('hasSearch', v_search is not null, 'offset', v_offset, 'returned', jsonb_array_length(v_rows)));
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

create or replace function public.platform_directory_grants(p_actor uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_rows jsonb;
begin
  perform wh.platform_owner_guard(p_actor);
  select coalesce(jsonb_agg(r order by r.expires_at), '[]'::jsonb) into v_rows from (
    select g.id, h.id as household_id, h.name as household_name, g.scope, g.reason_code,
           g.granted_at, g.expires_at, coalesce(p.display_name, 'Platform staff') as granted_by
      from public.support_access_grants g
      join public.households h on h.id = g.household_id
      left join public.profiles p on p.id = g.admin_profile_id
     where g.revoked_at is null and g.expires_at > now()
     order by g.expires_at limit 100
  ) r;
  perform wh.platform_directory_audit(p_actor, 'platform.households_viewed',
    jsonb_build_object('list', 'support_grants', 'returned', jsonb_array_length(v_rows)));
  return v_rows;
end $$;

revoke all on function wh.platform_owner_guard(uuid) from public, anon, authenticated;
revoke all on function wh.platform_directory_audit(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.platform_plan_breakdown(uuid) from public, anon, authenticated;
revoke all on function public.platform_directory_households(uuid, text, text, int, int) from public, anon, authenticated;
revoke all on function public.platform_directory_household(uuid, uuid) from public, anon, authenticated;
revoke all on function public.platform_directory_people(uuid, text, int, int) from public, anon, authenticated;
revoke all on function public.platform_directory_grants(uuid) from public, anon, authenticated;
grant execute on function public.platform_plan_breakdown(uuid) to service_role;
grant execute on function public.platform_directory_households(uuid, text, text, int, int) to service_role;
grant execute on function public.platform_directory_household(uuid, uuid) to service_role;
grant execute on function public.platform_directory_people(uuid, text, int, int) to service_role;
grant execute on function public.platform_directory_grants(uuid) to service_role;
