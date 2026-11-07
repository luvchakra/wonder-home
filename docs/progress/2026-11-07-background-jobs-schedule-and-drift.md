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
- Third dispatch (after #529): the playbook test's real cause was that Manage Household is a folded card
  (`details#manage`, #467), so the area cards were not visible; the spec opens it first. #527 also added
  `PATCH /platform-admin/plans/{planKey}` without an OpenAPI entry; documented.
- Fourth dispatch (after #533): 2 left. (a) Responsibilities group save polled the database for only 5 s on a live
  round trip; it passed in the previous dispatch and on desktop, nothing in that screen changed, so the poll now waits
  30 s like the rest of the file. (b) HomeSend "Add all anyway" fails with "Something went wrong": the action builds an
  admin client, and `playwright.config.ts` deliberately blanks `SUPABASE_SERVICE_ROLE_KEY` on the app server under test
  (docs/CI.md). That is a harness-security decision, left for the owner (see the reply).
- Why Background jobs shows no schedule runs yet: every scheduled workflow in this repo runs about 3.5 h after its cron
  time (drift 23:13 UTC ran 02:43; advisors 22:43 ran 02:20; nightly 21:30 ran 01:03, every night). The first run is
  expected ~3.5 h after the first slot following #524 (17:53 UTC), so about 21:20-21:40 UTC.
