-- HomeSend on its own (the owner, 2026-11-20: "I want homesend to be as autonomous as possible, with minimum
-- inputs required from the users"). The Platform admin Overview's "Nothing waits" measures gain four:
-- questions asked per 10 sends, the share of questions a person answered, entries confirmed without a tap
-- (by basis), and entries undone or corrected within 7 days. "Kept Checking" also counts the one question
-- still asked by default, a doubtful money amount ("homesend_amount").
--
-- Safe in either order: the function only gains keys. The code before this reads the keys it knows and
-- ignores the rest; the code after it treats a missing key as "not measured yet".

create or replace function public.platform_nothing_waits(p_staff_profile_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_result jsonb;
begin
  if p_staff_profile_id is null or not exists (
    select 1 from public.platform_admins a
    where a.profile_id = p_staff_profile_id and a.status = 'active'
  ) then
    raise exception 'platform staff only' using errcode = '42501';
  end if;

  with
  sent as (
    select i.id, i.status, i.review_decision
    from public.home_send_items i
    where i.created_at >= v_now - interval '30 days'
  ),
  open_needs as (
    select n.household_id, count(*) as open, extract(epoch from (v_now - min(n.created_at))) / 3600 as oldest_hours
    from public.needs_you_items n
    where n.status = 'open'
    group by n.household_id
  ),
  added as (
    select c.intake_id, c.created_at, c.undone_at, c.confirmation_state, c.confirmed_basis, c.confirmed_by_member_id, c.confirmed_at
    from public.homesend_changes c
    where c.created_at >= v_now - interval '30 days' and c.change_type = 'created'
  ),
  asked as (
    select n.status
    from public.needs_you_items n
    where n.created_at >= v_now - interval '30 days'
  )
  select jsonb_build_object(
    -- Sends that needed a person, out of every send in the last 30 days: a person's review, a question a person answered, or still waiting.
    'neededPerson', jsonb_build_object(
      'count', (select count(*) from sent s where s.status in ('received', 'classified', 'failed')
        or s.review_decision in ('added', 'updated', 'cancelled', 'kept_existing', 'dismissed')
        or exists (select 1 from public.needs_you_items n where n.subject_id = s.id and n.status = 'answered')),
      'of', (select count(*) from sent)),
    -- Open "Needs you" items, per household (anonymous), oldest first.
    'openByHousehold', coalesce((select jsonb_agg(jsonb_build_object('open', o.open, 'oldestHours', floor(o.oldest_hours)) order by o.oldest_hours desc)
      from (select * from open_needs order by oldest_hours desc limit 20) o), '[]'::jsonb),
    'openTotal', (select coalesce(sum(o.open), 0) from open_needs o),
    -- Entries still Checking more than 7 days after they were added with no stated reason; and those kept
    -- Checking on purpose (a money or health entry whose question closed: "check before paying").
    'checkingOver7d', (select count(*) from public.homesend_changes c
      where c.confirmation_state = 'unconfirmed' and c.undone_at is null and c.created_at < v_now - interval '7 days'
        and not exists (select 1 from public.needs_you_items n where n.subject_id = c.intake_id and n.source in ('homesend_check', 'homesend_amount') and n.status <> 'open' and coalesce(n.answer, n.default_answer) = 'keep_checking')),
    'checkingKept', (select count(*) from public.homesend_changes c
      where c.confirmation_state = 'unconfirmed' and c.undone_at is null and c.created_at < v_now - interval '7 days'
        and exists (select 1 from public.needs_you_items n where n.subject_id = c.intake_id and n.source in ('homesend_check', 'homesend_amount') and n.status <> 'open' and coalesce(n.answer, n.default_answer) = 'keep_checking')),
    -- Entries undone (a "Not right" included) within 7 days of being added, out of those added in the last 30 days.
    'undoneWithin7d', jsonb_build_object(
      'count', (select count(*) from added a where a.undone_at is not null and a.undone_at < a.created_at + interval '7 days'),
      'of', (select count(*) from added)),
    -- 2026-11-20 ("as autonomous as possible, with minimum inputs"): questions asked per send; the share a person
    -- answered (withdrawn ones left out: nobody could answer them); entries confirmed without a tap, by basis
    -- (null: a question's default); and entries undone or corrected within 7 days of being added.
    'questionsAsked', jsonb_build_object(
      'count', (select count(*) from asked),
      'of', (select count(*) from sent)),
    'answeredByPerson', jsonb_build_object(
      'count', (select count(*) from asked q where q.status = 'answered'),
      'of', (select count(*) from asked q where q.status in ('answered', 'defaulted', 'expired'))),
    'confirmedWithoutTap', coalesce((select jsonb_agg(jsonb_build_object('basis', b.basis, 'count', b.n) order by b.n desc)
      from (select coalesce(a.confirmed_basis, 'default') as basis, count(*) as n
            from added a
            where a.confirmation_state = 'confirmed' and a.confirmed_at is not null and a.undone_at is null
              and a.confirmed_by_member_id is null and coalesce(a.confirmed_basis, '') <> 'person'
            group by 1) b), '[]'::jsonb),
    'undoneOrCorrectedWithin7d', jsonb_build_object(
      'count', (select count(*) from added a
        where (a.undone_at is not null and a.undone_at < a.created_at + interval '7 days')
           or exists (select 1 from public.ai_corrections k
                      where k.source_type = 'home_send_item' and k.source_id = a.intake_id
                        and k.created_at >= a.created_at and k.created_at < a.created_at + interval '7 days')),
      'of', (select count(*) from added))
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.platform_nothing_waits(uuid) from public, anon, authenticated;
grant execute on function public.platform_nothing_waits(uuid) to service_role;

comment on function public.platform_nothing_waits(uuid) is
  '"Nothing waits" measures for the platform-admin Overview: sends that needed a person, open Needs-you items per household (anonymous), Checking entries over 7 days, entries undone within 7 days; since 2026-11-20 questions per send, the share answered by a person, entries confirmed without a tap by basis, and entries undone or corrected within 7 days. service_role only; aggregate only.';

-- What the corrections measure joins on.
create index if not exists ai_corrections_source_id_idx on public.ai_corrections (source_id) where source_type = 'home_send_item';
