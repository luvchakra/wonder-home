# Signed-in E2E against the live project: first real run

**Date:** 2026-10-26

The owner set the `E2E_SUPABASE_*` secrets and the `E2E_ALLOW_LIVE_PROJECT` variable, so the signed-in specs (`e2e/screens.spec.ts`, the signed-in part of `e2e/help.spec.ts`) could run for the first time.

## What was found and fixed

- **The manual nightly run stopped in `plan`.** `e2e-cleanup.mjs` refused the live project because `vars.E2E_ALLOW_LIVE_PROJECT` was empty (the variable had not been added yet). The workflow now reads it from a variable or a secret of that name. The `result` job also failed on its own when no part ran (`find parts`); it now reports nothing instead, so the real failure is the only red one.
- **Sign-in in both signed-in specs failed with "input[name=email] resolved to 2 elements".** That is React's streamed hidden copy (`div[hidden][id^="S:"]`, the #304 pattern). Both `signIn` helpers now `await streamed(page)` first.
- **`/notifications` showed "Something went wrong" when the server has no service role.** The spec's own server runs without one. `createAdminClient()` was called inside a `.then` whose `.catch` covered only `pendingApprovalsFor`, so the throw escaped and failed `Promise.all`. The `.catch` now covers both, and the screen loads without the approval requests. Production has the key, so live members were not affected; a missing or rotated key would have taken the screen down.
- **The screen walk hung on it** instead of naming it: an error boundary leaves its buffer unrevealed. Each screen now waits at most 8 s to settle, and one that never does is reported by its path. The walk gets 10 s per screen.

## Verified

- Locally against the live project: `E2E_ALLOW_LIVE_PROJECT=1 npm run test:e2e -- e2e/screens.spec.ts e2e/help.spec.ts` → **28 passed** (mobile and desktop), including the 25-screen walk, saving a Responsibilities group's mode and reading it back, and the unowned group refusing Pre Approved.
- `npm run verify:live` → 326/326, including the guard that every responsibility's autonomy is prepare/execute.
- By hand at 360 px as a QA household: Person/Outcome grouping; tabs All 4 / Mine 3 (no Family tab; `?tab=family` lands on All); each group card one row (label · count, dropdown, chevron); dropdown choices "Wait for Approval" and "Pre Approved" with their explanations; saving Pre Approved for Laundry survives a reload; no horizontal overflow.
- Web typecheck and ESLint on the changed page are clean.

## Cleanup

QA accounts `00273ecc-0538-4278-842c-2dc29364d876` and `16f763c4-4b41-4d76-9703-08dc55ed0c28` and household `c7ade159-21fe-407f-b511-8e819122388f` were deleted; both accounts read "User not found", and no E2E- or QA-named household remains. The specs delete their own accounts and households in `afterAll`.

## Open

- Auth's admin `listUsers` answers 500 "Database error finding users" on the live project at every page size. That usually means an `auth.users` row inserted by SQL with NULL token columns. Lookups by id work. It needs a look on its own (`select id, email from auth.users where confirmation_token is null or recovery_token is null or email_change_token_new is null`).
