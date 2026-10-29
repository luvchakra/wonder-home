# SEC-13 pg_net out of `public`, and a migration-drift guard

## Done
- **SEC-13:** `supabase/migrations/20261029200000_sec13_pg_net_out_of_public.sql` drops and recreates `pg_net` in `extensions` (it is not relocatable). Guarded, so it is safe in either order and a no-op where pg_net is absent or already moved. The cron jobs call `net.http_post`, and the `net` schema is the same wherever the extension lives, so the notification-dispatch and calendar-sync clocks are unchanged. Applied live with the Supabase MCP.
- The six functions with `search_path = public, pg_temp` are explicit and the advisor does not flag them (no `function_search_path_mutable` finding); converting them to `""` would mean re-qualifying their bodies for no advisor gain, so they were left alone.
- **Migration-drift guard:** `scripts/check-migrations-applied.mjs` (`npm run check:migrations`), daily workflow `.github/workflows/migration-drift.yml`, and `docs/migration-history.md` with the reconcile SQL for the 31 unrecorded migrations (not run).

## Verified
- Live: pg_net is in `extensions`, `net.http_post` exists and `postgres` can execute it. Security advisor: `extension_in_public` gone; the remaining WARNs (25 authenticated SECURITY DEFINER, leaked-password protection) are unchanged. `perf/advisor-baseline.json` updated to match.
- Unit tests for the guard and the advisor gate pass. The guard's 31 matches the live count.

## Open
- Owner runs the history insert in `docs/migration-history.md`; until then the daily drift workflow fails (or set `MIGRATION_DRIFT_REPORT_ONLY=1`).
- The next scheduled dispatch run should show a successful `net.http_post` in `cron.job_run_details`.

## Correction
The reconcile SQL had two rows on version `20261028190000` (primary key clash; `on conflict do nothing` would have skipped one). `policy_helpers_set_form` is now `20261028190001`, all 31 versions were checked absent from the live history, and a test asserts the versions are unique and the names are real repo migrations.
