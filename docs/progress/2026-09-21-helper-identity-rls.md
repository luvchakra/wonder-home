# Helper/service identity: proving the account is actually limited (01-008)

**Date:** 2026-09-21
**Area:** `scripts/test-helper-identity-rls.mjs`

## What was done

Story 01-008 ("Helper/service identity — support limited helper accounts")
looked unstarted in the tracker, but investigating it found the feature
itself already fully built: `MemberType` already carries `"helper"`,
`ROLE_DEFAULTS.helper: []` already denies every capability by default,
invitations already offer a helper member type, and `/househelper` is a
real, live screen. There was nothing left to build.

What was missing was proof at the right layer. The only coverage for "a
helper's account is limited" was `permissions.test.ts` asserting that the
`can()` function, given a helper role, returns `false` — a TypeScript
function agreeing with its own table. Nothing exercised the actual RLS
policies with a real `member_type='helper'` row, which is the layer that
matters: `can()` could be wired correctly and a policy could still allow
the row anyway if nothing ever tested the database directly.

New `scripts/test-helper-identity-rls.mjs` (9 tests) closes that gap,
grounded directly in the migration SQL rather than assumptions:

- **Finance is invisible, not just unlisted.** `wh.may_see_finance()`
  (`20260917163943_bills_and_payments.sql`) explicitly excludes
  `role in ('child', 'helper')`. Verified a helper reads zero rows from
  `obligations` and is refused an insert.
- **Another member's private conversation stays private.**
  `conversation_sessions_select_own` scopes to the owning member or
  `visibility = 'household'`. Verified a helper cannot read another
  adult's `private` session.
- **The household's own administration is out of reach, but not
  invisible.** A helper can read `household_roles` (knowing who
  administers the household isn't privileged) but cannot insert one —
  granting itself `administrator` is refused. Same shape for
  `household_invitations`: a helper sees none and cannot create one.
- **The account can do the one thing it exists for.** A helper can insert
  and read its own `member_availability` row, and is refused when it
  tries to write another member's — proving "limited" didn't become
  "locked out of the account's own reason to exist."
- **Cross-household isolation holds** for a helper's membership and
  availability rows, same as every other table.

## Where the code lives

- `scripts/test-helper-identity-rls.mjs` (new, 9 tests).
- `backlogs/01-Identity-and-Family-Accounts.md`, `tracking/PROGRESS.md`,
  `docs/PROGRESS.md` — 01-008 marked Done; module 01 now complete.

## Verified

- `npm run typecheck`, `npm run lint`, `npm run lint:boundaries`,
  `npm run lint:embeds`, `npm run lint:migrations` — clean.
- `npm run test` — 1313 unit tests / 96 files, plus 43 script tests, all
  passing.
- `npm run test:db` — 233 database tests (224 existing + 9 new), all
  passing.
- `npm run build` — clean.
- `npm run test:e2e` — 256 passing.
- `npm run brand -- --check`, `npm run tracker -- --check` — clean.

## Still open

Nothing new. The account, invitation and UI infrastructure this story
asked for was already shipped in earlier stories; this pass only added
the database-level proof that it holds.
