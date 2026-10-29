-- PERF-02: consolidate overlapping permissive RLS policies (calendar-events).
-- One permissive policy per {table, authenticated, command}; USING/WITH CHECK
-- are the exact OR of the originals, so the row set each role may read/write
-- is unchanged. Restrictive and non-authenticated policies are left intact.
-- Equivalence is proven by scripts/test-policy-consolidation-rls.mjs.

-- calendar_subscriptions: 2 permissive policy(ies) -> one per command.
drop policy if exists calendar_subscriptions_write_adult on public.calendar_subscriptions;
drop policy if exists calendar_subscriptions_select_member on public.calendar_subscriptions;
create policy calendar_subscriptions_select on public.calendar_subscriptions
  for select to authenticated
  using (
    (((household_id IN ( SELECT wh.adult_households() AS adult_households)) AND ((visibility = 'household'::text) OR ((household_id, owner_member_id) IN ( SELECT my_memberships.household_id,
    my_memberships.member_id
   FROM wh.my_memberships() my_memberships(household_id, member_id))))))
    OR (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((visibility = 'household'::text) OR ((household_id, owner_member_id) IN ( SELECT my_memberships.household_id,
    my_memberships.member_id
   FROM wh.my_memberships() my_memberships(household_id, member_id))))))
  );
create policy calendar_subscriptions_insert on public.calendar_subscriptions
  for insert to authenticated
  with check (
    (((household_id IN ( SELECT wh.adult_households() AS adult_households)) AND ((visibility = 'household'::text) OR ((household_id, owner_member_id) IN ( SELECT my_memberships.household_id,
    my_memberships.member_id
   FROM wh.my_memberships() my_memberships(household_id, member_id))))))
  );
create policy calendar_subscriptions_update on public.calendar_subscriptions
  for update to authenticated
  using (
    (((household_id IN ( SELECT wh.adult_households() AS adult_households)) AND ((visibility = 'household'::text) OR ((household_id, owner_member_id) IN ( SELECT my_memberships.household_id,
    my_memberships.member_id
   FROM wh.my_memberships() my_memberships(household_id, member_id))))))
  )
  with check (
    (((household_id IN ( SELECT wh.adult_households() AS adult_households)) AND ((visibility = 'household'::text) OR ((household_id, owner_member_id) IN ( SELECT my_memberships.household_id,
    my_memberships.member_id
   FROM wh.my_memberships() my_memberships(household_id, member_id))))))
  );
create policy calendar_subscriptions_delete on public.calendar_subscriptions
  for delete to authenticated
  using (
    (((household_id IN ( SELECT wh.adult_households() AS adult_households)) AND ((visibility = 'household'::text) OR ((household_id, owner_member_id) IN ( SELECT my_memberships.household_id,
    my_memberships.member_id
   FROM wh.my_memberships() my_memberships(household_id, member_id))))))
  );
-- ROLLBACK:
--   drop policy if exists calendar_subscriptions_select on public.calendar_subscriptions;
--   drop policy if exists calendar_subscriptions_insert on public.calendar_subscriptions;
--   drop policy if exists calendar_subscriptions_update on public.calendar_subscriptions;
--   drop policy if exists calendar_subscriptions_delete on public.calendar_subscriptions;
--   create policy calendar_subscriptions_write_adult on public.calendar_subscriptions for all to authenticated using (((household_id IN ( SELECT wh.adult_households() AS adult_households)) AND ((visibility = 'household'::text) OR ((household_id, owner_member_id) IN ( SELECT my_memberships.household_id,     my_memberships.member_id    FROM wh.my_memberships() my_memberships(household_id, member_id)))))) with check (((household_id IN ( SELECT wh.adult_households() AS adult_households)) AND ((visibility = 'household'::text) OR ((household_id, owner_member_id) IN ( SELECT my_memberships.household_id,     my_memberships.member_id    FROM wh.my_memberships() my_memberships(household_id, member_id))))));
--   create policy calendar_subscriptions_select_member on public.calendar_subscriptions for select to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((visibility = 'household'::text) OR ((household_id, owner_member_id) IN ( SELECT my_memberships.household_id,     my_memberships.member_id    FROM wh.my_memberships() my_memberships(household_id, member_id))))));

-- event_exceptions: 2 permissive policy(ies) -> one per command.
drop policy if exists event_exceptions_write_editor on public.event_exceptions;
drop policy if exists event_exceptions_select_visible on public.event_exceptions;
create policy event_exceptions_select on public.event_exceptions
  for select to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (event_id IN ( SELECT wh.my_visible_events() AS my_visible_events))))
    OR (((household_id IN ( SELECT wh.member_households() AS member_households)) AND wh.may_edit_event(event_id)))
  );
create policy event_exceptions_insert on public.event_exceptions
  for insert to authenticated
  with check (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND wh.may_edit_event(event_id) AND (EXISTS ( SELECT 1
   FROM family_events e
  WHERE ((e.id = event_exceptions.event_id) AND (e.household_id = event_exceptions.household_id) AND (e.recurrence IS NOT NULL))))))
  );
