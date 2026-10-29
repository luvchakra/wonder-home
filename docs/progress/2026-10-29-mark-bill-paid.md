# Mark paid on bill rows (2026-10-29)

Owner request: "give option to mark these as paid in an easy way" on Home's Today's focus / Deadlines at risk.

## What was done
- Bill rows (`pay_bill`) now carry **Mark paid** on the collapsed row, in place of the "Pay" link, on Home (Today's focus) and the Bills "needs you" detail. One tap opens a small sheet: amount paid (the bill's own amount when known, decimal per rule 22, editable) and paid-on (today in the household's timezone). Confirm records it.
- No second path: `markBillPaidAction` calls the existing `markObligationPaid` (the write HomeTalk's "paid" uses); a recurring bill moves to its next period. `undoBillPaidAction` calls the existing `undoBillPayment`. Both require `requireHouseholdAdmin`; the button is only rendered for Admins, and the server decides again. WonderHome records that a person paid; it never pays.
- After Confirm the row steps aside with an 8-second Undo toast, then the page refreshes without it.
- The reason shows once: the expanded detail already dropped the repeated sentence in #489, and bill rows share that component.
- `HomeAssessment.payment` (optional) carries the bill's amount and currency from `assessObligation`.
- Words: `bills.markPaid.*` in all eight languages; Bills help section gets a paragraph (`help.guide.bills.body.10`), `updated` 2026-10-29.

## Verified
- `tsc` (apps/web) clean; ESLint on touched files clean; vitest: payments, `_lib/mark-paid`, help and i18n suites pass.
- Not done: a 360 px `ui-check` against a signed-in household (no dev server or live account in this session).

## Open / needs a person
- Owner: mark Electricity and Piped gas paid, check Bills shows them paid.
- Audit: reuses the existing repository write, so no new audit event type was added.

Code: `apps/web/app/_components/mark-bill-paid-button.tsx`, `agenda-expandable-row.tsx`, `apps/web/app/(auth)/finance-actions.ts`, `apps/web/app/_lib/mark-paid.ts`.
