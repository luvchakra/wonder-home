-- The last per-row helpers in row-level security, answered once per query
-- (performance audit 2026-10-28, backlog B1).
--
-- 20261028171000 did this for may_see_child / may_change_child. What was left:
-- may_see_health (11 policies), may_see_event (10), is_child_of (10),
-- has_role (10), may_see_finance (6), is_event_participant (2, on
-- family_events) and the 13 is_member / is_household_admin / member_id uses on
-- storage.objects. Each call ran one to four lookups for every row a policy
-- looked at; health, events and finance are the tables that grow.
--
-- Each use is rewritten in place (alter policy) to the equivalent set form,
-- evaluated once per query. Branch by branch, with h the household argument:
--   is_member(h)            = h in member_households()
--   is_household_admin(h)   = h in admin_households()
--   member_id(h)::text = x  = (h, x) in my_memberships() (member id as text)
--   has_role(h, roles)      = h in role_households(roles)
--   may_see_finance(h)      = h in finance_households()
--                             (a member whose own membership in h carries no
--                             child or helper role; one membership per
--                             household, household_members unique (household_id,
--                             profile_id))
--   is_child_of(h, c)       = (h, c) in my_household_children()
--                             (every use is ANDed with "admin of h or guardian
--                             of c in h", which already needs an active
--                             membership in h, so limiting the set to my
--                             households changes nothing)
--   is_event_participant(e) = e in my_participant_events()
--   may_see_event(e)        = e in my_visible_events()
--   may_see_health(h, s, p) = h in member_households() and (
--                               (h, s) in my_memberships()
--                               or p = 'household_operational'
--                               or (h, s) in my_guarded_children()
--                               or (p = 'selected_family'
--                                   and (h, s) in my_health_consents()))
-- The helpers stay for any non-policy caller; scripts/test-setup-counts-rls.mjs
-- fails if a policy calls one of them again.

-- Households where the caller holds one of p_roles.
create or replace function wh.role_households(p_roles text[])
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select r.household_id
  from public.household_roles r
  join public.household_members m on m.id = r.member_id
  where m.profile_id = auth.uid()
    and m.status = 'active'
    and r.role = any (p_roles);
$$;

-- Households whose money the caller may see: an active member who is neither
-- a child nor a helper there.
create or replace function wh.finance_households()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select m.household_id
  from public.household_members m
  where m.profile_id = auth.uid()
    and m.status = 'active'
    and not exists (
      select 1 from public.household_roles r
      where r.household_id = m.household_id
        and r.member_id = m.id
        and r.role in ('child', 'helper')
    );
$$;

-- (household_id, child_member_id) for every child of a household the caller
-- is an active member of.
create or replace function wh.my_household_children()
  returns table (household_id uuid, child_member_id uuid)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select c.household_id, c.id
  from public.household_members c
  join public.household_members m on m.household_id = c.household_id
  where m.profile_id = auth.uid()
    and m.status = 'active'
    and c.member_type = 'child';
$$;

-- (household_id, subject_member_id) for every health consent naming the
-- caller as viewer, in the household it was given in.
create or replace function wh.my_health_consents()
  returns table (household_id uuid, subject_member_id uuid)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select c.household_id, c.subject_member_id
  from public.health_consents c
  join public.household_members m on m.id = c.viewer_member_id and m.household_id = c.household_id
  where m.profile_id = auth.uid()
    and m.status = 'active';
$$;

-- Events the caller takes part in (wh.is_event_participant, as a set).
create or replace function wh.my_participant_events()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select ep.event_id
  from public.event_participants ep
  join public.household_members m on m.id = ep.member_id and m.household_id = ep.household_id
  where m.profile_id = auth.uid()
    and m.status = 'active';
$$;

-- Events the caller may see (wh.may_see_event, as a set): in a household they
-- belong to, and household-wide, theirs, or one they take part in.
create or replace function wh.my_visible_events()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select e.id
  from public.family_events e
  join public.household_members m on m.household_id = e.household_id
  where m.profile_id = auth.uid()
    and m.status = 'active'
    and (
      e.visibility = 'household'
      or e.owner_member_id = m.id
      or (e.visibility = 'participants' and e.id in (select wh.my_participant_events()))
    );
