-- The cat goes round its whole list before it says anything again (the owner,
-- 2026-10-21: "repeat the quotes only when the stored list is finished").
--
-- Before this, a saying a child had heard was never picked again, so once
-- they had heard every one the cat kept to their reminders. Now every saying
-- suited to the child is in play: the ones not heard yet first, in the day's
-- order, and only when none are left, the one heard longest ago. Telling a
-- saying again moves its `heard_at` forward, so the list keeps turning.
--
-- Rollback: re-run the companion_sayings_for body from
-- 20261020231000_companion_sayings.sql; drop policy companion_sayings_heard_own_update;
-- revoke update on public.companion_sayings_heard from authenticated.

drop policy if exists companion_sayings_heard_own_update on public.companion_sayings_heard;
create policy companion_sayings_heard_own_update on public.companion_sayings_heard for update
  to authenticated
  using ((household_id, member_id) in (select household_id, member_id from wh.my_memberships()))
  with check ((household_id, member_id) in (select household_id, member_id from wh.my_memberships()));

revoke update on public.companion_sayings_heard from authenticated, anon;
grant update (heard_at) on public.companion_sayings_heard to authenticated;

create or replace function public.companion_sayings_for(p_member_id uuid, p_limit integer default 6)
returns table (id text, kind text, words jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  with child as (
    select
      coalesce(extract(year from age(current_date, m.date_of_birth))::integer, 10) as years,
      case
        when lower(coalesce(m.gender, '')) ~ '^(f|female|girl|woman)' then 'girl'
        when lower(coalesce(m.gender, '')) ~ '^(m|male|boy|man)' then 'boy'
        else 'any'
      end as gender
    from public.household_members m
    where m.id = p_member_id
  )
  select s.id, s.kind, s.words
  from public.companion_sayings s
  cross join child c
  left join public.companion_sayings_heard h on h.member_id = p_member_id and h.saying_id = s.id
  where s.active
    and s.min_age <= c.years and s.max_age >= c.years
    and (s.gender = 'any' or s.gender = c.gender)
  -- Not heard first; then, only once all are heard, the longest ago.
  order by h.heard_at nulls first, md5(s.id || p_member_id::text || current_date::text)
  limit least(greatest(coalesce(p_limit, 6), 1), 20);
$$;

revoke all on function public.companion_sayings_for(uuid, integer) from public;
grant execute on function public.companion_sayings_for(uuid, integer) to authenticated;
