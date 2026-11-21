# Bills: "Usually paid by autopay" (11-024)

**Date:** 2026-11-21 · **Story:** 11-024 · **Owner approval:** given 2026-11-21 ("build all seven in sequence"; autopay approved explicitly).

## What and why
- An Admin switches **Usually paid by autopay** on per bill, in the bill's details. The row then shows an **Autopay** badge.
- The daily pass (`packages/core/src/finance/autopay.ts`, run from `jobs/daily.ts` with the service role, on GitHub and on Vercel's fallback) marks the bill paid on its due date, in the household's time zone. It goes through the governed `markObligationPaid`, paid by the bill's owner, and is recorded as a run in `obligation_autopay_runs`: one per bill and month, claimed first, so a month is never marked twice. The run is **Checking**.
- It is never marked when the bill has no amount yet (it waits until the amount is known) or when the month was skipped (11-022). A failed mark removes its claim, so the next pass tries again.
- The bill's owner (otherwise an Admin) gets **"Marked as paid by autopay: {name}, ₹X. Not right? Undo"**. This is the notice source `autopay` (`notices.ts` `autopayNotices`, the sweep in `notices-sweep.ts`) with `reminder.autopay.*` wording in all 8 languages. It links to `/bills?autopay=<run>`.
- **Undo:** Bills lists the Checking autopay payments, and the bill's owner or an Admin can undo one there. Undo uses `undoBillPayment` with what the payment replaced, so a one-off goes back to unpaid and a recurring bill goes back to the month it moved on from. The run is kept as `undone`, so the month is never marked again.
- **Payment proof** (`homesend/payment-apply.ts`):
  - A bank, card or UPI message that matches a Checking run (same payee, date window and amount) confirms the run and records nothing else.
  - A message with a different amount flags the run. It is then recorded on its own as a payment conflict, which the nightly check asks about ("unusual amount"). The autopay payment is never changed.
- WonderHome never pays anything. Audit events: `finance.autopay_recorded`, `finance.autopay_undone`, and `finance.bill_changed` (`autopay: true|false`).

## Schema
`supabase/migrations/20261121210000_obligation_autopay.sql` adds two new tables (members read; Admins switch autopay on and off; a member may only set a run to `undone`), with the set-form RLS and foreign keys indexed. It also adds `autopay` to `notifications_source_type_check`. It is safe in either order: before it runs, every read is empty, so no bill is on autopay and no notice is sent, and switching autopay on says "Autopay isn't switched on yet." Both tables are in the knowledge registry (excluded) and in household reset under bills-and-money.

## Verified
- `finance/autopay.test.ts` (15 tests): due selection (a missing amount, a skipped month, a future day, a settled bill, a bill not on autopay); marking once and the second pass marking nothing; a failed mark releasing its claim; Undo; who may undo; setAutopay before the migration, across households, and switching it off; payment proof confirming and flagging; the notice.
- Typecheck for core and web. Gates passed: lint:boundaries, boundaries:input, service-role, migrations, knowledge, embeds, plus the touched test files.
- There is no signed-in UI check: this container has no `apps/web/.env.local`.

## Open / needs a person
- Run the migration SQL on the live project (it was given to the owner). Until then, autopay stays off.
