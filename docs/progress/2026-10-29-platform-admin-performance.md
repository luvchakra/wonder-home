# Platform admin landing and Performance section (16-009)

Date: 2026-10-29. Owner ask: an admin page for WonderHome with performance analytics and tips, in the manner of WonderJobs' platform admin.

## Done
- `/platform-admin` landing with a section nav (Overview, Performance, Careers); `layout.tsx` answers 404 to anyone who is not active platform staff, and each page still checks its own capability (`operations.read` for Overview and Performance, `careers.manage` for Careers).
- `/platform-admin/performance`: tips first (fixed rules, most useful first, each with severity, where to fix and a plan story id), then database (cache hit rates, connections against the limit, unused indexes, tables read in full, slowest queries by total and mean time, biggest tables and indexes, dead rows), platform advisors, budgets, and app health. Each metric has a status in words (Good / Watch / Act) and a "What this means" line.
- Migration `20261029210000_platform_performance_snapshot.sql`: `public.platform_performance_snapshot(uuid)`, SECURITY DEFINER, `search_path = ''`, execute revoked from public/anon/authenticated and granted to `service_role` only. It checks again that the profile is active platform staff and raises otherwise. The page calls it through `adminClientFor(adminGrant.platformAdmin(...))`. Query text is returned as a shape: string literals and numbers replaced by `?`, whitespace collapsed, cut to 200 characters. It is not callable by `authenticated`, so it adds no advisor finding.
- Rules and thresholds: `packages/core/src/platform/performance.ts` (pure, no model calls).

## Where each figure comes from
- Database: the RPC above (`pg_stat_statements`, `pg_statio_*`, `pg_stat_user_*`, `pg_stat_activity`).
- Advisors: Supabase Management API when `SUPABASE_ACCESS_TOKEN` is set on the server; otherwise `perf/advisor-baseline.json`, labelled "as of the last CI run".
- Budgets: `perf/bundle-budget.json` and `perf/query-budget.json`, shown as ceilings "as of the last build" (they are caps, not live measurements).
- Rate-limit refusals and CSP/CSRF reports: Vercel logs only, nothing queryable. The page says so and points at `docs/security/rate-limits.md` and `docs/security/csp.md`.

## Verified
- Live snapshot run inside a rolled-back transaction with a temporary staff row: returned real figures (cache 99.9%, 9 of 60 connections, 154 unused indexes) and no row contents. `platform_admins` on the live project is empty.
- `npx vitest run packages/core/src/platform/performance.test.ts` (11 pass); `node --test scripts/test-platform-performance-rls.mjs` (6 pass: anon, member and staff-session denied; service role refused for non-staff, suspended or unknown ids; no email or name in the output).
- `npm run typecheck`, ESLint on `apps/web`, `lint:migrations`, `lint:service-role`, `lint:boundaries`, `npm run build -w apps/web`, `check:bundle`, `budget:bundle`: green.

## Open / needs a person
- The signed-in page was not driven in a browser: no platform staff row exists, and the build container has no signed-in test project. Open it once after deploy at 360 px.
- A wonder-jobs read was not possible in this session (the repository was not attached), so the layout follows wonder-home's own careers admin page rather than a copy of WonderJobs'.
- Setting `SUPABASE_ACCESS_TOKEN` on Vercel gives live advisor counts; without it the baseline is shown.
- No user-guide entry: staff-only.
