# 2026-10-29 — Database quick wins: PERF-13, PERF-01, SEC-08

Plan: `docs/plans/2026-10-29-fast-and-secure-at-scale.md`. Live project `wonderhome` (`kqxndableyysxqhxiorz`).

## PERF-13 — the three "pending" migrations are already live
`list_migrations` does not show `policy_helpers_set_form`, `child_visibility_set_form` or `chat_rpcs_revoke_anon` (the live history also lacks other repo files, e.g. `index_foreign_keys`), so they were checked by effect with SQL:
- no policy still calls `wh.may_see_child` / `wh.may_change_child` (0 left) and none uses a per-row `wh.is_member`-style helper (0);
- all 7 set-form helpers exist in `wh` (`role_households`, `finance_households`, `my_household_children`, `my_health_consents`, `my_participant_events`, `my_visible_events`, `my_guarded_children`);
- `anon` cannot execute `chat_household_thread`, `chat_open_direct`, `chat_add_participants`, `chat_leave`, `chat_mark_read`, `chat_inbox`.
So nothing was applied and no timeout occurred. Not done: `npm run verify:live` (no `apps/web/.env.local` creds in this container) — verified by SQL instead. Open: live migration history and the repo disagree on names/versions; worth a reconcile pass.

## PERF-01 — calendar_subscriptions FK indexes
`20261029110000_calendar_subscriptions_fk_indexes_and_claim_revoke.sql` adds `calendar_subscriptions_owner_member_idx` and `calendar_subscriptions_created_by_idx`. Applied live. Performance advisor `unindexed_foreign_keys`: 2 → 0 (the two flagged were exactly these FKs).

## SEC-08 — security advisors
Same migration: `claim_due_calendar_subscriptions` revoked from `public`, `anon`, `authenticated`; granted to `service_role` only (the earlier migration missed the direct `anon` grant Supabase adds by default). Its only caller is the service-role sync (`calendar/subscriptions/repository.ts`).

Advisor security WARNs: before 28 (1 pg_net, 1 anon definer, 25 authenticated definer, 1 leaked passwords) → after 27 (1 pg_net, 25, 1).

**Audit of the 25 `authenticated`-executable SECURITY DEFINER RPCs — all kept.** Each has a call site in `packages/core` or `apps/web` through a signed-in (per-request) client or user-driven server action, and each checks the caller/household inside the function; I could not prove any unused by the client, so none was revoked: `adjust_shopping_entry`, `ai_credential_status`, `apply_inventory_change`, `busy_windows`, `change_consumable_unit`, `chat_add_participants`, `chat_household_thread`, `chat_leave`, `chat_mark_read`, `chat_open_direct`, `disconnect_whatsapp`, `enqueue_connection_fetch_job`, `enqueue_portal_fetch_job`, `gemini_voice_credential_status`, `household_whatsapp_members`, `list_webhook_subscriptions`, `mark_bought`, `mark_member_seen`, `my_household_ai_key_alerts`, `portal_connection_status`, `portal_session_status`, `revoke_voice_identity`, `school_portal_credential_status`, `set_inventory_use_by`, `voice_credential_status`. The advisor keeps warning on these by design; a follow-up could move them to a non-exposed schema behind wrappers, or accept the lint.

## Deferred
- **Leaked-password protection:** deferred — requires a paid Supabase plan; revisit when the project upgrades.
- pg_net in `public`: SEC-13, untouched.

## Live-vs-repo migration history mismatch (input for a reconcile story)
Compared from `20261028` onward only. Live `list_migrations` records versions at apply time, so versions differ from the repo's file timestamps: `calendar_subscriptions` live `20261029032508` vs repo `20261029090000`; `homesend_email_allowlist` live `20261029033547` vs `20261029093000`; `member_live_engine` live `20261029022357` vs `20261029100000`. Repo files with **no live entry by name** (some are live by effect, e.g. the three PERF-13 ones; the rest were not checked): `index_foreign_keys`, `chat_rpcs_revoke_anon`, `child_visibility_set_form`, `policy_helpers_set_form`, `connections_adult_write`, `portal_connection_fetch`, `portal_connection_unique_nonpartial`, `data_retention_cleanup`, `data_retention_family_events`, `member_location_visible_to_children`. Likely applied via the SQL editor or under other names.
