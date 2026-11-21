# Bills: split a bill between adults; a year's spend by kind (11-026)

2026-11-21 · sixth of the owner's seven Bills follow-ups.

## What changed
- **Split between adults** (Admins, in a bill's details).
  - Tick who shares the bill. Each gets a percentage, equal to start with, and the split saves only when they make 100%.
  - It is stored as basis points in `obligation_shares`, so it fits every month's amount.
  - The details show what each person owes of the amount. A largest-remainder split makes the parts add up to the bill exactly (rule 22). With no amount in yet, it shows the percentages.
  - Nothing is paid between people.
  - "Take the split off" removes it. It is audited as `finance.bill_changed` (`change: split|unsplit`).
- **{year} by kind**, under the monthly spend chart: what was paid this year for each kind of bill.
  - A payment's own kind counts first, else its bill's.
  - Per currency, never converted, with the number of payments.
  - It uses one bounded read (2,000 rows) in the page's first `Promise.all` wave.

## Safe in either order
`20261121190000_bill_shares.sql` adds a new table, with row-level security that checks membership as a set (members read; Admins insert and delete). A trigger keeps each share inside the bill's own household. Before the SQL runs, no splits are found, and saving one says it isn't switched on yet.

## Verified
`finance/bill-split.test.ts` (4) covers thirds adding up exactly, unequal shares, validation and per-currency year totals. Typecheck, lint, help tests and the build pass.

## Code
- `packages/core/src/finance/bill-split.ts`
- `apps/web/app/(auth)/bill-split-actions.ts`, `_components/bill-split-control.tsx`, `bills/page.tsx`
