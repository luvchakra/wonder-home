-- PERF-02: consolidate overlapping permissive RLS policies (home-assets-work).
-- One permissive policy per {table, authenticated, command}; USING/WITH CHECK
-- are the exact OR of the originals, so the row set each role may read/write
-- is unchanged. Restrictive and non-authenticated policies are left intact.
-- Equivalence is proven by scripts/test-policy-consolidation-rls.mjs.

-- home_assets: 3 permissive policy(ies) -> one per command.
drop policy if exists home_assets_write_admin on public.home_assets;
drop policy if exists home_assets_select_member on public.home_assets;
drop policy if exists home_assets_update_responsible on public.home_assets;
create policy home_assets_select on public.home_assets
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy home_assets_insert on public.home_assets
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy home_assets_update on public.home_assets
  for update to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id, responsible_member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id)))))
    OR ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id, responsible_member_id) IN ( SELECT mm.household_id,
    mm.member_id
   FROM wh.my_memberships() mm(household_id, member_id)))))
    OR ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy home_assets_delete on public.home_assets
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists home_assets_select on public.home_assets;
--   drop policy if exists home_assets_insert on public.home_assets;
--   drop policy if exists home_assets_update on public.home_assets;
--   drop policy if exists home_assets_delete on public.home_assets;
--   create policy home_assets_write_admin on public.home_assets for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy home_assets_select_member on public.home_assets for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));
--   create policy home_assets_update_responsible on public.home_assets for update to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id, responsible_member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id))))) with check (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((household_id, responsible_member_id) IN ( SELECT mm.household_id,     mm.member_id    FROM wh.my_memberships() mm(household_id, member_id)))));

-- asset_service_events: 3 permissive policy(ies) -> one per command.
drop policy if exists asset_service_events_write_admin on public.asset_service_events;
drop policy if exists asset_service_events_insert_member on public.asset_service_events;
drop policy if exists asset_service_events_select_member on public.asset_service_events;
create policy asset_service_events_select on public.asset_service_events
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy asset_service_events_insert on public.asset_service_events
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy asset_service_events_update on public.asset_service_events
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy asset_service_events_delete on public.asset_service_events
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists asset_service_events_select on public.asset_service_events;
--   drop policy if exists asset_service_events_insert on public.asset_service_events;
--   drop policy if exists asset_service_events_update on public.asset_service_events;
--   drop policy if exists asset_service_events_delete on public.asset_service_events;
--   create policy asset_service_events_write_admin on public.asset_service_events for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy asset_service_events_insert_member on public.asset_service_events for insert to authenticated with check ((household_id IN ( SELECT wh.member_households() AS member_households)));
--   create policy asset_service_events_select_member on public.asset_service_events for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- backup_services: 2 permissive policy(ies) -> one per command.
drop policy if exists backup_services_write_admin on public.backup_services;
drop policy if exists backup_services_select_admin on public.backup_services;
create policy backup_services_select on public.backup_services
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy backup_services_insert on public.backup_services
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy backup_services_update on public.backup_services
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy backup_services_delete on public.backup_services
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists backup_services_select on public.backup_services;
--   drop policy if exists backup_services_insert on public.backup_services;
--   drop policy if exists backup_services_update on public.backup_services;
--   drop policy if exists backup_services_delete on public.backup_services;
--   create policy backup_services_write_admin on public.backup_services for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy backup_services_select_admin on public.backup_services for select to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households)));

