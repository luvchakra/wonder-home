-- A child's "Done" on a goal waits for a grown-up (the owner, 2026-10-20:
-- "send this to adult for verification before making done").
--
-- A check-in the child makes themselves is kept with no `verified_at`: it is
-- waiting. A guardian or an Admin verifies it (stars, the streak and the
-- reward then count it) or says "not yet", which takes the check-in back. One
-- a guardian or Admin makes is verified as it is made. Rows made before this
-- were trusted at the time and stay counted.
--
-- Rollback: alter table public.child_goal_checkins drop column verified_at,
-- drop column verified_by; restore the 20261020150000 insert/delete policies
-- and the 20261020130000 source_type check.

alter table public.child_goal_checkins
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.household_members(id) on delete set null;

update public.child_goal_checkins set verified_at = created_at, verified_by = checked_by where verified_at is null;

comment on column public.child_goal_checkins.verified_at is
  'When a guardian or Admin confirmed the child did it; null while it waits. Only verified check-ins earn stars.';

create index if not exists child_goal_checkins_verified_by_idx on public.child_goal_checkins (verified_by);
create index if not exists child_goal_checkins_created_idx on public.child_goal_checkins (created_at);
create index if not exists child_goal_checkins_waiting_idx on public.child_goal_checkins (household_id, child_member_id) where verified_at is null;

-- The child, or a guardian, for a current goal of that child, no later than
-- tomorrow on any clock; only a guardian or an Admin may make one verified, in
-- their own name.
drop policy if exists child_goal_checkins_insert on public.child_goal_checkins;
create policy child_goal_checkins_insert on public.child_goal_checkins for insert
  to authenticated
  with check (
    household_id in (select wh.member_households())
    and wh.may_see_child(household_id, child_member_id)
    and on_day <= (now() at time zone 'utc')::date + 1
    and exists (
      select 1 from public.child_goals g
      where g.id = goal_id and g.household_id = child_goal_checkins.household_id
        and g.child_member_id = child_goal_checkins.child_member_id and g.active
    )
    and (
      (verified_at is null and verified_by is null)
      or (
        (household_id, verified_by) in (select household_id, member_id from wh.my_memberships())
        and wh.may_change_child(household_id, child_member_id)
      )
    )
  );

-- Verifying is a guardian's or an Admin's, in their own name.
drop policy if exists child_goal_checkins_verify on public.child_goal_checkins;
create policy child_goal_checkins_verify on public.child_goal_checkins for update
  to authenticated
  using (household_id in (select wh.member_households()) and wh.may_change_child(household_id, child_member_id))
  with check (
    wh.may_change_child(household_id, child_member_id)
    and (verified_by is null or (household_id, verified_by) in (select household_id, member_id from wh.my_memberships()))
  );

-- The child takes back only what is still waiting; a guardian or Admin, any.
drop policy if exists child_goal_checkins_delete on public.child_goal_checkins;
create policy child_goal_checkins_delete on public.child_goal_checkins for delete
  to authenticated
  using (
    household_id in (select wh.member_households())
    and wh.may_see_child(household_id, child_member_id)
    and (verified_at is null or wh.may_change_child(household_id, child_member_id))
  );

grant update (verified_at, verified_by) on public.child_goal_checkins to authenticated;

-- The grown-up hears about it as a notice (27-004 pattern): one per waiting check-in.
alter table public.notifications drop constraint notifications_source_type_check;
alter table public.notifications add constraint notifications_source_type_check
  check (source_type in ('obligation', 'school_item', 'school_day', 'meal', 'grocery_list', 'pet_care_need', 'family_event',
                         'health_appointment', 'health_routine', 'health_checkup', 'approval', 'reminder',
                         'payment', 'payment_refund',
                         'homesend_item', 'event_replies', 'helper_absence', 'grocery_order', 'event_change', 'weather_plan',
                         'goal_checkin',
                         'digest'));

notify pgrst, 'reload schema';
