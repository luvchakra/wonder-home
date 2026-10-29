# SEC-10: RLS-coverage standing test (2026-10-29)

**Done.** `scripts/test-coverage-rls.mjs` (logic in `scripts/lib/rls-coverage.mjs`, exceptions in `scripts/lib/rls-coverage-config.mjs`) introspects the database built from the migrations and fails on a new table without RLS or policy, a per-row helper or bare `auth.uid()`, an open or anon-facing policy, a SECURITY DEFINER function without `search_path` or callable by anon, and anon table grants. It matches `test-*-rls.mjs`, so db-tests CI runs it with no workflow change; `npm run test:rls-coverage` runs it alone.

**Baseline (documented in `docs/security/rls-coverage-baseline.md`):** 0 tables without RLS, 0 without a policy, 0 banned policy patterns, 0 SECURITY DEFINER without `search_path` (121 checked, so SEC-13 has no offenders from this check). Allowed: 6 signed-in-read platform catalogues. Baselined for SEC-08 / SEC-13: 54 `wh` SECURITY DEFINER functions with default PUBLIC EXECUTE reaching anon (unreachable, anon has no USAGE on `wh`) and 7 tables where anon holds table privileges behind a deny-all policy.

**Verified:** local Postgres 16, `npm run test:rls-coverage`: 9 pass. Negative: a scratch migration creating a table without RLS made the real-schema test fail naming `no-rls:public.zz_scratch_demo` (file removed); the committed test also creates RLS-less and policy-less scratch tables in its own throwaway database and asserts both are caught. Allowlist/baseline logic (new, stale, unexplained entries) is unit-tested with synthetic facts.

**Open:** burn down the baseline (SEC-08, SEC-13). `app schema` means every schema except Supabase's own; `storage` policies are not covered here.