$$;

revoke all on function wh.role_households(text[]) from public, anon;
revoke all on function wh.finance_households() from public, anon;
revoke all on function wh.my_household_children() from public, anon;
revoke all on function wh.my_health_consents() from public, anon;
revoke all on function wh.my_participant_events() from public, anon;
revoke all on function wh.my_visible_events() from public, anon;
grant execute on function wh.role_households(text[]) to authenticated;
grant execute on function wh.finance_households() to authenticated;
grant execute on function wh.my_household_children() to authenticated;
grant execute on function wh.my_health_consents() to authenticated;
grant execute on function wh.my_participant_events() to authenticated;
grant execute on function wh.my_visible_events() to authenticated;

create or replace function pg_temp.set_form(expr text)
  returns text
  language plpgsql
  immutable
as $$
declare
  -- A column (household_id, r.member_id) or the storage folder's household.
  arg constant text := '([a-z_.]+|\(\(storage\.foldername\(name\)\)\[1\]\)::uuid)';
begin
  if expr is null then return null; end if;
  expr := regexp_replace(expr, 'wh\.may_see_health\(' || arg || ', ' || arg || ', ' || arg || '\)',
    '(\1 IN (SELECT wh.member_households()) AND ((\1, \2) IN (SELECT wh_m.household_id, wh_m.member_id FROM wh.my_memberships() wh_m) OR \3 = ''household_operational''::text OR (\1, \2) IN (SELECT wh_g.household_id, wh_g.child_member_id FROM wh.my_guarded_children() wh_g) OR (\3 = ''selected_family''::text AND (\1, \2) IN (SELECT wh_hc.household_id, wh_hc.subject_member_id FROM wh.my_health_consents() wh_hc))))', 'g');
  expr := regexp_replace(expr, 'wh\.may_see_event\(' || arg || '\)',
    '(\1 IN (SELECT wh.my_visible_events()))', 'g');
  expr := regexp_replace(expr, 'wh\.is_event_participant\(' || arg || '\)',
    '(\1 IN (SELECT wh.my_participant_events()))', 'g');
  expr := regexp_replace(expr, 'wh\.is_child_of\(' || arg || ', ' || arg || '\)',
    '((\1, \2) IN (SELECT wh_c.household_id, wh_c.child_member_id FROM wh.my_household_children() wh_c))', 'g');
  expr := regexp_replace(expr, 'wh\.has_role\(' || arg || ', (ARRAY\[[^]]*\])\)',
    '(\1 IN (SELECT wh.role_households(\2)))', 'g');
  expr := regexp_replace(expr, 'wh\.may_see_finance\(' || arg || '\)',
    '(\1 IN (SELECT wh.finance_households()))', 'g');
  expr := regexp_replace(expr, 'wh\.is_member\(' || arg || '\)',
    '(\1 IN (SELECT wh.member_households()))', 'g');
  expr := regexp_replace(expr, 'wh\.is_household_admin\(' || arg || '\)',
    '(\1 IN (SELECT wh.admin_households()))', 'g');
  expr := regexp_replace(expr, 'split_part\(name, ''/''::text, 2\) = \(wh\.member_id\(' || arg || '\)\)::text',
    '((\1, split_part(name, ''/''::text, 2)) IN (SELECT wh_m.household_id, wh_m.member_id::text FROM wh.my_memberships() wh_m))', 'g');
  return expr;
end;
$$;

do $$
declare
  p record;
  stmt text;
  per_row constant text := 'wh\.(may_see_health|may_see_event|is_event_participant|is_child_of|has_role|may_see_finance|is_member|is_household_admin|member_id|may_see_child|may_change_child)\(';
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ per_row
  loop
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if p.qual is not null then stmt := stmt || format(' using (%s)', pg_temp.set_form(p.qual)); end if;
    if p.with_check is not null then stmt := stmt || format(' with check (%s)', pg_temp.set_form(p.with_check)); end if;
    execute stmt;
  end loop;

  if exists (
    select 1 from pg_policies
    where coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ per_row
  ) then
    raise exception 'a policy still calls a per-row wh helper';
  end if;
end;
$$;

drop function pg_temp.set_form(text);
