# PERF-17 follow-up: family_events and gift_plans indexes

**Done.** The query-budget gate recorded `family_events` and `gift_plans` as sequentially scanned: their household indexes were partial on `status` and the repository reads (`listEvents`, calendar window, `familyAgenda` gifts) do not filter on status.

Migration `20261029220000_perf_family_events_gift_plans_indexes.sql` adds plain `family_events (household_id, starts_at)` and `gift_plans (household_id, needed_by)` (`create index if not exists`, additive, safe in either order). The old partial indexes stay: other readers still use them.

**Measured** (PERF-15 fixture, local DB, buffers / rows read, before → after):
- family.upcoming-events: 5759 cap → 3850 / 48363 cap → 3736
- calendar.day-events: 1292 cap → 573 / 47250 cap → 1548
- family.gift-plans: 410 cap → 269 / 1260 cap → 80

`perf/queries.mjs`: `known` marks removed, both relations in `indexed`; `perf/query-budget.json` rewritten, so the gate now fails on a sequential scan of either table. `npm run budget:queries` passes.

**Live:** applied with Supabase `apply_migration`; see the PR for the live EXPLAIN result.
