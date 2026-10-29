# PERF-15, PERF-16, PERF-17: standing performance gates

Plan: `docs/plans/2026-10-29-fast-and-secure-at-scale.md`. Doc: `docs/performance-budgets.md`; CI: `docs/CI.md`.

## What was done
- **PERF-16 bundle budget** (`scripts/bundle-budget.mjs`, `perf/bundle-budget.json`). Turbopack prints no sizes, so they come from the build's manifests. 65 routes; shared chunks 128.8 KB gz (cap 138.5 KB); largest `/ai` 224.4 KB (cap 241.4 KB). Caps are measured + 5%, minimum +2 KB. Proved to fail by lowering `/ai` to 200 KB. Runs as a step in the existing build job: no second build.
- **PERF-15 query budget** (`scripts/perf-query-budget.mjs`, `perf/queries.mjs`, `perf/query-budget.json`). 5 reads: upcoming events with participants, day-window events, upcoming meals with needs, gift plans, `household_setup_counts`. Gated on buffers and rows read (measured × 1.5; stable across reruns to ±2 buffers), sequential scans on relations marked `indexed`, and a 2000 ms ceiling. ~8 s after the template is built. New parallel CI job `query-budget`, in the `ci` check.
- **PERF-17 advisor gate** (`scripts/advisor-gate.mjs`, `.github/workflows/advisors.yml`, `perf/advisor-baseline.json`). Baseline from the live project today: 63 multiple-permissive-policies, 25 callable SECURITY DEFINER functions, `pg_net` in public, leaked-password protection off (all WARN); 154 unused indexes (INFO, counted only). Pinned action SHAs, `contents: read`. Unit tests in `scripts/advisor-gate.test.mjs`.

## Finding
`family_events` and `gift_plans` are read by a sequential scan: their only household indexes are partial on `status`, and the repository reads do not filter on status. Recorded as `known` in `perf/queries.mjs`. Follow-up story: a plain `(household_id, starts_at)` / `(household_id)` index, or a status filter. Not fixed here (it needs a migration).

## Open / needs a person
- **Owner: add the repository secret `SUPABASE_ACCESS_TOKEN`** (GitHub → Settings → Secrets and variables → Actions → New repository secret; value: a personal access token from supabase.com/dashboard/account/tokens, free). Until then the advisor job prints SKIPPED and passes.
- The `/advisors/performance` endpoint and the response shape were not exercised live (no token here); the script accepts `{lints}` or `{result:{lints}}`. If the first scheduled run errors on it, fix the URL.
- Not covered by the query budget yet: finance, health, school, chat reads, writes.
- `scripts/ci-and-e2e.test.mjs` "cleanup never touches production" fails in this container with or without this change (environment variables), not in CI.

## Verified
`npm run build` then `bundle-budget` (update, check, planted failure); `perf-query-budget` against local Postgres 16 (update, check, rerun); `node --test scripts/advisor-gate.test.mjs` (3 pass).