create policy event_exceptions_update on public.event_exceptions
  for update to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND wh.may_edit_event(event_id)))
  )
  with check (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND wh.may_edit_event(event_id) AND (EXISTS ( SELECT 1
   FROM family_events e
  WHERE ((e.id = event_exceptions.event_id) AND (e.household_id = event_exceptions.household_id) AND (e.recurrence IS NOT NULL))))))
  );
create policy event_exceptions_delete on public.event_exceptions
  for delete to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND wh.may_edit_event(event_id)))
  );
-- ROLLBACK:
--   drop policy if exists event_exceptions_select on public.event_exceptions;
--   drop policy if exists event_exceptions_insert on public.event_exceptions;
--   drop policy if exists event_exceptions_update on public.event_exceptions;
--   drop policy if exists event_exceptions_delete on public.event_exceptions;
--   create policy event_exceptions_write_editor on public.event_exceptions for all to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND wh.may_edit_event(event_id))) with check (((household_id IN ( SELECT wh.member_households() AS member_households)) AND wh.may_edit_event(event_id) AND (EXISTS ( SELECT 1    FROM family_events e   WHERE ((e.id = event_exceptions.event_id) AND (e.household_id = event_exceptions.household_id) AND (e.recurrence IS NOT NULL))))));
--   create policy event_exceptions_select_visible on public.event_exceptions for select to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (event_id IN ( SELECT wh.my_visible_events() AS my_visible_events))));

-- event_participants: 3 permissive policy(ies) -> one per command.
drop policy if exists event_participants_write_event_owner on public.event_participants;
drop policy if exists event_participants_write_own on public.event_participants;
drop policy if exists event_participants_select_member on public.event_participants;
create policy event_participants_select on public.event_participants
  for select to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR (household_id IN ( SELECT wh.admin_households() AS admin_households)))))
    OR (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (EXISTS ( SELECT 1
   FROM family_events e
  WHERE ((e.id = event_participants.event_id) AND (e.household_id = event_participants.household_id) AND ((e.owner_member_id IS NULL) OR ((e.household_id, e.owner_member_id) IN ( SELECT mm.household_id,
            mm.member_id
           FROM wh.my_memberships() mm(household_id, member_id)))))))))
    OR (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (event_id IN ( SELECT wh.my_visible_events() AS my_visible_events))))
  );
create policy event_participants_insert on public.event_participants
  for insert to authenticated
  with check (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR (household_id IN ( SELECT wh.admin_households() AS admin_households)))))
    OR (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (EXISTS ( SELECT 1
   FROM family_events e
  WHERE ((e.id = event_participants.event_id) AND (e.household_id = event_participants.household_id) AND ((e.owner_member_id IS NULL) OR ((e.household_id, e.owner_member_id) IN ( SELECT mm.household_id,
            mm.member_id
           FROM wh.my_memberships() mm(household_id, member_id)))))))))
  );
create policy event_participants_update on public.event_participants
  for update to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR (household_id IN ( SELECT wh.admin_households() AS admin_households)))))
    OR (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (EXISTS ( SELECT 1
   FROM family_events e
  WHERE ((e.id = event_participants.event_id) AND (e.household_id = event_participants.household_id) AND ((e.owner_member_id IS NULL) OR ((e.household_id, e.owner_member_id) IN ( SELECT mm.household_id,
            mm.member_id
           FROM wh.my_memberships() mm(household_id, member_id)))))))))
  )
  with check (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR (household_id IN ( SELECT wh.admin_households() AS admin_households)))))
    OR (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (EXISTS ( SELECT 1
   FROM family_events e
  WHERE ((e.id = event_participants.event_id) AND (e.household_id = event_participants.household_id) AND ((e.owner_member_id IS NULL) OR ((e.household_id, e.owner_member_id) IN ( SELECT mm.household_id,
            mm.member_id
           FROM wh.my_memberships() mm(household_id, member_id)))))))))
  );
create policy event_participants_delete on public.event_participants
  for delete to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR (household_id IN ( SELECT wh.admin_households() AS admin_households)))))
    OR (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (EXISTS ( SELECT 1
   FROM family_events e
  WHERE ((e.id = event_participants.event_id) AND (e.household_id = event_participants.household_id) AND ((e.owner_member_id IS NULL) OR ((e.household_id, e.owner_member_id) IN ( SELECT mm.household_id,
            mm.member_id
           FROM wh.my_memberships() mm(household_id, member_id)))))))))
  );
