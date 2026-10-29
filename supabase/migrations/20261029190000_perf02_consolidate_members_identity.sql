-- PERF-02: consolidate overlapping permissive RLS policies (members-identity).
-- One permissive policy per {table, authenticated, command}; USING/WITH CHECK
-- are the exact OR of the originals, so the row set each role may read/write
-- is unchanged. Restrictive and non-authenticated policies are left intact.
-- Equivalence is proven by scripts/test-policy-consolidation-rls.mjs.

-- household_members: 4 permissive policy(ies) -> one per command.
drop policy if exists household_members_insert_admin on public.household_members;
drop policy if exists household_members_select_member on public.household_members;
drop policy if exists household_members_update_admin on public.household_members;
drop policy if exists household_members_update_self on public.household_members;
create policy household_members_select on public.household_members
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy household_members_insert on public.household_members
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy household_members_update on public.household_members
  for update to authenticated
  using (
    (((household_id, id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))))
    OR ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    (((household_id, id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))))
    OR ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists household_members_select on public.household_members;
--   drop policy if exists household_members_insert on public.household_members;
--   drop policy if exists household_members_update on public.household_members;
--   create policy household_members_insert_admin on public.household_members for insert to authenticated with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy household_members_select_member on public.household_members for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));
--   create policy household_members_update_admin on public.household_members for update to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy household_members_update_self on public.household_members for update to authenticated using (((household_id, id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id)))) with check (((household_id, id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id))));

-- profiles: 3 permissive policy(ies) -> one per command.
drop policy if exists profiles_select_household_peers on public.profiles;
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    ((EXISTS ( SELECT 1
   FROM (household_members mine
     JOIN household_members theirs ON ((theirs.household_id = mine.household_id)))
  WHERE ((mine.profile_id = ( SELECT auth.uid() AS uid)) AND (mine.status = 'active'::text) AND (theirs.profile_id = profiles.id)))))
    OR ((id = ( SELECT auth.uid() AS uid)))
  );
create policy profiles_update on public.profiles
  for update to authenticated
  using (
    ((id = ( SELECT auth.uid() AS uid)))
  )
  with check (
    ((id = ( SELECT auth.uid() AS uid)))
  );
-- ROLLBACK:
--   drop policy if exists profiles_select on public.profiles;
--   drop policy if exists profiles_update on public.profiles;
--   create policy profiles_select_household_peers on public.profiles for select to authenticated using ((EXISTS ( SELECT 1    FROM (household_members mine      JOIN household_members theirs ON ((theirs.household_id = mine.household_id)))   WHERE ((mine.profile_id = ( SELECT auth.uid() AS uid)) AND (mine.status = 'active'::text) AND (theirs.profile_id = profiles.id)))));
--   create policy profiles_select_own on public.profiles for select to authenticated using ((id = ( SELECT auth.uid() AS uid)));
--   create policy profiles_update_own on public.profiles for update to authenticated using ((id = ( SELECT auth.uid() AS uid))) with check ((id = ( SELECT auth.uid() AS uid)));

-- member_locations: 2 permissive policy(ies) -> one per command.
drop policy if exists member_locations_write_own on public.member_locations;
drop policy if exists member_locations_read on public.member_locations;
create policy member_locations_select on public.member_locations
  for select to authenticated
  using (
    ((((household_id, member_id) IN ( SELECT my_memberships.household_id,
    my_memberships.member_id
   FROM wh.my_memberships() my_memberships(household_id, member_id))) OR (EXISTS ( SELECT 1
   FROM household_members me
  WHERE ((me.household_id = member_locations.household_id) AND (me.profile_id = ( SELECT auth.uid() AS uid)) AND (me.member_type = 'adult'::text) AND (me.status = 'active'::text)))) OR ((EXISTS ( SELECT 1
   FROM household_members kid
  WHERE ((kid.household_id = member_locations.household_id) AND (kid.profile_id = ( SELECT auth.uid() AS uid)) AND (kid.member_type = 'child'::text) AND (kid.status = 'active'::text)))) AND (EXISTS ( SELECT 1
   FROM member_location_sharing s
  WHERE ((s.member_id = member_locations.member_id) AND (s.household_id = member_locations.household_id) AND s.enabled AND s.visible_to_children))))))
    OR (((household_id, member_id) IN ( SELECT my_memberships.household_id,
    my_memberships.member_id
   FROM wh.my_memberships() my_memberships(household_id, member_id))))
  );
