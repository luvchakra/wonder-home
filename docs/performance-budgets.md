# Performance budgets: the standing gates

Three gates keep the perf passes from eroding. All run on GitHub Actions, never as a Vercel deployment. None sends traffic to production.

## Targets and how the gates approximate them

`TECH-STACK-AND-NFR.md`: authenticated reads p95 ≤ 500 ms, ordinary writes p95 ≤ 800 ms, excluding provider latency. A real p95 needs production traffic (PERF-18's load test). Until then each gate pins a deterministic cause of slowness:

| Gate | Pins | Budget file | Runs |
|---|---|---|---|
| Query budget (PERF-15) | buffers touched, rows read and sequential scans of the hot reads, as a signed-in member | `perf/query-budget.json` | `query-budget` job in `ci.yml`, when `supabase/` or the budget files change |
| Bundle budget (PERF-16) | gzip first-load JS per route, and the chunks every route shares | `perf/bundle-budget.json` | after `npm run build` in the `build` job |
| Advisor gate (PERF-17) | new WARN/ERROR findings from the Supabase security and performance advisors | `perf/advisor-baseline.json` | `advisors.yml`: daily, and on PRs touching migrations |

## Query budget

`scripts/perf-query-budget.mjs` builds the test database, seeds 21 households (~30k events, ~6k meals), then runs each query of `perf/queries.mjs` as an authenticated member with real JWT claims under `EXPLAIN (ANALYZE, BUFFERS)`.

- **Gated:** shared buffers (hit + read) and rows read, each at measured × 1.5. These repeat for a fixed fixture; CI runner speed does not move them.
- **Gated:** a relation listed in `indexed` must not be sequentially scanned.
- **Very loose:** execution time ≤ 2000 ms, 4× the 500 ms target, because a shared runner is noisy.

Known gaps are recorded with `known` in `perf/queries.mjs`, not hidden. Today: `family_events` and `gift_plans` are sequentially scanned because their only household indexes are partial (`status in …`) and `listEvents` / the gift read do not filter on status. Fix by a plain `(household_id, starts_at)` index or a status filter, then move the relation to `indexed`.

**Add a query:** add `{ id, indexed, known?, sql }` to `perf/queries.mjs` (the SQL shape PostgREST builds for the repository read; `:household` is the measured household), run `npm run budget:queries -- --update`, and commit both files. **Raise a cap** only the same way, with the reason in the PR. Follow-ups not yet covered: finance, health, school and chat reads; member lists; writes (`mark_bought`, `adjust_shopping_entry`).

## Bundle budget

`scripts/bundle-budget.mjs` reads the finished build: each route's client chunks (`entryJSFiles` in its client-reference manifest, plus `rootMainFiles`), gzipped. Cap = measured + 5% (at least +2 KB). A route without an entry is held to the largest cap. `npm run budget:bundle -- --update` rewrites the file; the diff is the review. `check:bundle` still guards content.

## Advisor gate

`scripts/advisor-gate.mjs` calls the Management API (`GET /v1/projects/{ref}/advisors/security` and `/performance`) with the `SUPABASE_ACCESS_TOKEN` repository secret (a personal access token, free: supabase.com/dashboard/account/tokens). Without it the job skips and says so. The token is sent only as a bearer header and never printed.

- WARN/ERROR findings are keyed by lint and detail; any key not in the baseline fails. Fixed findings are listed so they can be removed.
- INFO findings (unused indexes) are counted and shown, not gated: they follow traffic.
- It reads the **live** project, so on a PR it catches drift; a migration's findings appear after it is applied. Accepting a finding means `npm run advisors -- --update` with the reason in the PR.
