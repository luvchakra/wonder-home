-- Row-level security that checks membership once per query, not once per row
-- (performance pass, 2026-10-19).
--
-- Almost every policy asks `wh.is_member(household_id)`,
-- `wh.is_household_admin(household_id)` or `col = wh.member_id(household_id)`.
-- Each is a SECURITY DEFINER function with a fixed search_path, so Postgres
-- cannot inline it: it runs its own lookup for every row the query touches.
-- Counting 32 responsibilities took 17 ms and 982 buffers on the live
-- project, and every list a screen reads paid the same per-row price.
--
-- The same questions asked as sets are evaluated once per statement:
--
--   wh.is_member(x)            ->  x in (select wh.member_households())
--   wh.is_household_admin(x)   ->  x in (select wh.admin_households())
--   col = wh.member_id(x)      ->  (x, col) in (select household_id, member_id
--                                               from wh.my_memberships())
--
-- Each is exactly equivalent to what it replaces: the same active
-- membership, the same 'head'/'administrator' roles, and a viewer has at most
-- one active membership per household, so `member_id(x)` is that one id.
-- The same count now takes 0.7 ms.
--
-- Rather than restating 300-odd policies by hand, the rewrite below edits
-- each policy's own expression text in place (ALTER POLICY keeps its name,
-- command and roles), so every policy says what it said before. A policy
-- written after this migration that still calls the per-row helpers stays
-- correct, only slower; prefer the set forms in new policies.
--
-- The four policies that called auth.uid() bare (profiles, platform_admins)
-- now call it once per statement as `(select auth.uid())`, as Supabase's
-- auth_rls_initplan lint asks.

create or replace function wh.member_households()
  returns setof uuid
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select m.household_id
  from public.household_members m
  where m.profile_id = auth.uid()
    and m.status = 'active';
$$;

comment on function wh.member_households() is
  'The households the caller is an active member of. Set form of wh.is_member, for policies: evaluated once per statement.';

create or replace function wh.admin_households()
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
    and r.role = any (array['head', 'administrator']);
$$;

comment on function wh.admin_households() is
  'The households the caller is an Admin of. Set form of wh.is_household_admin, for policies: evaluated once per statement.';

create or replace function wh.my_memberships()
  returns table (household_id uuid, member_id uuid)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select m.household_id, m.id
  from public.household_members m
  where m.profile_id = auth.uid()
    and m.status = 'active';
$$;

comment on function wh.my_memberships() is
  'The caller''s active memberships as (household, member). Set form of `col = wh.member_id(household)`, for policies: evaluated once per statement.';

grant execute on function wh.member_households() to authenticated;
grant execute on function wh.admin_households() to authenticated;
grant execute on function wh.my_memberships() to authenticated;

do $rewrite$
declare
  p record;
  -- A column reference as Postgres deparses it: `household_id`, `s.household_id`.
  col constant text := '([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)';
  using_expr text;
  check_expr text;
  rewritten int := 0;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ~ 'wh\.(is_member|is_household_admin|member_id)\(|auth\.uid\(\)'
        or coalesce(with_check, '') ~ 'wh\.(is_member|is_household_admin|member_id)\(|auth\.uid\(\)'
      )
  loop
    using_expr := p.qual;
    check_expr := p.with_check;

    -- col = wh.member_id(x)  and  wh.member_id(x) = col
    using_expr := regexp_replace(using_expr, col || ' = wh\.member_id\(' || col || '\)',
      '((\2, \1) IN ( SELECT mm.household_id, mm.member_id FROM wh.my_memberships() mm))', 'g');
    using_expr := regexp_replace(using_expr, 'wh\.member_id\(' || col || '\) = ' || col,
      '((\1, \2) IN ( SELECT mm.household_id, mm.member_id FROM wh.my_memberships() mm))', 'g');
    check_expr := regexp_replace(check_expr, col || ' = wh\.member_id\(' || col || '\)',
      '((\2, \1) IN ( SELECT mm.household_id, mm.member_id FROM wh.my_memberships() mm))', 'g');
    check_expr := regexp_replace(check_expr, 'wh\.member_id\(' || col || '\) = ' || col,
      '((\1, \2) IN ( SELECT mm.household_id, mm.member_id FROM wh.my_memberships() mm))', 'g');

    using_expr := regexp_replace(using_expr, 'wh\.is_member\(' || col || '\)',
      '(\1 IN ( SELECT wh.member_households()))', 'g');
    check_expr := regexp_replace(check_expr, 'wh\.is_member\(' || col || '\)',
      '(\1 IN ( SELECT wh.member_households()))', 'g');

    using_expr := regexp_replace(using_expr, 'wh\.is_household_admin\(' || col || '\)',
      '(\1 IN ( SELECT wh.admin_households()))', 'g');
    check_expr := regexp_replace(check_expr, 'wh\.is_household_admin\(' || col || '\)',
      '(\1 IN ( SELECT wh.admin_households()))', 'g');

    -- A bare auth.uid() once per statement.
    using_expr := regexp_replace(using_expr, '(?<!SELECT )auth\.uid\(\)', '( SELECT auth.uid())', 'g');
    check_expr := regexp_replace(check_expr, '(?<!SELECT )auth\.uid\(\)', '( SELECT auth.uid())', 'g');

    if using_expr is not distinct from p.qual and check_expr is not distinct from p.with_check then
      continue;
    end if;

    if using_expr is not null and check_expr is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)',
        p.policyname, p.schemaname, p.tablename, using_expr, check_expr);
    elsif using_expr is not null then
      execute format('alter policy %I on %I.%I using (%s)',
        p.policyname, p.schemaname, p.tablename, using_expr);
    else
      execute format('alter policy %I on %I.%I with check (%s)',
        p.policyname, p.schemaname, p.tablename, check_expr);
    end if;
    rewritten := rewritten + 1;
  end loop;

  raise notice 'rls set-based membership: % policies rewritten', rewritten;
end;
$rewrite$;