create policy member_locations_insert on public.member_locations
  for insert to authenticated
  with check (
    ((((household_id, member_id) IN ( SELECT my_memberships.household_id,
    my_memberships.member_id
   FROM wh.my_memberships() my_memberships(household_id, member_id))) AND (EXISTS ( SELECT 1
   FROM member_location_sharing s
  WHERE ((s.member_id = member_locations.member_id) AND (s.household_id = member_locations.household_id) AND s.enabled)))))
  );
create policy member_locations_update on public.member_locations
  for update to authenticated
  using (
    (((household_id, member_id) IN ( SELECT my_memberships.household_id,
    my_memberships.member_id
   FROM wh.my_memberships() my_memberships(household_id, member_id))))
  )
  with check (
    ((((household_id, member_id) IN ( SELECT my_memberships.household_id,
    my_memberships.member_id
   FROM wh.my_memberships() my_memberships(household_id, member_id))) AND (EXISTS ( SELECT 1
   FROM member_location_sharing s
  WHERE ((s.member_id = member_locations.member_id) AND (s.household_id = member_locations.household_id) AND s.enabled)))))
  );
create policy member_locations_delete on public.member_locations
  for delete to authenticated
  using (
    (((household_id, member_id) IN ( SELECT my_memberships.household_id,
    my_memberships.member_id
   FROM wh.my_memberships() my_memberships(household_id, member_id))))
  );
-- ROLLBACK:
--   drop policy if exists member_locations_select on public.member_locations;
--   drop policy if exists member_locations_insert on public.member_locations;
--   drop policy if exists member_locations_update on public.member_locations;
--   drop policy if exists member_locations_delete on public.member_locations;
--   create policy member_locations_write_own on public.member_locations for all to authenticated using (((household_id, member_id) IN ( SELECT my_memberships.household_id,     my_memberships.member_id    FROM wh.my_memberships() my_memberships(household_id, member_id)))) with check ((((household_id, member_id) IN ( SELECT my_memberships.household_id,     my_memberships.member_id    FROM wh.my_memberships() my_memberships(household_id, member_id))) AND (EXISTS ( SELECT 1    FROM member_location_sharing s   WHERE ((s.member_id = member_locations.member_id) AND (s.household_id = member_locations.household_id) AND s.enabled)))));
--   create policy member_locations_read on public.member_locations for select to authenticated using ((((household_id, member_id) IN ( SELECT my_memberships.household_id,     my_memberships.member_id    FROM wh.my_memberships() my_memberships(household_id, member_id))) OR (EXISTS ( SELECT 1    FROM household_members me   WHERE ((me.household_id = member_locations.household_id) AND (me.profile_id = ( SELECT auth.uid() AS uid)) AND (me.member_type = 'adult'::text) AND (me.status = 'active'::text)))) OR ((EXISTS ( SELECT 1    FROM household_members kid   WHERE ((kid.household_id = member_locations.household_id) AND (kid.profile_id = ( SELECT auth.uid() AS uid)) AND (kid.member_type = 'child'::text) AND (kid.status = 'active'::text)))) AND (EXISTS ( SELECT 1    FROM member_location_sharing s   WHERE ((s.member_id = member_locations.member_id) AND (s.household_id = member_locations.household_id) AND s.enabled AND s.visible_to_children))))));

-- member_location_sharing: 2 permissive policy(ies) -> one per command.
drop policy if exists member_location_sharing_write on public.member_location_sharing;
drop policy if exists member_location_sharing_read on public.member_location_sharing;
create policy member_location_sharing_select on public.member_location_sharing
  for select to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND wh.may_set_location_sharing(household_id, member_id)))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy member_location_sharing_insert on public.member_location_sharing
  for insert to authenticated
  with check (
    ((wh.may_set_location_sharing(household_id, member_id) AND ((set_by IS NULL) OR ((household_id, set_by) IN ( SELECT my_memberships.household_id,
    my_memberships.member_id
   FROM wh.my_memberships() my_memberships(household_id, member_id))))))
  );
