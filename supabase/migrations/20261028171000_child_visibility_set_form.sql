-- Who may see or change a child's rows, answered once per query instead of once
-- per row (performance audit, 2026-10-28).
--
-- wh.may_see_child(h, c) and wh.may_change_child(h, c) were per-row helpers:
-- each call ran wh.is_household_admin(h) and wh.member_id(h) (two to three
-- lookups) for every row a policy looked at. 25 + 25 policy uses on the school
-- and child tables, and school_items carries two permissive policies with the
-- same qual, so the helper ran twice per row. Measured on the live project, as
-- `authenticated` with a real member's claims, one household with 3,007 school
-- items: the unbounded list read took 868 ms.
--
-- Each use is rewritten to the equivalent set form, evaluated once per query:
--   may_see_child(h, c)    = h is a household I administer
--                            or (h, c) is my own membership
--                            or (h, c) is a child I am a guardian of
--   may_change_child(h, c) = h is a household I administer
--                            or (h, c) is a child I am a guardian of
-- exactly the branches of the two helpers (has_role(['head','administrator'])
-- is what wh.admin_households() returns; wh.member_id(h) is my active
-- membership in h, which is what wh.my_memberships() returns per household).
-- The helpers stay for any non-policy caller; scripts/test-setup-counts-rls.mjs
-- now fails if a policy calls them again.

-- (household_id, child_member_id) for every child the caller guards, in the
-- household they guard them in.
create or replace function wh.my_guarded_children()
  returns table (household_id uuid, child_member_id uuid)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select m.household_id, g.child_member_id
  from public.member_guardians g
  join public.household_members m on m.id = g.guardian_member_id
  where m.profile_id = auth.uid()
    and m.status = 'active';
$$;

revoke all on function wh.my_guarded_children() from public, anon;
grant execute on function wh.my_guarded_children() to authenticated;

do $$
declare
  p record;
  see constant text := '(\1 IN (SELECT wh.admin_households()) OR (\1, \2) IN (SELECT wh_m.household_id, wh_m.member_id FROM wh.my_memberships() wh_m) OR (\1, \2) IN (SELECT wh_g.household_id, wh_g.child_member_id FROM wh.my_guarded_children() wh_g))';
  change constant text := '(\1 IN (SELECT wh.admin_households()) OR (\1, \2) IN (SELECT wh_g.household_id, wh_g.child_member_id FROM wh.my_guarded_children() wh_g))';
  q text;
  c text;
  stmt text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ 'wh\.may_(see|change)_child\('
  loop
    q := regexp_replace(regexp_replace(p.qual, 'wh\.may_see_child\(([a-z_.]+), ([a-z_.]+)\)', see, 'g'),
                        'wh\.may_change_child\(([a-z_.]+), ([a-z_.]+)\)', change, 'g');
    c := regexp_replace(regexp_replace(p.with_check, 'wh\.may_see_child\(([a-z_.]+), ([a-z_.]+)\)', see, 'g'),
                        'wh\.may_change_child\(([a-z_.]+), ([a-z_.]+)\)', change, 'g');
    stmt := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if q is not null then stmt := stmt || format(' using (%s)', q); end if;
    if c is not null then stmt := stmt || format(' with check (%s)', c); end if;
    execute stmt;
  end loop;

  if exists (
    select 1 from pg_policies
    where coalesce(qual, '') || ' ' || coalesce(with_check, '') ~ 'wh\.may_(see|change)_child\('
  ) then
    raise exception 'a policy still calls wh.may_see_child / wh.may_change_child';
  end if;
end;
$$;

-- Today and the look-ahead read a household's school items by a due-date
-- window (any status); the only household-led index was partial (open items),
-- so the window scanned school_items_child_idx across every household.
create index if not exists school_items_household_due_idx on public.school_items (household_id, due_at);
-- The same for bills by due day.
create index if not exists obligations_household_due_idx on public.obligations (household_id, due_on);
