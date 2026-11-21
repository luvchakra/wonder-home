# Bills: search, filter and a year's CSV (11-025)

2026-11-21 · fifth of the owner's seven Bills follow-ups.

## What changed
- **Search and filter**, a fold-out above the lists, narrows Upcoming, Settled and Transactions.
  - Three pickers: kind, payee (any case) and person. Each offers only what is on record (rule 20).
  - It is a GET form, so a filtered view is a link. When a filter is on, the fold-out stays open and says how many bills it shows.
  - A payment's own payee, kind or person counts before its bill's, as Transactions shows it.
  - Budgets and the spend chart still count every payment.
- **Download {year} as CSV** goes to `/bills/export?year=YYYY`. It lists the year's bills, then the payments for its months.
  - Amounts are decimal, in their own currency, with a currency column. Nothing is converted (rule 22).
  - It includes how each payment was paid and "part of" (11-019).
  - A cell starting `= + - @` is prefixed so a spreadsheet won't run it (CSV injection). A BOM makes Excel read UTF-8.
  - `cache-control: no-store, private`. Open to whoever may see Bills on a plan that includes it. Bounded at 500 bills and 2,000 payments.

## Verified
- `finance/bill-filter.test.ts` (4) and `finance/bills-csv.test.ts` (3) pass. These cover decimals, injection and quoting, and the row order.
- Finance and help tests (206), typecheck, build and the bundle budget pass. No migration.

## Code
- `packages/core/src/finance/bill-filter.ts`, `bills-csv.ts`
- `apps/web/app/bills/export/route.ts`, `bills/page.tsx`