create policy member_location_sharing_update on public.member_location_sharing
  for update to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND wh.may_set_location_sharing(household_id, member_id)))
  )
  with check (
    ((wh.may_set_location_sharing(household_id, member_id) AND ((set_by IS NULL) OR ((household_id, set_by) IN ( SELECT my_memberships.household_id,
    my_memberships.member_id
   FROM wh.my_memberships() my_memberships(household_id, member_id))))))
  );
create policy member_location_sharing_delete on public.member_location_sharing
  for delete to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND wh.may_set_location_sharing(household_id, member_id)))
  );
-- ROLLBACK:
--   drop policy if exists member_location_sharing_select on public.member_location_sharing;
--   drop policy if exists member_location_sharing_insert on public.member_location_sharing;
--   drop policy if exists member_location_sharing_update on public.member_location_sharing;
--   drop policy if exists member_location_sharing_delete on public.member_location_sharing;
--   create policy member_location_sharing_write on public.member_location_sharing for all to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND wh.may_set_location_sharing(household_id, member_id))) with check ((wh.may_set_location_sharing(household_id, member_id) AND ((set_by IS NULL) OR ((household_id, set_by) IN ( SELECT my_memberships.household_id,     my_memberships.member_id    FROM wh.my_memberships() my_memberships(household_id, member_id))))));
--   create policy member_location_sharing_read on public.member_location_sharing for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- notification_preferences: 2 permissive policy(ies) -> one per command.
drop policy if exists notification_preferences_write_own on public.notification_preferences;
drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select on public.notification_preferences
  for select to authenticated
  using (
    ((((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR (household_id IN ( SELECT wh.admin_households() AS admin_households))))
    OR (((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))))
  );
create policy notification_preferences_insert on public.notification_preferences
  for insert to authenticated
  with check (
    (((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))))
  );
create policy notification_preferences_update on public.notification_preferences
  for update to authenticated
  using (
    (((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))))
  )
  with check (
    (((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))))
  );
create policy notification_preferences_delete on public.notification_preferences
  for delete to authenticated
  using (
    (((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))))
  );
-- ROLLBACK:
--   drop policy if exists notification_preferences_select on public.notification_preferences;
--   drop policy if exists notification_preferences_insert on public.notification_preferences;
--   drop policy if exists notification_preferences_update on public.notification_preferences;
--   drop policy if exists notification_preferences_delete on public.notification_preferences;
--   create policy notification_preferences_write_own on public.notification_preferences for all to authenticated using (((household_id, member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id)))) with check (((household_id, member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id))));
--   create policy notification_preferences_select_own on public.notification_preferences for select to authenticated using ((((household_id, member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id))) OR (household_id IN ( SELECT wh.admin_households() AS admin_households))));

-- reminder_preferences: 2 permissive policy(ies) -> one per command.
drop policy if exists reminder_preferences_write_own on public.reminder_preferences;
drop policy if exists reminder_preferences_select_own on public.reminder_preferences;
create policy reminder_preferences_select on public.reminder_preferences
  for select to authenticated
  using (
    ((((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR (household_id IN ( SELECT wh.admin_households() AS admin_households))))
    OR (((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))))
  );
create policy reminder_preferences_insert on public.reminder_preferences
  for insert to authenticated
  with check (
    (((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))))
  );
create policy reminder_preferences_update on public.reminder_preferences
  for update to authenticated
  using (
    (((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))))
  )
  with check (
    (((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))))
  );
create policy reminder_preferences_delete on public.reminder_preferences
  for delete to authenticated
  using (
    (((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))))
  );
