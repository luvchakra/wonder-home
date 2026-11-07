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

## E2E nightly (dispatch on `main`, 12 failures in 5 causes)
- `help.spec` 14-062: #515 reworded the guide; the spec now looks for "1 question waiting in HomeTalk".
- `domains.spec`: five routes were undocumented in OpenAPI (`/calendar/subscriptions/sync`, school `channels/sync`,
  `voice/gemini/closed`, `voice/live-engine`, `/security/csp-report`). Documented them; `/security/csp-report` is a
  browser-posted public report endpoint (204), so it joins the spec's public list.
- `landing-new.spec`: the suite reads the live project, where the owner set "Landing page" to Classic at 17:21 UTC;
  the specs now name their page with `?landing=`. The default being "new" stays covered by the unit tests.
- `screens.spec`: `/settings/notifications` built `createAdminClient()` outside its `.catch`, so a deployment
  without the service key showed the error screen. It now builds the client inside the guarded call (page and
  delivery section).
- Also fixed on PR #524: `platform-admin/move-action.test.ts` counted the runner's own env (`LOG_LEVEL`).
- Verified: `tsc` clean; `packages/core/src/api` 43 tests; the non-browser specs above pass locally. Browser specs
  can't run in this container (Playwright browser version), so the nightly is re-dispatched after merge.
- Re-dispatch after #525: 12 failures became 2, one spec: `screens.spec` playbook cards counted the add form's own
  folded "More detail" (added by the settings search work, #467). The spec now selects only the area cards (summary
  with a count). Not run locally (no matching Playwright browser here); confirmed by the next nightly dispatch.
