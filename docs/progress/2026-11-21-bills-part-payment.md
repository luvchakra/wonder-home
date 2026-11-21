# Bills: part payment and how it was paid (11-019)

2026-11-21 · the owner's "build all seven in sequence" (first of seven Bills follow-ups).

## What changed
- **Mark paid** asks *How much* (Paid in full / Part of it) and *How it was paid* (UPI, Card, Cash, Bank transfer, Not saying). Both are picked, never typed (rule 20).
- A month keeps its one `obligation_history` row. New columns: `paid_with`, `due_minor` (the whole bill while some is left; null once paid in full) and `parts` (each payment). `amount_minor` is what has been paid so far, so Transactions, budgets and the spend chart count real money paid.
- A part leaves the bill as it is. Its row reads "₹500 paid · ₹700 left"; the total line counts only what is left; Mark paid then offers the rest; the last part settles the bill (a recurring one moves on). A part-paid month is never treated as paid ahead.
- "Part" is only ever the person's choice: a smaller amount alone means the bill came to less.
- Undo of a payment that followed a part puts the earlier part back.
- No anomaly is raised on a part; it waits for the whole.

## Safe in either order
`supabase/migrations/20261121160000_bill_part_payment.sql` only adds columns. Reads use `select("*")`; writes add the new columns only when the payment is about them and, if the columns are missing, retry without them. A part payment before the migration says "Part payments aren't switched on yet".

## Verified
`finance/part-payment.test.ts` (6), `finance/mark-paid.test.ts` (+3), `obligation-currency.test.ts`, `_lib/mark-paid.test.ts`, help localisation tests; typecheck clean. No signed-in browser check: the container has no `apps/web/.env.local`.

## Open
- HomeTalk "I paid half the rent" as a part payment.
- The owner runs the SQL above (Supabase MCP is not used from this session).

## Code
`packages/core/src/finance/part-payment.ts`, `finance/repository.ts` (`markObligationPaidImpl`, `recordAmountImpl`, `undoBillPaymentImpl`), `apps/web/app/_components/mark-bill-paid-button.tsx`, `apps/web/app/bills/page.tsx`, `apps/web/app/(auth)/finance-actions.ts`.