-- ROLLBACK:
--   drop policy if exists reminder_preferences_select on public.reminder_preferences;
--   drop policy if exists reminder_preferences_insert on public.reminder_preferences;
--   drop policy if exists reminder_preferences_update on public.reminder_preferences;
--   drop policy if exists reminder_preferences_delete on public.reminder_preferences;
--   create policy reminder_preferences_write_own on public.reminder_preferences for all to authenticated using (((household_id, member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id)))) with check (((household_id, member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id))));
--   create policy reminder_preferences_select_own on public.reminder_preferences for select to authenticated using ((((household_id, member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id))) OR (household_id IN ( SELECT wh.admin_households() AS admin_households))));

-- household_voice_settings: 2 permissive policy(ies) -> one per command.
drop policy if exists household_voice_settings_write_admin on public.household_voice_settings;
drop policy if exists household_voice_settings_read on public.household_voice_settings;
create policy household_voice_settings_select on public.household_voice_settings
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy household_voice_settings_insert on public.household_voice_settings
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy household_voice_settings_update on public.household_voice_settings
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy household_voice_settings_delete on public.household_voice_settings
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists household_voice_settings_select on public.household_voice_settings;
--   drop policy if exists household_voice_settings_insert on public.household_voice_settings;
--   drop policy if exists household_voice_settings_update on public.household_voice_settings;
--   drop policy if exists household_voice_settings_delete on public.household_voice_settings;
--   create policy household_voice_settings_write_admin on public.household_voice_settings for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy household_voice_settings_read on public.household_voice_settings for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- helper_profiles: 2 permissive policy(ies) -> one per command.
drop policy if exists helper_profiles_write_admin on public.helper_profiles;
drop policy if exists helper_profiles_select_member on public.helper_profiles;
create policy helper_profiles_select on public.helper_profiles
  for select to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))))))
    OR ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy helper_profiles_insert on public.helper_profiles
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy helper_profiles_update on public.helper_profiles
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy helper_profiles_delete on public.helper_profiles
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists helper_profiles_select on public.helper_profiles;
--   drop policy if exists helper_profiles_insert on public.helper_profiles;
--   drop policy if exists helper_profiles_update on public.helper_profiles;
--   drop policy if exists helper_profiles_delete on public.helper_profiles;
--   create policy helper_profiles_write_admin on public.helper_profiles for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy helper_profiles_select_member on public.helper_profiles for select to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id))))));

-- health_consents: 2 permissive policy(ies) -> one per command.
drop policy if exists health_consents_write_subject_or_guardian on public.health_consents;
drop policy if exists health_consents_select_party on public.health_consents;
create policy health_consents_select on public.health_consents
  for select to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (((household_id, subject_member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR ((household_id, viewer_member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR (EXISTS ( SELECT 1
   FROM member_guardians g
  WHERE ((g.child_member_id = health_consents.subject_member_id) AND ((g.household_id, g.guardian_member_id) IN ( SELECT mm.household_id,
            mm.member_id
           FROM wh.my_memberships() mm(household_id, member_id)))))))))
    OR (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (((household_id, subject_member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR (EXISTS ( SELECT 1
   FROM member_guardians g
  WHERE ((g.child_member_id = health_consents.subject_member_id) AND ((g.household_id, g.guardian_member_id) IN ( SELECT mm.household_id,
            mm.member_id
           FROM wh.my_memberships() mm(household_id, member_id)))))))))
  );
create policy health_consents_insert on public.health_consents
  for insert to authenticated
  with check (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (((household_id, subject_member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR (EXISTS ( SELECT 1
   FROM member_guardians g
  WHERE ((g.child_member_id = health_consents.subject_member_id) AND ((g.household_id, g.guardian_member_id) IN ( SELECT mm.household_id,
            mm.member_id
           FROM wh.my_memberships() mm(household_id, member_id)))))))))
  );
create policy health_consents_update on public.health_consents
  for update to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (((household_id, subject_member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR (EXISTS ( SELECT 1
   FROM member_guardians g
  WHERE ((g.child_member_id = health_consents.subject_member_id) AND ((g.household_id, g.guardian_member_id) IN ( SELECT mm.household_id,
            mm.member_id
           FROM wh.my_memberships() mm(household_id, member_id)))))))))
  )
  with check (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (((household_id, subject_member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR (EXISTS ( SELECT 1
   FROM member_guardians g
  WHERE ((g.child_member_id = health_consents.subject_member_id) AND ((g.household_id, g.guardian_member_id) IN ( SELECT mm.household_id,
            mm.member_id
           FROM wh.my_memberships() mm(household_id, member_id)))))))))
  );
create policy health_consents_delete on public.health_consents
  for delete to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (((household_id, subject_member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id))) OR (EXISTS ( SELECT 1
   FROM member_guardians g
  WHERE ((g.child_member_id = health_consents.subject_member_id) AND ((g.household_id, g.guardian_member_id) IN ( SELECT mm.household_id,
            mm.member_id
           FROM wh.my_memberships() mm(household_id, member_id)))))))))
  );
