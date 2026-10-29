# RLS-coverage baseline (SEC-10)

The gate is `scripts/test-coverage-rls.mjs` (`npm run test:rls-coverage`, also part of `npm run test:db` and the db-tests CI job). It checks the database built from `supabase/migrations`. Entries live in `scripts/lib/rls-coverage-config.mjs`; a new violation fails, and so does a baseline entry that has been fixed and left behind.

## Checks
1. Every table in an app schema (all but Supabase's own: `auth`, `storage`, …) has RLS enabled.
2. Every RLS table has a policy. Service-role-only tables carry a deny-all `*_no_client_access` policy.
3. No policy uses `wh.is_member(`, `wh.is_household_admin(`, `wh.member_id(` or the other per-row helpers, or a bare `auth.uid()` (only `(select auth.uid())`).
4. No policy is `using (true)` or applies to `anon`/`public` unless it is a deny-all.
5. Every SECURITY DEFINER function pins `search_path`.
6. anon cannot call a SECURITY DEFINER function (reachable = EXECUTE plus schema USAGE), and holds no table privilege.

## Current state (197 migrations)
| Check | Count | Disposition |
|---|---|---|
| Tables without RLS | 0 | — |
| RLS tables without a policy | 0 | — |
| Per-row helper or bare `auth.uid()` in a policy | 0 | — |
| SECURITY DEFINER without `search_path` | 0 (of 121) | — |
| anon-reachable SECURITY DEFINER | 0 | — |
| Open `using (true)` policies | 6 | **Allowed**: platform catalogues, signed-in read only (below) |
| anon holds EXECUTE on a `wh` SECURITY DEFINER function (schema `wh` is not usable by anon) | 54 | **Baseline**: SEC-08 / SEC-13 |
| anon holds table privileges on a deny-all table | 7 | **Baseline**: SEC-08 / SEC-13 |

## Allowed (permanent, reviewed)
- `public.grocery_catalog.grocery_catalog_select_signed_in`
- `public.ifct_foods.ifct_foods_select_signed_in`
- `public.plan_features.plan_features_select_authenticated`
- `public.public_holidays.public_holidays_select_all`
- `public.recipe_catalog.recipe_catalog_select_signed_in`
- `public.recipe_catalog_ingredients.recipe_catalog_ingredients_select_signed_in`

## Baseline: anon table privileges (SEC-08, SEC-13)
- `public.billing_reconciliation_findings`
- `public.billing_reconciliation_runs`
- `public.homebrain_misses`
- `public.homebrain_recall`
- `public.household_context`
- `public.household_facts`
- `public.knowledge_outbox`

## Baseline: anon EXECUTE on SECURITY DEFINER functions (SEC-08, SEC-13)
Unreachable today because anon has no USAGE on schema `wh`; revoke the default PUBLIC EXECUTE so this does not depend on that.
- `wh.accept_invitation`
- `wh.admin_households`
- `wh.adult_households`
- `wh.assert_availability_member_in_household`
- `wh.assert_certification_member_scope`
- `wh.assert_child_in_household`
- `wh.assert_commerce_row_in_household`
- `wh.assert_dependency_same_household`
- `wh.assert_grocery_row_in_household`
- `wh.assert_guardian_pair_same_household`
- `wh.assert_home_asset_in_household`
- `wh.assert_home_member_in_household`
- `wh.assert_key_member_in_household`
- `wh.assert_meal_member_in_household`
- `wh.assert_notification_recipient_in_household`
- `wh.assert_outcome_owner_in_household`
- `wh.assert_owner_is_head`
- `wh.assert_pet_in_household`
- `wh.assert_relationship_family`
- `wh.assert_responsibility_members_in_household`
- `wh.assert_role_member_matches_household`
- `wh.assert_session_member_in_household`
- `wh.assert_transaction_owner_in_household`
- `wh.assert_voice_identity_member_in_household`
- `wh.assert_whatsapp_member_is_adult`
- `wh.assert_whatsapp_message_matches_identity`
- `wh.autonomy_for`
- `wh.busy_windows`
- `wh.chat_message_guard`
- `wh.chat_reaction_guard`
- `wh.claim_jobs`
- `wh.complete_job`
- `wh.create_child_member`
- `wh.create_household`
- `wh.current_profile_id`
- `wh.forget_location_when_sharing_stops`
- `wh.guard_member_self_update`
- `wh.has_role`
- `wh.has_support_access`
- `wh.is_child_of`
- `wh.is_household_admin`
- `wh.is_member`
- `wh.is_platform_admin`
- `wh.log_notification_transition`
- `wh.may_change_child`
- `wh.may_see_child`
- `wh.may_see_finance`
- `wh.may_see_health`
- `wh.member_households`
- `wh.member_id`
- `wh.my_memberships`
- `wh.purge_expired_idempotency_keys`
- `wh.record_usage`
- `wh.sync_member_occasion_events`
