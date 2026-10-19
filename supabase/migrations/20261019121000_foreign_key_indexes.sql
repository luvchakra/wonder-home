-- Indexes for the foreign keys the app reads by, or deletes through
-- (performance pass, 2026-10-19).
--
-- Supabase's advisor listed 176 foreign keys with no index whose first
-- column is the key. These are the ones on a household, a member, or a
-- parent row: every household-scoped list filters on household_id, and
-- removing a household, member or item cascades through these columns
-- (deleting a household took up to 1.1 s). The rest are audit columns
-- (created_by_member_id, set_by_member_id, actor_*) that nothing reads by.
-- At today's sizes each index is a few pages.

create index if not exists agent_runs_conversation_action_id_fk_idx on public.agent_runs (conversation_action_id);
create index if not exists agent_tool_calls_household_id_fk_idx on public.agent_tool_calls (household_id);
create index if not exists approvals_agent_run_id_fk_idx on public.approvals (agent_run_id);
create index if not exists approvals_conversation_action_id_fk_idx on public.approvals (conversation_action_id);
create index if not exists asset_service_events_household_id_fk_idx on public.asset_service_events (household_id);
create index if not exists billing_events_intent_id_fk_idx on public.billing_events (intent_id);
create index if not exists billing_reconciliation_findings_household_id_fk_idx on public.billing_reconciliation_findings (household_id);
create index if not exists calendar_preferences_household_id_fk_idx on public.calendar_preferences (household_id);
create index if not exists cart_suggestions_consumable_id_fk_idx on public.cart_suggestions (consumable_id);
create index if not exists certification_items_member_id_fk_idx on public.certification_items (member_id);
create index if not exists certification_reviews_household_id_fk_idx on public.certification_reviews (household_id);
create index if not exists child_activities_child_member_id_fk_idx on public.child_activities (child_member_id);
create index if not exists child_activity_notes_household_id_fk_idx on public.child_activity_notes (household_id);
create index if not exists consumable_purchases_household_id_fk_idx on public.consumable_purchases (household_id);
create index if not exists consumables_pet_id_fk_idx on public.consumables (pet_id);
create index if not exists conversation_messages_household_id_fk_idx on public.conversation_messages (household_id);
create index if not exists conversation_sessions_household_id_fk_idx on public.conversation_sessions (household_id);
create index if not exists event_exceptions_household_id_fk_idx on public.event_exceptions (household_id);
create index if not exists event_guests_household_id_fk_idx on public.event_guests (household_id);
create index if not exists event_invite_links_household_id_fk_idx on public.event_invite_links (household_id);
create index if not exists event_participants_household_id_fk_idx on public.event_participants (household_id);
create index if not exists external_voice_identities_member_id_fk_idx on public.external_voice_identities (member_id);
create index if not exists food_preferences_member_id_fk_idx on public.food_preferences (member_id);
create index if not exists gift_plans_event_id_fk_idx on public.gift_plans (event_id);
create index if not exists gift_plans_responsible_member_id_fk_idx on public.gift_plans (responsible_member_id);
create index if not exists health_consents_subject_member_id_fk_idx on public.health_consents (subject_member_id);
create index if not exists health_profiles_member_id_fk_idx on public.health_profiles (member_id);
create index if not exists health_records_member_id_fk_idx on public.health_records (member_id);
create index if not exists helper_profiles_household_id_fk_idx on public.helper_profiles (household_id);
create index if not exists helper_profiles_member_id_fk_idx on public.helper_profiles (member_id);
create index if not exists home_assets_responsible_member_id_fk_idx on public.home_assets (responsible_member_id);
create index if not exists home_device_links_asset_id_fk_idx on public.home_device_links (asset_id);
create index if not exists home_device_signals_asset_id_fk_idx on public.home_device_signals (asset_id);
create index if not exists homesend_email_events_household_id_fk_idx on public.homesend_email_events (household_id);
create index if not exists hometalk_channel_events_household_id_fk_idx on public.hometalk_channel_events (household_id);
create index if not exists household_invitations_member_id_fk_idx on public.household_invitations (member_id);
create index if not exists integration_identities_household_id_fk_idx on public.integration_identities (household_id);
create index if not exists integration_identities_member_id_fk_idx on public.integration_identities (member_id);
create index if not exists meal_ingredient_needs_consumable_id_fk_idx on public.meal_ingredient_needs (consumable_id);
create index if not exists meals_recipe_id_fk_idx on public.meals (recipe_id);
create index if not exists member_availability_household_id_fk_idx on public.member_availability (household_id);
create index if not exists member_guardians_household_id_fk_idx on public.member_guardians (household_id);
create index if not exists member_work_places_household_id_fk_idx on public.member_work_places (household_id);
create index if not exists memories_member_id_fk_idx on public.memories (member_id);
create index if not exists merchant_offers_household_id_fk_idx on public.merchant_offers (household_id);
create index if not exists notification_events_household_id_fk_idx on public.notification_events (household_id);
create index if not exists notification_preferences_household_id_fk_idx on public.notification_preferences (household_id);
create index if not exists notifications_outcome_id_fk_idx on public.notifications (outcome_id);
create index if not exists obligation_history_household_id_fk_idx on public.obligation_history (household_id);
create index if not exists obligations_responsible_member_id_fk_idx on public.obligations (responsible_member_id);
create index if not exists order_items_consumable_id_fk_idx on public.order_items (consumable_id);
create index if not exists order_items_household_id_fk_idx on public.order_items (household_id);
create index if not exists outcomes_playbook_item_id_fk_idx on public.outcomes (playbook_item_id);
create index if not exists payment_attempts_household_id_fk_idx on public.payment_attempts (household_id);
create index if not exists payment_intents_obligation_id_fk_idx on public.payment_intents (obligation_id);
create index if not exists payment_refunds_household_id_fk_idx on public.payment_refunds (household_id);
create index if not exists payments_intent_id_fk_idx on public.payments (intent_id);
create index if not exists pet_care_needs_pet_id_fk_idx on public.pet_care_needs (pet_id);
create index if not exists pet_care_needs_responsible_member_id_fk_idx on public.pet_care_needs (responsible_member_id);
create index if not exists playbook_dependencies_household_id_fk_idx on public.playbook_dependencies (household_id);
create index if not exists privacy_requests_subject_member_id_fk_idx on public.privacy_requests (subject_member_id);
create index if not exists push_subscriptions_household_id_fk_idx on public.push_subscriptions (household_id);
create index if not exists recipe_ingredients_consumable_id_fk_idx on public.recipe_ingredients (consumable_id);
create index if not exists recipe_ingredients_household_id_fk_idx on public.recipe_ingredients (household_id);
create index if not exists reminder_preferences_household_id_fk_idx on public.reminder_preferences (household_id);
create index if not exists responsibilities_playbook_item_id_fk_idx on public.responsibilities (playbook_item_id);
create index if not exists routines_household_id_fk_idx on public.routines (household_id);
create index if not exists school_communications_child_member_id_fk_idx on public.school_communications (child_member_id);
create index if not exists school_documents_household_id_fk_idx on public.school_documents (household_id);
create index if not exists school_documents_school_item_id_fk_idx on public.school_documents (school_item_id);
create index if not exists school_enrolments_household_id_fk_idx on public.school_enrolments (household_id);
create index if not exists school_exams_child_member_id_fk_idx on public.school_exams (child_member_id);
create index if not exists school_teachers_child_member_id_fk_idx on public.school_teachers (child_member_id);
create index if not exists school_timetable_periods_child_member_id_fk_idx on public.school_timetable_periods (child_member_id);
create index if not exists service_requests_asset_id_fk_idx on public.service_requests (asset_id);
create index if not exists service_requests_outcome_id_fk_idx on public.service_requests (outcome_id);
create index if not exists shopping_list_entries_consumable_id_fk_idx on public.shopping_list_entries (consumable_id);
create index if not exists shopping_list_entries_meal_id_fk_idx on public.shopping_list_entries (meal_id);
create index if not exists shopping_list_events_consumable_id_fk_idx on public.shopping_list_events (consumable_id);
create index if not exists step_up_verifications_household_id_fk_idx on public.step_up_verifications (household_id);
create index if not exists study_sessions_household_id_fk_idx on public.study_sessions (household_id);
create index if not exists study_sessions_school_item_id_fk_idx on public.study_sessions (school_item_id);
create index if not exists voice_oauth_grants_household_id_fk_idx on public.voice_oauth_grants (household_id);
create index if not exists webhook_deliveries_household_id_fk_idx on public.webhook_deliveries (household_id);
create index if not exists whatsapp_events_household_id_fk_idx on public.whatsapp_events (household_id);
create index if not exists whatsapp_link_requests_household_id_fk_idx on public.whatsapp_link_requests (household_id);
create index if not exists whatsapp_link_requests_identity_id_fk_idx on public.whatsapp_link_requests (identity_id);
create index if not exists whatsapp_messages_identity_id_fk_idx on public.whatsapp_messages (identity_id);
create index if not exists whatsapp_messages_member_id_fk_idx on public.whatsapp_messages (member_id);