-- ROLLBACK:
--   drop policy if exists health_consents_select on public.health_consents;
--   drop policy if exists health_consents_insert on public.health_consents;
--   drop policy if exists health_consents_update on public.health_consents;
--   drop policy if exists health_consents_delete on public.health_consents;
--   create policy health_consents_write_subject_or_guardian on public.health_consents for all to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (((household_id, subject_member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id))) OR (EXISTS ( SELECT 1    FROM member_guardians g   WHERE ((g.child_member_id = health_consents.subject_member_id) AND ((g.household_id, g.guardian_member_id) IN ( SELECT mm.household_id,             mm.member_id            FROM wh.my_memberships() mm(household_id, member_id))))))))) with check (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (((household_id, subject_member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id))) OR (EXISTS ( SELECT 1    FROM member_guardians g   WHERE ((g.child_member_id = health_consents.subject_member_id) AND ((g.household_id, g.guardian_member_id) IN ( SELECT mm.household_id,             mm.member_id            FROM wh.my_memberships() mm(household_id, member_id)))))))));
--   create policy health_consents_select_party on public.health_consents for select to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (((household_id, subject_member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id))) OR ((household_id, viewer_member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id))) OR (EXISTS ( SELECT 1    FROM member_guardians g   WHERE ((g.child_member_id = health_consents.subject_member_id) AND ((g.household_id, g.guardian_member_id) IN ( SELECT mm.household_id,             mm.member_id            FROM wh.my_memberships() mm(household_id, member_id)))))))));

-- school_communications: 2 permissive policy(ies) -> one per command.
drop policy if exists school_communications_write_admin on public.school_communications;
drop policy if exists school_communications_select_guardian on public.school_communications;
create policy school_communications_select on public.school_communications
  for select to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (((child_member_id IS NULL) AND (household_id IN ( SELECT wh.admin_households() AS admin_households))) OR ((child_member_id IS NOT NULL) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,
    wh_m.member_id
   FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,
    wh_g.child_member_id
   FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))))))
    OR ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy school_communications_insert on public.school_communications
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy school_communications_update on public.school_communications
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy school_communications_delete on public.school_communications
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists school_communications_select on public.school_communications;
--   drop policy if exists school_communications_insert on public.school_communications;
--   drop policy if exists school_communications_update on public.school_communications;
--   drop policy if exists school_communications_delete on public.school_communications;
--   create policy school_communications_write_admin on public.school_communications for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy school_communications_select_guardian on public.school_communications for select to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND (((child_member_id IS NULL) AND (household_id IN ( SELECT wh.admin_households() AS admin_households))) OR ((child_member_id IS NOT NULL) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,     wh_m.member_id    FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,     wh_g.child_member_id    FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))))));

-- school_documents: 2 permissive policy(ies) -> one per command.
drop policy if exists school_documents_write_guardian on public.school_documents;
drop policy if exists school_documents_select_guardian on public.school_documents;
create policy school_documents_select on public.school_documents
  for select to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,
    wh_m.member_id
   FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,
    wh_g.child_member_id
   FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))))
  );
