-- Index unindexed foreign keys, and drop one duplicate index (performance pass,
-- 2026-10-28). From Supabase's performance advisor on the live project: 92 FK
-- columns had no covering index and one index was duplicated.
--
-- Why index FKs (this repo's standing rule, CLAUDE.md "Performance"): an
-- unindexed FK forces a sequential scan of the child table whenever its parent
-- row is deleted (member/household removal, privacy-request erasure) and on any
-- join/filter by that column. These are member/profile/plan/parent-row
-- references, so the cost is a seq scan per child table on every such delete.
-- All `if not exists` / `if exists`, so safe to re-run.

-- 1. Unindexed foreign keys -------------------------------------------------
create index if not exists agent_runs_initiating_member_id_idx on public.agent_runs (initiating_member_id);
create index if not exists ai_corrections_corrected_by_member_id_idx on public.ai_corrections (corrected_by_member_id);
create index if not exists approvals_approver_member_id_idx on public.approvals (approver_member_id);
create index if not exists audit_events_actor_member_id_idx on public.audit_events (actor_member_id);
create index if not exists audit_events_actor_profile_id_idx on public.audit_events (actor_profile_id);
create index if not exists backup_services_created_by_member_id_idx on public.backup_services (created_by_member_id);
create index if not exists billing_intents_created_by_member_id_idx on public.billing_intents (created_by_member_id);
create index if not exists billing_intents_plan_key_idx on public.billing_intents (plan_key);
create index if not exists billing_intents_plan_price_id_idx on public.billing_intents (plan_price_id);
create index if not exists billing_invoices_payment_id_idx on public.billing_invoices (payment_id);
create index if not exists billing_invoices_plan_key_idx on public.billing_invoices (plan_key);
create index if not exists billing_reconciliation_findings_run_id_idx on public.billing_reconciliation_findings (run_id);
create index if not exists certification_items_last_reviewed_by_idx on public.certification_items (last_reviewed_by);
create index if not exists certification_reviews_reviewer_member_id_idx on public.certification_reviews (reviewer_member_id);
create index if not exists child_goal_checkins_child_member_id_idx on public.child_goal_checkins (child_member_id);
create index if not exists child_goals_child_member_id_idx on public.child_goals (child_member_id);
create index if not exists connections_created_by_member_id_idx on public.connections (created_by_member_id);
create index if not exists consumable_purchases_shopping_entry_id_idx on public.consumable_purchases (shopping_entry_id);
create index if not exists consumable_unit_changes_actor_member_id_idx on public.consumable_unit_changes (actor_member_id);
create index if not exists conversation_actions_decided_by_member_id_idx on public.conversation_actions (decided_by_member_id);
create index if not exists conversation_actions_message_id_idx on public.conversation_actions (message_id);
create index if not exists developer_api_keys_created_by_member_id_idx on public.developer_api_keys (created_by_member_id);
create index if not exists entitlement_experiment_events_actor_profile_id_idx on public.entitlement_experiment_events (actor_profile_id);
create index if not exists entitlement_experiments_created_by_profile_id_idx on public.entitlement_experiments (created_by_profile_id);
create index if not exists event_guests_link_id_idx on public.event_guests (link_id);
create index if not exists event_invite_links_created_by_member_id_idx on public.event_invite_links (created_by_member_id);
create index if not exists family_event_changes_changed_by_member_id_idx on public.family_event_changes (changed_by_member_id);
create index if not exists family_events_owner_member_id_idx on public.family_events (owner_member_id);
create index if not exists health_appointments_created_by_member_id_idx on public.health_appointments (created_by_member_id);
create index if not exists health_appointments_family_event_id_idx on public.health_appointments (family_event_id);
create index if not exists health_appointments_rescheduled_from_id_idx on public.health_appointments (rescheduled_from_id);
create index if not exists health_checkups_created_by_member_id_idx on public.health_checkups (created_by_member_id);
create index if not exists health_checkups_linked_appointment_id_idx on public.health_checkups (linked_appointment_id);
create index if not exists health_consents_granted_by_member_id_idx on public.health_consents (granted_by_member_id);
create index if not exists health_consents_viewer_member_id_idx on public.health_consents (viewer_member_id);
create index if not exists health_fitness_goals_created_by_member_id_idx on public.health_fitness_goals (created_by_member_id);
create index if not exists health_fitness_goals_provenance_id_idx on public.health_fitness_goals (provenance_id);
create index if not exists health_fitness_sessions_created_by_member_id_idx on public.health_fitness_sessions (created_by_member_id);
create index if not exists health_fitness_sessions_provenance_id_idx on public.health_fitness_sessions (provenance_id);
create index if not exists health_issues_created_by_member_id_idx on public.health_issues (created_by_member_id);
create index if not exists health_issues_provenance_id_idx on public.health_issues (provenance_id);
create index if not exists health_measurement_routines_created_by_member_id_idx on public.health_measurement_routines (created_by_member_id);
create index if not exists health_profiles_created_by_member_id_idx on public.health_profiles (created_by_member_id);
create index if not exists health_provenance_confirmed_by_idx on public.health_provenance (confirmed_by);
create index if not exists health_records_created_by_member_id_idx on public.health_records (created_by_member_id);
create index if not exists health_records_provenance_id_idx on public.health_records (provenance_id);
create index if not exists health_vitals_created_by_member_id_idx on public.health_vitals (created_by_member_id);
create index if not exists health_vitals_provenance_id_idx on public.health_vitals (provenance_id);
create index if not exists home_send_items_created_by_member_id_idx on public.home_send_items (created_by_member_id);
create index if not exists homesend_changes_created_by_member_id_idx on public.homesend_changes (created_by_member_id);
create index if not exists homesend_changes_undone_by_member_id_idx on public.homesend_changes (undone_by_member_id);
create index if not exists household_addresses_set_by_member_id_idx on public.household_addresses (set_by_member_id);
create index if not exists household_ai_credentials_set_by_member_id_idx on public.household_ai_credentials (set_by_member_id);
create index if not exists household_feature_flags_set_by_profile_id_idx on public.household_feature_flags (set_by_profile_id);
create index if not exists household_gemini_voice_credentials_set_by_member_id_idx on public.household_gemini_voice_credentials (set_by_member_id);
create index if not exists household_invitations_accepted_member_id_idx on public.household_invitations (accepted_member_id);
create index if not exists household_invitations_invited_by_member_id_idx on public.household_invitations (invited_by_member_id);
create index if not exists household_member_emails_set_by_member_id_idx on public.household_member_emails (set_by_member_id);
create index if not exists household_member_phones_set_by_member_id_idx on public.household_member_phones (set_by_member_id);
create index if not exists household_onboarding_updated_by_member_id_idx on public.household_onboarding (updated_by_member_id);
create index if not exists household_places_set_by_member_id_idx on public.household_places (set_by_member_id);
create index if not exists household_subscriptions_plan_key_idx on public.household_subscriptions (plan_key);
create index if not exists household_subscriptions_scheduled_plan_key_idx on public.household_subscriptions (scheduled_plan_key);
create index if not exists household_voice_credentials_set_by_member_id_idx on public.household_voice_credentials (set_by_member_id);
create index if not exists household_voice_settings_updated_by_member_id_idx on public.household_voice_settings (updated_by_member_id);
create index if not exists household_webhooks_created_by_member_id_idx on public.household_webhooks (created_by_member_id);
create index if not exists households_key_member_id_idx on public.households (key_member_id);
create index if not exists households_owner_member_id_idx on public.households (owner_member_id);
create index if not exists inventory_balances_confirmed_by_member_id_idx on public.inventory_balances (confirmed_by_member_id);
create index if not exists inventory_events_actor_member_id_idx on public.inventory_events (actor_member_id);
create index if not exists inventory_events_undone_by_idx on public.inventory_events (undone_by);
create index if not exists laundry_needs_for_member_id_idx on public.laundry_needs (for_member_id);
create index if not exists meal_ingredient_needs_cart_suggestion_id_idx on public.meal_ingredient_needs (cart_suggestion_id);
create index if not exists meals_cook_member_id_idx on public.meals (cook_member_id);
create index if not exists member_work_places_set_by_member_id_idx on public.member_work_places (set_by_member_id);
create index if not exists orders_approved_by_member_id_idx on public.orders (approved_by_member_id);
create index if not exists payment_intents_approved_by_member_id_idx on public.payment_intents (approved_by_member_id);
create index if not exists payment_refunds_requested_by_idx on public.payment_refunds (requested_by);
create index if not exists payments_plan_key_idx on public.payments (plan_key);
create index if not exists plan_policy_events_actor_profile_id_idx on public.plan_policy_events (actor_profile_id);
create index if not exists playbook_dependencies_depends_on_item_id_idx on public.playbook_dependencies (depends_on_item_id);
create index if not exists privacy_requests_requested_by_member_id_idx on public.privacy_requests (requested_by_member_id);
create index if not exists schedule_conflicts_resolved_by_member_id_idx on public.schedule_conflicts (resolved_by_member_id);
create index if not exists school_enrolments_integration_id_idx on public.school_enrolments (integration_id);
create index if not exists school_items_enrolment_id_idx on public.school_items (enrolment_id);
create index if not exists school_portal_credentials_set_by_member_id_idx on public.school_portal_credentials (set_by_member_id);
create index if not exists service_requests_backup_service_id_idx on public.service_requests (backup_service_id);
create index if not exists shopping_list_entries_bought_purchase_id_idx on public.shopping_list_entries (bought_purchase_id);
create index if not exists shopping_list_entries_created_by_member_id_idx on public.shopping_list_entries (created_by_member_id);
create index if not exists shopping_list_events_actor_member_id_idx on public.shopping_list_events (actor_member_id);
create index if not exists spend_anomalies_reviewed_by_member_id_idx on public.spend_anomalies (reviewed_by_member_id);
create index if not exists weather_locations_set_by_member_id_idx on public.weather_locations (set_by_member_id);

-- 2. Duplicate index --------------------------------------------------------
-- order_items has two identical indexes on consumable_id; keep the one that
-- names the column in full and follows the _fk_idx convention.
drop index if exists public.order_items_consumable_idx;

notify pgrst, 'reload schema';
