/**
 * Reviewed exceptions and known gaps for the RLS-coverage gate
 * (scripts/test-coverage-rls.mjs). See docs/security/rls-coverage-baseline.md.
 *
 * ALLOW: permanent, each with the reason it is right. Review it in the same PR
 * that adds a platform table.
 * BASELINE: a known gap with the plan story that burns it down
 * (docs/plans/2026-10-29-fast-and-secure-at-scale.md). Delete the entry when
 * fixed; a baseline entry that no longer violates fails the gate.
 * Never add an entry to make a failing run pass: fix the table or policy.
 */
export const ALLOW = {
  "open-policy:public.grocery_catalog.grocery_catalog_select_signed_in": "Platform catalogue, read-only for any signed-in user; holds no household data and no client write policy.",
  "open-policy:public.ifct_foods.ifct_foods_select_signed_in": "Platform catalogue, read-only for any signed-in user; holds no household data and no client write policy.",
  "open-policy:public.plan_features.plan_features_select_authenticated": "Platform catalogue, read-only for any signed-in user; holds no household data and no client write policy.",
  "open-policy:public.public_holidays.public_holidays_select_all": "Platform catalogue, read-only for any signed-in user; holds no household data and no client write policy.",
  "open-policy:public.recipe_catalog.recipe_catalog_select_signed_in": "Platform catalogue, read-only for any signed-in user; holds no household data and no client write policy.",
  "open-policy:public.recipe_catalog_ingredients.recipe_catalog_ingredients_select_signed_in": "Platform catalogue, read-only for any signed-in user; holds no household data and no client write policy.",
};

export const BASELINE = {
  "anon-table-grant:public.billing_reconciliation_findings": "anon holds table privileges that the deny-all *_no_client_access policy blocks. Defence in depth: revoke from anon (SEC-08, SEC-13).",
  "anon-table-grant:public.billing_reconciliation_runs": "anon holds table privileges that the deny-all *_no_client_access policy blocks. Defence in depth: revoke from anon (SEC-08, SEC-13).",
  "anon-table-grant:public.homebrain_misses": "anon holds table privileges that the deny-all *_no_client_access policy blocks. Defence in depth: revoke from anon (SEC-08, SEC-13).",
  "anon-table-grant:public.homebrain_recall": "anon holds table privileges that the deny-all *_no_client_access policy blocks. Defence in depth: revoke from anon (SEC-08, SEC-13).",
  "anon-table-grant:public.household_context": "anon holds table privileges that the deny-all *_no_client_access policy blocks. Defence in depth: revoke from anon (SEC-08, SEC-13).",
  "anon-table-grant:public.household_facts": "anon holds table privileges that the deny-all *_no_client_access policy blocks. Defence in depth: revoke from anon (SEC-08, SEC-13).",
  "anon-table-grant:public.knowledge_outbox": "anon holds table privileges that the deny-all *_no_client_access policy blocks. Defence in depth: revoke from anon (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.accept_invitation": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.admin_households": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.adult_households": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_availability_member_in_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_certification_member_scope": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_child_in_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_commerce_row_in_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_dependency_same_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_grocery_row_in_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_guardian_pair_same_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_home_asset_in_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_home_member_in_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_key_member_in_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_meal_member_in_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_notification_recipient_in_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_outcome_owner_in_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_owner_is_head": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_pet_in_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_relationship_family": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_responsibility_members_in_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_role_member_matches_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_session_member_in_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_transaction_owner_in_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_voice_identity_member_in_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_whatsapp_member_is_adult": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.assert_whatsapp_message_matches_identity": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.autonomy_for": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.busy_windows": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.chat_message_guard": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.chat_reaction_guard": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.claim_jobs": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.complete_job": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.create_child_member": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.create_household": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.current_profile_id": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.forget_location_when_sharing_stops": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.guard_member_self_update": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.has_role": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.has_support_access": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.is_child_of": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.is_household_admin": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.is_member": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.is_platform_admin": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.log_notification_transition": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.may_change_child": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.may_see_child": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.may_see_finance": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.may_see_health": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.member_households": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.member_id": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.my_memberships": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.purge_expired_idempotency_keys": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.record_usage": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
  "anon-execute-secdef:wh.sync_member_occasion_events": "PUBLIC default EXECUTE reaches anon, but wh is not usable by anon, so unreachable today. Revoke from anon/PUBLIC (SEC-08, SEC-13).",
};