-- responsibilities: 2 permissive policy(ies) -> one per command.
drop policy if exists responsibilities_write_admin on public.responsibilities;
drop policy if exists responsibilities_select_member on public.responsibilities;
create policy responsibilities_select on public.responsibilities
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy responsibilities_insert on public.responsibilities
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy responsibilities_update on public.responsibilities
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy responsibilities_delete on public.responsibilities
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists responsibilities_select on public.responsibilities;
--   drop policy if exists responsibilities_insert on public.responsibilities;
--   drop policy if exists responsibilities_update on public.responsibilities;
--   drop policy if exists responsibilities_delete on public.responsibilities;
--   create policy responsibilities_write_admin on public.responsibilities for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy responsibilities_select_member on public.responsibilities for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- routines: 2 permissive policy(ies) -> one per command.
drop policy if exists routines_write_admin on public.routines;
drop policy if exists routines_select_member on public.routines;
create policy routines_select on public.routines
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy routines_insert on public.routines
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy routines_update on public.routines
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy routines_delete on public.routines
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists routines_select on public.routines;
--   drop policy if exists routines_insert on public.routines;
--   drop policy if exists routines_update on public.routines;
--   drop policy if exists routines_delete on public.routines;
--   create policy routines_write_admin on public.routines for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy routines_select_member on public.routines for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- playbook_items: 2 permissive policy(ies) -> one per command.
drop policy if exists playbook_items_write_admin on public.playbook_items;
drop policy if exists playbook_items_select_member on public.playbook_items;
create policy playbook_items_select on public.playbook_items
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy playbook_items_insert on public.playbook_items
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy playbook_items_update on public.playbook_items
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy playbook_items_delete on public.playbook_items
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists playbook_items_select on public.playbook_items;
--   drop policy if exists playbook_items_insert on public.playbook_items;
--   drop policy if exists playbook_items_update on public.playbook_items;
--   drop policy if exists playbook_items_delete on public.playbook_items;
--   create policy playbook_items_write_admin on public.playbook_items for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy playbook_items_select_member on public.playbook_items for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- playbook_dependencies: 2 permissive policy(ies) -> one per command.
drop policy if exists playbook_dependencies_write_admin on public.playbook_dependencies;
drop policy if exists playbook_dependencies_select_member on public.playbook_dependencies;
create policy playbook_dependencies_select on public.playbook_dependencies
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy playbook_dependencies_insert on public.playbook_dependencies
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy playbook_dependencies_update on public.playbook_dependencies
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy playbook_dependencies_delete on public.playbook_dependencies
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists playbook_dependencies_select on public.playbook_dependencies;
--   drop policy if exists playbook_dependencies_insert on public.playbook_dependencies;
--   drop policy if exists playbook_dependencies_update on public.playbook_dependencies;
--   drop policy if exists playbook_dependencies_delete on public.playbook_dependencies;
--   create policy playbook_dependencies_write_admin on public.playbook_dependencies for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy playbook_dependencies_select_member on public.playbook_dependencies for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- connections: 2 permissive policy(ies) -> one per command.
drop policy if exists connections_write_adult on public.connections;
drop policy if exists connections_select_member on public.connections;
create policy connections_select on public.connections
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.adult_households() AS adult_households)))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy connections_insert on public.connections
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.adult_households() AS adult_households)))
  );
create policy connections_update on public.connections
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.adult_households() AS adult_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.adult_households() AS adult_households)))
  );
create policy connections_delete on public.connections
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.adult_households() AS adult_households)))
  );
-- ROLLBACK:
--   drop policy if exists connections_select on public.connections;
--   drop policy if exists connections_insert on public.connections;
--   drop policy if exists connections_update on public.connections;
--   drop policy if exists connections_delete on public.connections;
--   create policy connections_write_adult on public.connections for all to authenticated using ((household_id IN ( SELECT wh.adult_households() AS adult_households))) with check ((household_id IN ( SELECT wh.adult_households() AS adult_households)));
--   create policy connections_select_member on public.connections for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- integrations: 2 permissive policy(ies) -> one per command.
drop policy if exists integrations_write_admin on public.integrations;
drop policy if exists integrations_select_member on public.integrations;
create policy integrations_select on public.integrations
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy integrations_insert on public.integrations
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy integrations_update on public.integrations
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy integrations_delete on public.integrations
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists integrations_select on public.integrations;
--   drop policy if exists integrations_insert on public.integrations;
--   drop policy if exists integrations_update on public.integrations;
--   drop policy if exists integrations_delete on public.integrations;
--   create policy integrations_write_admin on public.integrations for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy integrations_select_member on public.integrations for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- integration_identities: 2 permissive policy(ies) -> one per command.
drop policy if exists integration_identities_write_admin on public.integration_identities;
drop policy if exists integration_identities_select_member on public.integration_identities;
create policy integration_identities_select on public.integration_identities
  for select to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
    OR ((household_id IN ( SELECT wh.member_households() AS member_households)))
  );
