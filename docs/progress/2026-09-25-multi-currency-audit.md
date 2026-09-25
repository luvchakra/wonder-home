# Multi-currency audit done; budgets made real (stories 22-007, 11-007)

**Date:** 2026-09-25

## What was done
- **Audit.** Every place the product adds amounts together was checked (a
  sweep for sums over `*_minor` in `apps/web` and `packages/core`):
  - **Groceries estimate.** It added all priced suggestions regardless of
    currency. It is now one total per currency, through the new
    `finance/totals.ts` (`totalsByCurrency`), e.g. "S$45 + US$12".
  - **Bills monthly trend.** It added every recorded payment into one bar. It
    now adds only the currency it shows and says how many payments in other
    currencies it left out.
  - **Already safe:** the bill-bunch prediction totals only when every bill
    shares one currency; a refund total stays within its payment's currency;
    an order's total is one order's line items in its one currency.
- **Budgets were broken and create-only in name only.**
  - The Bills page asked for a `spent_minor` column that does not exist, so
    the query failed and budgets always showed the empty state.
  - There was also no way to set one.
  - Now `finance/budgets.ts` works out what a budget has used this month,
    quarter or year from the payments on record, only in its own currency, and
    counts the rest.
  - `finance/budget-repository.ts` lists, sets (upsert on kind + period), changes
    and retires (`active=false`, never a delete) budgets.
  - The Bills card has "Set a budget", edit and remove for Admins, "X of Y this
    month · Z left / over by Z", and a line naming payments not counted.
- **HomeBrain's validator** only recognised ₹, $, €, £, INR and USD. An invented
  "SGD 120" or "300 AED" would have passed. It now recognises every supported
  currency's code, plus dirhams, euros and pounds. Three golden cases were added.
- The bill-kind list moved to `_lib/bill-kinds.ts`, so the server page and the
  client form read one list.

## Verified
- Typecheck, lint, core unit tests (budgets 5, totals 3, HomeBrain validation
  +3) and web tests.
- Browser at 360px and 1280px, with a Singapore household holding SGD and USD
  bills:
  - the trend showed only SGD, with "Not added in: 1 payment in USD";
  - a Utility budget of 200 showed "$115 of $200 this month · $85 left";
  - editing it to 100.50 showed "over by $14.50";
  - removing it hid the card row, and the row stays with `active=false`;
  - no horizontal scroll.

## Still open
- Nothing for 22-007. Screens outside the localized set still read in English (22-004).
