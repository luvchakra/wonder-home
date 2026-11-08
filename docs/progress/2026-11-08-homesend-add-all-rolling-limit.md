# E2E nightly: HomeSend "Add all anyway" one run a minute, across a minute boundary

2026-11-08. The last red test in the E2E nightly (run 42442295508, `main` @ a505274b):
`e2e/screens.spec.ts` › "HomeSend folds identical items, names what couldn't be read,
and clears in one tap with Undo", mobile and desktop.

## Root causes

1. **Product bug: "one run a minute" did not hold.** `homesend.add_all` (max 1 per 60 s)
   went through `public.rate_limit_hit`, which counts in fixed windows aligned to the
   clock. A run at 09:24:58 and another at 09:25:02 land in two windows and both pass.
   The live counters showed it: one household with one hit in the 03:24 window and one
   in 03:25. That is the desktop failure at "pausing for a minute" — the second run was
   not refused, it ran (Archive all stayed disabled while it did).
   **Fix:** `public.rate_limit_hit_rolling` (migration `20261108090000_rate_limit_rolling.sql`)
   counts allowed hits in the last `p_window_seconds`, one row per hit in the same
   `rate_limit_counters` table, under a per-(bucket, subject) transaction lock so two
   simultaneous calls see each other. Buckets marked `rolling: true` in `RATE_LIMITS`
   use it; only `homesend.add_all` is, today. Same grants (service role only) and the
   same fail-open as the fixed form. Applied to the live project in this session.
2. **Spec budget, not the product: "Archived 7." and "Put 7 back."** Both nightly
   errors at those lines were "Test timeout of 30000ms exceeded": the test runs four
   server actions against the live database from a runner far from ap-south-1, and one
   step alone already allows 30 s, inside a 30 s test. Archive all and its Undo did the
   right thing whenever they had time (verified locally; the database side of the
   archive/restore updates is 24–32 ms mean in `pg_stat_statements`). The test now has
   `test.setTimeout(120_000)` and a 15 s wait on the three later server-action results;
   no assertion changed.

## Verified

- `packages/core/src/security/rate-limit.test.ts` (new case: `homesend.add_all` uses the rolling RPC).
- `npm run test:e2e -- e2e/screens.spec.ts -g "HomeSend folds"` against the live project
  (`E2E_ALLOW_LIVE_PROJECT=1`, `E2E_SERVER_SERVICE_KEY=1`): before the fix the second
  run was not refused; after it, 4/4 passed (`--repeat-each 2`, mobile and desktop).
- `npm run lint:migrations`, `lint:service-role`, core typecheck.

## Cleanup

The spec creates and removes its own household and user. No QA accounts were created by
hand. A probe of the new function on live was not run (its confirm timed out), so no
probe rows exist.