create policy integration_identities_insert on public.integration_identities
  for insert to authenticated
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy integration_identities_update on public.integration_identities
  for update to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy integration_identities_delete on public.integration_identities
  for delete to authenticated
  using (
    ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists integration_identities_select on public.integration_identities;
--   drop policy if exists integration_identities_insert on public.integration_identities;
--   drop policy if exists integration_identities_update on public.integration_identities;
--   drop policy if exists integration_identities_delete on public.integration_identities;
--   create policy integration_identities_write_admin on public.integration_identities for all to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy integration_identities_select_member on public.integration_identities for select to authenticated using ((household_id IN ( SELECT wh.member_households() AS member_households)));

-- portal_scrape_urls: 7 permissive policy(ies) -> one per command.
drop policy if exists portal_scrape_urls_delete on public.portal_scrape_urls;
drop policy if exists portal_scrape_urls_delete_connection on public.portal_scrape_urls;
drop policy if exists portal_scrape_urls_insert on public.portal_scrape_urls;
drop policy if exists portal_scrape_urls_insert_connection on public.portal_scrape_urls;
drop policy if exists portal_scrape_urls_select on public.portal_scrape_urls;
drop policy if exists portal_scrape_urls_update on public.portal_scrape_urls;
drop policy if exists portal_scrape_urls_update_connection on public.portal_scrape_urls;
create policy portal_scrape_urls_select on public.portal_scrape_urls
  for select to authenticated
  using (
    (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((child_member_id IS NULL) OR ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,
    wh_m.member_id
   FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,
    wh_g.child_member_id
   FROM wh.my_guarded_children() wh_g(household_id, child_member_id)))))))
  );
create policy portal_scrape_urls_insert on public.portal_scrape_urls
  for insert to authenticated
  with check (
    (((connection_id IS NOT NULL) AND (household_id IN ( SELECT wh.adult_households() AS adult_households))))
    OR ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy portal_scrape_urls_update on public.portal_scrape_urls
  for update to authenticated
  using (
    (((connection_id IS NOT NULL) AND (household_id IN ( SELECT wh.adult_households() AS adult_households))))
    OR ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  )
  with check (
    (((connection_id IS NOT NULL) AND (household_id IN ( SELECT wh.adult_households() AS adult_households))))
    OR ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
create policy portal_scrape_urls_delete on public.portal_scrape_urls
  for delete to authenticated
  using (
    (((connection_id IS NOT NULL) AND (household_id IN ( SELECT wh.adult_households() AS adult_households))))
    OR ((household_id IN ( SELECT wh.admin_households() AS admin_households)))
  );
-- ROLLBACK:
--   drop policy if exists portal_scrape_urls_select on public.portal_scrape_urls;
--   drop policy if exists portal_scrape_urls_insert on public.portal_scrape_urls;
--   drop policy if exists portal_scrape_urls_update on public.portal_scrape_urls;
--   drop policy if exists portal_scrape_urls_delete on public.portal_scrape_urls;
--   create policy portal_scrape_urls_delete on public.portal_scrape_urls for delete to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy portal_scrape_urls_delete_connection on public.portal_scrape_urls for delete to authenticated using (((connection_id IS NOT NULL) AND (household_id IN ( SELECT wh.adult_households() AS adult_households))));
--   create policy portal_scrape_urls_insert on public.portal_scrape_urls for insert to authenticated with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy portal_scrape_urls_insert_connection on public.portal_scrape_urls for insert to authenticated with check (((connection_id IS NOT NULL) AND (household_id IN ( SELECT wh.adult_households() AS adult_households))));
--   create policy portal_scrape_urls_select on public.portal_scrape_urls for select to authenticated using (((household_id IN ( SELECT wh.member_households() AS member_households)) AND ((child_member_id IS NULL) OR ((household_id IN ( SELECT wh.admin_households() AS admin_households)) OR ((household_id, child_member_id) IN ( SELECT wh_m.household_id,     wh_m.member_id    FROM wh.my_memberships() wh_m(household_id, member_id))) OR ((household_id, child_member_id) IN ( SELECT wh_g.household_id,     wh_g.child_member_id    FROM wh.my_guarded_children() wh_g(household_id, child_member_id)))))));
--   create policy portal_scrape_urls_update on public.portal_scrape_urls for update to authenticated using ((household_id IN ( SELECT wh.admin_households() AS admin_households))) with check ((household_id IN ( SELECT wh.admin_households() AS admin_households)));
--   create policy portal_scrape_urls_update_connection on public.portal_scrape_urls for update to authenticated using (((connection_id IS NOT NULL) AND (household_id IN ( SELECT wh.adult_households() AS adult_households)))) with check (((connection_id IS NOT NULL) AND (household_id IN ( SELECT wh.adult_households() AS adult_households))));