-- ROLLBACK:
--   drop policy if exists event_participants_select on public.event_participants;
--   drop policy if exists event_participants_insert on public.event_participants;
--   drop policy if exists event_participants_update on public.event_participants;
--   drop policy if exists event_participants_delete on public.event_participants;
--   create policy event_participants_write_event_owner on public.event_participants for all to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (EXISTS ( SELECT 1    FROM family_events e   WHERE ((e.id = event_participants.event_id) AND (e.household_id = event_participants.household_id) AND ((e.owner_member_id IS NULL) OR ((e.household_id, e.owner_member_id) IN ( SELECT mm.household_id,             mm.member_id            FROM wh.my_memberships() mm(household_id, member_id))))))))) with check (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (EXISTS ( SELECT 1    FROM family_events e   WHERE ((e.id = event_participants.event_id) AND (e.household_id = event_participants.household_id) AND ((e.owner_member_id IS NULL) OR ((e.household_id, e.owner_member_id) IN ( SELECT mm.household_id,             mm.member_id            FROM wh.my_memberships() mm(household_id, member_id)))))))));
--   create policy event_participants_write_own on public.event_participants for all to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (((household_id, member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id))) OR (household_id IN ( SELECT wh.admin_households() AS admin_households))))) with check (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (((household_id, member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id))) OR (household_id IN ( SELECT wh.admin_households() AS admin_households)))));
--   create policy event_participants_select_member on public.event_participants for select to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (event_id IN ( SELECT wh.my_visible_events() AS my_visible_events))));

-- availability_exceptions: 2 permissive policy(ies) -> one per command.
drop policy if exists availability_exceptions_write_own_or_admin on public.availability_exceptions;
drop policy if exists availability_exceptions_select_member on public.availability_exceptions;
create policy availability_exceptions_select on public.availability_exceptions
  for select to authenticated
  using (
    (((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id)))))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy availability_exceptions_insert on public.availability_exceptions
  for insert to authenticated
  with check (
    (((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id)))))
  );
create policy availability_exceptions_update on public.availability_exceptions
  for update to authenticated
  using (
    (((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id)))))
  )
  with check (
    (((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id)))))
  );
create policy availability_exceptions_delete on public.availability_exceptions
  for delete to authenticated
  using (
    (((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id)))))
  );
-- ROLLBACK:
--   drop policy if exists availability_exceptions_select on public.availability_exceptions;
--   drop policy if exists availability_exceptions_insert on public.availability_exceptions;
--   drop policy if exists availability_exceptions_update on public.availability_exceptions;
--   drop policy if exists availability_exceptions_delete on public.availability_exceptions;
--   create policy availability_exceptions_write_own_or_admin on public.availability_exceptions for all to authenticated using (((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id))))) with check (((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id)))));
--   create policy availability_exceptions_select_member on public.availability_exceptions for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- member_availability: 2 permissive policy(ies) -> one per command.
drop policy if exists member_availability_write_own_or_admin on public.member_availability;
drop policy if exists member_availability_select_member on public.member_availability;
create policy member_availability_select on public.member_availability
  for select to authenticated
  using (
    (((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id)))))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy member_availability_insert on public.member_availability
  for insert to authenticated
  with check (
    (((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id)))))
  );
create policy member_availability_update on public.member_availability
  for update to authenticated
  using (
    (((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id)))))
  )
  with check (
    (((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id)))))
  );
create policy member_availability_delete on public.member_availability
  for delete to authenticated
  using (
    (((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id)))))
  );
-- ROLLBACK:
--   drop policy if exists member_availability_select on public.member_availability;
--   drop policy if exists member_availability_insert on public.member_availability;
--   drop policy if exists member_availability_update on public.member_availability;
--   drop policy if exists member_availability_delete on public.member_availability;
--   create policy member_availability_write_own_or_admin on public.member_availability for all to authenticated using (((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id))))) with check (((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id)))));
--   create policy member_availability_select_member on public.member_availability for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- study_sessions: 2 permissive policy(ies) -> one per command.
drop policy if exists study_sessions_write_guardian on public.study_sessions;
drop policy if exists study_sessions_select_guardian on public.study_sessions;
create policy study_sessions_select on public.study_sessions
  for select to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,
    wh_m.member_id
   FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,
    wh_g.child_member_id
   FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))))
  );
create policy study_sessions_insert on public.study_sessions
  for insert to authenticated
  with check (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,
    wh_m.member_id
   FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,
    wh_g.child_member_id
   FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))))
  );
create policy study_sessions_update on public.study_sessions
  for update to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,
    wh_m.member_id
   FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,
    wh_g.child_member_id
   FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))))
  )
  with check (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,
    wh_m.member_id
   FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,
    wh_g.child_member_id
   FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))))
  );
create policy study_sessions_delete on public.study_sessions
  for delete to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,
    wh_m.member_id
   FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,
    wh_g.child_member_id
   FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))))
  );
-- ROLLBACK:
--   drop policy if exists study_sessions_select on public.study_sessions;
--   drop policy if exists study_sessions_insert on public.study_sessions;
--   drop policy if exists study_sessions_update on public.study_sessions;
--   drop policy if exists study_sessions_delete on public.study_sessions;
--   create policy study_sessions_write_guardian on public.study_sessions for all to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,     wh_m.member_id    FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,     wh_g.child_member_id    FROM wh.my_guarded_children() wh_g(household_id, child_member_id)))))) with check (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,     wh_m.member_id    FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,     wh_g.child_member_id    FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))));
--   create policy study_sessions_select_guardian on public.study_sessions for select to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,     wh_m.member_id    FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,     wh_g.child_member_id    FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))));

