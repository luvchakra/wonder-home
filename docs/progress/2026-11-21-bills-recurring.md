# Bills: recurring bills done properly (11-022)

2026-11-21 · third of the owner's seven Bills follow-ups.

## What changed
- **Repeats, in words.** A recurring bill's details say "Every month, on day 5", "Every 3 months, on day 5" or "Every year; next on 5 March 2027" (`finance/recurring.ts` `repeatOf`).
- **Usual amount as an estimate.** When this month's amount isn't in, the row adds "usually ₹X (estimate)", taken from the last payment in the same currency. The total line still counts it as "amount not in yet", never as money due (rule 9). Month by month already offered "Usually ₹X".
- **Skip a month** (Admins). Pays nothing and records no payment. It writes one `obligation_skips` row, then moves the bill to its next open month, the same way Mark paid does: the next month takes the amount someone gave for it, else "not in yet". The month then shows as "Skipped" in Month by month, never "Not entered". Mark paid also passes over skipped months.
- **End after this one** sets the bill to one-off, so the current month settles it when paid.
- Both happen at once, with Undo. They are audited as `finance.bill_changed` (`change: skipped|ended`), and reminders are reconciled after the response.

## Safe in either order
`20261121180000_bill_skips.sql` adds a new table, with row-level security that checks membership as a set (members read; Admins insert and delete). Before it runs, reads find no skips and Skip says it isn't switched on yet. Ending a series needs no SQL.

## Verified
- `finance/recurring.test.ts` (6) and the whole `finance/` folder (122) pass.
- Household reset/export and sensitive-actions tests pass.
- Typecheck passes. These lints pass: migrations, knowledge, service-role, input-boundary.
- Build and bundle budget pass.

## Open
- HomeTalk "skip the rent this month".
- The owner runs the SQL.

## Code
- `packages/core/src/finance/recurring.ts`, `periods.ts` (the `skipped` state), `repository.ts` (Mark paid passes over skips)
- `apps/web/app/(auth)/bill-recurring-actions.ts`, `_components/bill-repeat-controls.tsx`, `bills/page.tsx`