create policy school_documents_insert on public.school_documents
  for insert to authenticated
  with check (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,
    wh_m.member_id
   FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,
    wh_g.child_member_id
   FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))))
  );
create policy school_documents_update on public.school_documents
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
create policy school_documents_delete on public.school_documents
  for delete to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,
    wh_m.member_id
   FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,
    wh_g.child_member_id
   FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))))
  );
-- ROLLBACK:
--   drop policy if exists school_documents_select on public.school_documents;
--   drop policy if exists school_documents_insert on public.school_documents;
--   drop policy if exists school_documents_update on public.school_documents;
--   drop policy if exists school_documents_delete on public.school_documents;
--   create policy school_documents_write_guardian on public.school_documents for all to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,     wh_m.member_id    FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,     wh_g.child_member_id    FROM wh.my_guarded_children() wh_g(household_id, child_member_id)))))) with check (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,     wh_m.member_id    FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,     wh_g.child_member_id    FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))));
--   create policy school_documents_select_guardian on public.school_documents for select to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,     wh_m.member_id    FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,     wh_g.child_member_id    FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))));

-- school_enrolments: 2 permissive policy(ies) -> one per command.
drop policy if exists school_enrolments_write_guardian on public.school_enrolments;
drop policy if exists school_enrolments_select_guardian on public.school_enrolments;
create policy school_enrolments_select on public.school_enrolments
  for select to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,
    wh_m.member_id
   FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,
    wh_g.child_member_id
   FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))))
  );
create policy school_enrolments_insert on public.school_enrolments
  for insert to authenticated
  with check (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,
    wh_m.member_id
   FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,
    wh_g.child_member_id
   FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))))
  );
create policy school_enrolments_update on public.school_enrolments
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
create policy school_enrolments_delete on public.school_enrolments
  for delete to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,
    wh_m.member_id
   FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,
    wh_g.child_member_id
   FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))))
  );
-- ROLLBACK:
--   drop policy if exists school_enrolments_select on public.school_enrolments;
--   drop policy if exists school_enrolments_insert on public.school_enrolments;
--   drop policy if exists school_enrolments_update on public.school_enrolments;
--   drop policy if exists school_enrolments_delete on public.school_enrolments;
--   create policy school_enrolments_write_guardian on public.school_enrolments for all to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,     wh_m.member_id    FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,     wh_g.child_member_id    FROM wh.my_guarded_children() wh_g(household_id, child_member_id)))))) with check (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,     wh_m.member_id    FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,     wh_g.child_member_id    FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))));
--   create policy school_enrolments_select_guardian on public.school_enrolments for select to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,     wh_m.member_id    FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,     wh_g.child_member_id    FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))));

-- school_items: 2 permissive policy(ies) -> one per command.
drop policy if exists school_items_write_guardian on public.school_items;
drop policy if exists school_items_select_guardian on public.school_items;
create policy school_items_select on public.school_items
  for select to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,
    wh_m.member_id
   FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,
    wh_g.child_member_id
   FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))))
  );
create policy school_items_insert on public.school_items
  for insert to authenticated
  with check (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,
    wh_m.member_id
   FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,
    wh_g.child_member_id
   FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))))
  );
create policy school_items_update on public.school_items
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
create policy school_items_delete on public.school_items
  for delete to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,
    wh_m.member_id
   FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,
    wh_g.child_member_id
   FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))))
  );
-- ROLLBACK:
--   drop policy if exists school_items_select on public.school_items;
--   drop policy if exists school_items_insert on public.school_items;
--   drop policy if exists school_items_update on public.school_items;
--   drop policy if exists school_items_delete on public.school_items;
--   create policy school_items_write_guardian on public.school_items for all to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,     wh_m.member_id    FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,     wh_g.child_member_id    FROM wh.my_guarded_children() wh_g(household_id, child_member_id)))))) with check (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,     wh_m.member_id    FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,     wh_g.child_member_id    FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))));
--   create policy school_items_select_guardian on public.school_items for select to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,     wh_m.member_id    FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,     wh_g.child_member_id    FROM wh.my_guarded_children() wh_g(household_id, child_member_id))))));

