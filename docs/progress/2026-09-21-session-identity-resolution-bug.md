# A signed-in parent resolved to their child's own view

## What happened

Reported live: signing in as `luvchakra@gmail.com` (the household's own
head of family, Kunal) showed the child-focused Home screen — "Hi Asmi!",
homework tabs — instead of his own. Confirmed at the database level this
was not a data problem: the account is correctly tied to Kunal's own
`profiles`/`household_members` row, and the household's real data (4
members, 7 responsibilities) was intact the whole time.

## Root cause

`listMemberships()` (`packages/core/src/identity/households.ts`) is how
every session-building path (`requireSession`, `optionalSession`, the
`/api/v1/households` and `/api/v1/me/view` routes, an audit-trail actor
lookup in `invitations.ts`) answers "which household member is the
signed-in person." Its query had no filter tying a row back to the
caller:

```ts
const { data, error } = await supabase
  .from("household_members")
  .select(...)
  .eq("status", "active");
```

`household_members_select_member`'s RLS policy is `wh.is_member(household_id)`
— correctly letting any household member read every row of their own
household, because the Family tab needs the whole list. Without a
narrowing filter, this same query does exactly that for *this* purpose
too: it returns every member of the household, not just the caller's own
row. `requireSession` then takes `memberships[0]` — the query has no
`order by`, so which row comes back first is unspecified, not necessarily
the signed-in person's. Every other caller has the same shape:
`invitations.ts` used an unfiltered `.find((entry) => entry.household.id
=== householdId)` to decide whose name goes on an audit entry when an
invitation is revoked — the exact same bug, but writing to the audit
trail under the wrong member's identity rather than just rendering the
wrong screen.

This is not a new bug from this session's own migrations, but it likely
went unnoticed for a household of Kunal's shape (four members, unordered
scan) until something shifted which row a plain sequential scan returns
first — plausibly the `alter table household_members add column ...`
migrations applied earlier in this session change a table's physical
layout in exactly the way that flips an "accidentally usually right"
unordered read.

## Fix

`listMemberships` now reads the caller's own id via
`supabase.auth.getClaims()` (the same primitive `db/server.ts`'s
`verifyUser` already uses) and filters `.eq("profile_id", userId)`,
restoring the invariant every caller already assumed: at most one entry
per household, and it is the caller's own.

New regression test in `scripts/test-identity-rls.mjs`: a second adult
member is added to the same household as the test's Head of Family, then
the exact query `listMemberships` now runs is proven, for each of the two
accounts, to resolve to that account's own membership row and not the
other's.

## Verified

- Confirmed directly against the live project, before and after: the
  unfiltered query returns 2 rows for Kunal's household (order
  unspecified); the fixed, filtered query returns exactly Kunal's own row
  for his account.
- `npm run verify` clean: 43 unit, 239 database (new regression test),
  256 E2E.
- No other caller of `listMemberships` needed a change — all of them
  already assumed the one-row-per-household contract this fix restores;
  none relied on the (buggy) multi-row behavior.

## What's still open

- This was found from a live report, not a systematic audit. Worth
  keeping in mind for any other place a query relies on RLS's own scope
  as an implicit "and this is also about me" — RLS answers "may this
  caller see this row," never "is this row about this caller."
- Whatever member row the household member actually saw during the
  window this bug was live may have taken UI actions that got attributed
  to the wrong member's identity (the `invitations.ts` audit-actor case
  is the clearest example of how). No evidence this specific household
  hit that path, but it was not ruled out either.

## Where the code lives

- `packages/core/src/identity/households.ts` — `listMemberships`
- `scripts/test-identity-rls.mjs` — new regression test
