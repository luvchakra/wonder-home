-- HomeSend's model decides, part 5 (story 14-085): the platform-admin
-- Overview's "Nothing waits" card gains three measures, from
-- `homesend_decision_memories` over the last 30 days (aggregate only, never a
-- household id or anything an item said beyond its new kind's short name):
--   decidedByAi        items the model decided (source 'model' or
--                      'learned_rule') out of all decided items;
--   learnedRuleApplied items a learned rule decided (14-084);
--   newKinds           kinds nobody anticipated, by name, with how many and
--                      how many households sent one (top 12; a name seen in
--                      fewer than 2 households is grouped as "other", so no
--                      one household's item can be picked out).
--
-- Safe in either order: a new function; the app reads it on its own and shows
-- "not measured" while it is missing. Rollback: drop function
-- public.platform_homesend_decisions(uuid).

create or replace function public.platform_homesend_decisions(p_staff_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - interval '30 days';
  v_result jsonb;
begin
  if p_staff_profile_id is null or not exists (
    select 1 from public.platform_admins a
    where a.profile_id = p_staff_profile_id and a.status = 'active'
  ) then
    raise exception 'platform staff only' using errcode = '42501';
  end if;

  with
  decided as (
    select m.household_id, m.source, lower(trim(m.new_kind)) as new_kind
    from public.homesend_decision_memories m
    where m.created_at >= v_since
  ),
  kinds as (
    select d.new_kind, count(*) as items, count(distinct d.household_id) as households
    from decided d
    where d.new_kind is not null and d.new_kind <> ''
    group by d.new_kind
  ),
  named as (
    select case when k.households >= 2 then k.new_kind else 'other' end as kind, sum(k.items) as items, sum(k.households) as households
    from kinds k
    group by 1
  )
  select jsonb_build_object(
    'decidedByAi', jsonb_build_object(
      'count', (select count(*) from decided where source in ('model', 'learned_rule')),
      'of', (select count(*) from decided)),
    'learnedRuleApplied', (select count(*) from decided where source = 'learned_rule'),
    'newKindItems', (select count(*) from decided where new_kind is not null and new_kind <> ''),
    'newKinds', coalesce((
      select jsonb_agg(jsonb_build_object('kind', n.kind, 'items', n.items, 'households', n.households) order by n.items desc, n.kind)
      from (select * from named order by items desc, kind limit 12) n
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

comment on function public.platform_homesend_decisions(uuid) is
  'HomeSend decisions for the platform-admin Overview (14-085): decided by AI, learned rule applied, new kinds seen (names seen in 2+ households, else "other"). service_role only; aggregate only.';

revoke all on function public.platform_homesend_decisions(uuid) from public, anon, authenticated;
grant execute on function public.platform_homesend_decisions(uuid) to service_role;

-- Every read is the last 30 days of all households: served by a created_at index.
create index if not exists homesend_decision_memories_created_idx on public.homesend_decision_memories (created_at);

notify pgrst, 'reload schema';
