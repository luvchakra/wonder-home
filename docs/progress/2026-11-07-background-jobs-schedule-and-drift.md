# Background jobs schedule, migration drift, nightly E2E (2026-11-07)

## Done
- **Background jobs never fired on schedule** (0 `event=schedule` runs in ~3 h after #517, although the hourly cron
  `47 * * * *` was also due, so it was not only the step form). Other workflows' daily schedules fire. Not provable
  from here which part GitHub rejected; the step-range cron `3-59/10` was the only unusual expression, so it is now an
  explicit list `3,13,23,33,43,53 * * * *`. Pushing the file to `main` makes GitHub re-register all three schedules.
- **Migration drift**: the only repo migration without a live history row was `homesend_daily_tidy` (applied, checked by
  effect: `archive_reason` column, `archive_stale_home_send_items`, its trigger all exist). Row inserted into
  `supabase_migrations.schema_migrations` (version `20261103210000`). `platform_settings` and `platform_config` already
  had rows. `20261103230000_homesend_remove_items` is not on `main` (branch `claude/homesend-remove-items`, no PR),
  so the check does not see it; it is still unapplied live and needs the owner.
- Migration drift dispatched on `main` after the insert: green.

## Open
- Confirm a `schedule` run of Background jobs succeeds after merge and `platform_job_heartbeats` update.
- E2E nightly: see the PR thread for the dispatch result.
