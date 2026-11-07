# 2026-11-08 — Migration files that shared a timestamp

**What.** Five pairs or trios of files in `supabase/migrations/` carried the same 14-digit version, the last two (`20261107233000_child_trivia.sql` and `20261107233000_homesend_learned_defaults.sql`) written the same evening by two sessions. The live history table `supabase_migrations.schema_migrations` keys on the version, so only one file of a pair can ever be recorded under it, and the apply order of a fresh database stops being what the names say.

**Done.**
- Renamed the later file of each clash to the next free second, matching the version the live history already carries where that keeps the fresh-database order (`20261028190001_policy_helpers_set_form`, `20261103120001_home_send_items_mark_reminders_due`, `20261103120002_homesend_lifecycle`), otherwise the next free suffix (`20261029100001_member_location_visible_to_children`; live has it at `20261029100000` and `member_live_engine` at `20261029022357`, the MCP's own stamp). `homesend_learned_defaults` is now `20261107233500`, and its SQL for the owner records that version.
- `scripts/lint-migration-schema.mjs` (`npm run lint:migrations`, a PR gate) now refuses two files with one timestamp (`duplicateVersions`), with a test.
- Progress notes and the backlog row that named the old files now name the new ones.

**Verified.** `npm run lint:migrations` passes on the renamed tree; `node --test scripts/lint-migration-schema.test.mjs`; `npm run tracker -- --check`. Migration drift compares by name (`scripts/check-migrations-applied.mjs`), so the renames do not change it; the DB tests run in CI because migration files changed.

**Open.** The two 2026-11-07 migrations are still waiting for the owner to run their SQL on the live project (`child_trivia`, `homesend_learned_defaults`); until then Migration drift reports those two names.

**Where.** `scripts/lint-migration-schema.mjs`, `scripts/lint-migration-schema.test.mjs`, `supabase/migrations/`.
