# Bills & Finance: chevron detail, "Add transaction," and a real RLS gap it uncovered

## What happened

Two more items from the new 13-item batch, both on `/bills`:

- Item 132: "under overview, each card in this section should be having a
  down arrow chevron with full actionable details."
- Item 133: "when I switch to transaction tab, it should show add
  transaction," not the header's existing "Add a bill."

## What shipped

**Chevron detail on Upcoming bills.** Each row on Overview is now an
`ExpandableRow`: the collapsed summary is unchanged (name, due date,
amount, owner, the Pay/View action), and the opened panel adds kind,
status, payee, and — when any exist — the bill's recorded periods from
`obligation_history`. Per CLAUDE.md principle 12 ("every entity can be
added, updated and removed"), an admin's panel also gets edit and cancel
controls, since there was no update path for a hand-typed bill at all
before this — only `createObligation` existed. Added
`updateObligation` (a straightforward patch) and `cancelObligation` (a
status flip to `'cancelled'`, never a hard delete — the RLS policy
already covered `for all`, so no schema change was needed for either)
to `finance/repository.ts`, plus `updateObligationAction` and
`cancelObligationAction` server actions and an `ObligationRowControls`
component mirroring the pencil/archive pattern already used for
consumables and school items.

**"Add transaction" on the Transactions tab.** The header button now
swaps based on the active tab — `AddBillButton` on Overview,
`AddTransactionButton` on Transactions — instead of always showing "Add
a bill" regardless of tab. The new button wires up `recordAmount`
(`finance/repository.ts`), which already existed fully implemented and
unit-tested but had never been called from anywhere in the app: only a
provider-imported bill's own sync path or a hand-written test exercised
it. A new `recordAmountAction` validates household/bill/period/amount/
currency and calls it directly, so a hand-typed transaction gets the
same anomaly review an imported one would.

## What the "Add transaction" wiring uncovered

Browser-testing the new button against a live QA household immediately
surfaced a real, pre-existing gap: a household admin got "You cannot
record amounts for this household" on the very first attempt.
`recordAmount` writes to two tables — an upsert into
`obligation_history`, and, when the amount looks unusual, an upsert into
`spend_anomalies`. Every other financial table in the original bills
migration (`obligations`, `payment_intents`, `budgets`) got a
`select` policy and a matching `_write_admin` policy; `obligation_history`
only ever got the `select` half, and `spend_anomalies` only got `select`
plus an `update`-only policy meant for a human reviewing an existing
flag, not for the system inserting a new one. Both gaps were invisible
until now because nothing had ever called `recordAmount` through a real
authenticated session before — this is exactly the kind of latent bug
CLAUDE.md's migration-application note warns about, just found in RLS
coverage rather than in a missing migration.

Fixed with `supabase/migrations/20260921150000_obligation_history_write_admin.sql`:
an `obligation_history_write_admin` policy (`for all`, admin-gated,
mirroring `obligations_write_admin` exactly) and a `spend_anomalies_insert_admin`
policy (`insert` only, kept separate from the existing `update`-only
review policy since they're different actions by different actors in
spirit — the system flags it, a person reviews it).

## Verified

- `npm run verify` clean (twice — once before the RLS gap was found,
  once after the migration was added): typecheck, lint,
  migrations/embeds/boundaries/secrets lint, tracker/brand checks,
  security suite, unit tests, DB/RLS tests, production build, 256 E2E.
- `npm run verify:live`: 75/75, confirming the new migration landed.
- Browser-verified end to end against a live QA household (`pro` plan):
  expanded a bill and confirmed kind/status/payee/due/amount all render
  in the panel; edited the payee and confirmed it changed in the
  collapsed and expanded views; recorded a transaction for 2026-08 and
  confirmed it appeared on the Transactions tab with the right period,
  payee and amount, and as a "Recorded periods" entry and a monthly
  spend figure back on Overview; confirmed the Transactions tab's header
  button reads "Add transaction" while Overview's still reads "Add a
  bill"; cancelled the bill and confirmed it disappeared from Upcoming
  (status flip, not a delete — confirmed directly against the database).
  QA household and test user deleted afterward.

## What's still open

Items 5-9 and 14-16 of the same batch (Meals & Cooking) are separate
stories, not yet started.

## Where the code lives

- `supabase/migrations/20260921150000_obligation_history_write_admin.sql`
- `packages/core/src/finance/repository.ts` — `updateObligation`,
  `cancelObligation`
- `apps/web/app/(auth)/finance-actions.ts` — `updateObligationAction`,
  `cancelObligationAction`, `recordAmountAction`
- `apps/web/app/_components/finance-forms.tsx` — `ObligationRowControls`,
  `AddTransactionButton`
- `apps/web/app/bills/page.tsx` — chevron detail, tab-scoped header
  button
