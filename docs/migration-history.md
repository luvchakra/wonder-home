# Migration history: reconciling repo files with the live record

The live project records applied migrations in `supabase_migrations.schema_migrations`.
A migration applied by plain SQL (not `apply_migration`) leaves no row there, so
the repo and the history drift apart. `scripts/check-migrations-applied.mjs`
(`npm run check:migrations`) lists repo files with no history row, matching on
the name after the timestamp (the MCP stamps its own version, so numbers differ).
The `Migration drift` workflow (`.github/workflows/migration-drift.yml`) runs it
daily; it skips without the `SUPABASE_ACCESS_TOKEN` secret (the one the advisor
gate uses) and fails on drift. Set the repository variable
`MIGRATION_DRIFT_REPORT_ONLY=1` to make it report without failing.

## The known gap (2026-10-29)

31 older migrations were applied by SQL and never recorded. Each was verified
present by its effect. Their rows are still to be inserted by the owner; nothing
in this repo runs the insert.

```sql
-- Records migrations already applied by SQL. Run once, in the SQL Editor
-- (dashboard -> project wonderhome -> SQL Editor -> paste -> Run).
insert into supabase_migrations.schema_migrations (version, name)
values
  ('20261018120000', 'family_calendar'),
  ('20261018180000', 'dashboard_no_ai_credentials'),
  ('20261018240000', 'grocery_unit_change'),
  ('20261018250000', 'household_context_store'),
  ('20261018260000', 'child_teachers_and_activities'),
  ('20261020220000', 'amaf_answers'),
  ('20261020230000', 'goal_checkin_verification'),
  ('20261020231000', 'companion_sayings'),
  ('20261020232000', 'pet_preferences'),
  ('20261020233000', 'member_locations'),
  ('20261020234000', 'meal_week_template'),
  ('20261021001000', 'household_places_origin'),
  ('20261021030000', 'household_chat'),
  ('20261021031000', 'companion_sayings_cycle'),
  ('20261021040000', 'health_report_readings'),
  ('20261021070000', 'chat_reactions'),
  ('20261028130000', 'connections_adult_write'),
  ('20261028140000', 'portal_connection_fetch'),
  ('20261028150000', 'portal_connection_unique_nonpartial'),
  ('20261028160000', 'index_foreign_keys'),
  ('20261028170000', 'chat_rpcs_revoke_anon'),
  ('20261028171000', 'child_visibility_set_form'),
  ('20261028180000', 'data_retention_cleanup'),
  ('20261028190000', 'data_retention_family_events'),
  ('20261028190001', 'policy_helpers_set_form'),
  ('20261029100000', 'member_location_visible_to_children'),
  ('20261029150000', 'perf02_consolidate_finance_commerce'),
  ('20261029160000', 'perf02_consolidate_home_assets_work'),
  ('20261029170000', 'perf02_consolidate_food_pets'),
  ('20261029180000', 'perf02_consolidate_calendar_events'),
  ('20261029190000', 'perf02_consolidate_members_identity')
-- Versions are unique (schema_migrations.version is the primary key) and were
-- checked against the live history: none exists there yet.
on conflict (version) do nothing;
```

Afterwards `npm run check:migrations` (with the token) prints OK and the
workflow turns green.

## Going forward

Apply a migration with `apply_migration` so the row is written; if it had to be
run as plain SQL, insert its row in the same session.
