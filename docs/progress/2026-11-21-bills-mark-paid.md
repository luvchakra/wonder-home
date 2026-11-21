# Bills: Mark paid on every bill, Mark as unpaid, several at once (11-018)

**Why.** The owner (2026-11-21, phone screenshot of Bills): "give option to mark it as paid". Most of his Upcoming bills were weeks overdue because he had paid them elsewhere, and the list had no way to say so. The governed write existed (HomeTalk's "I paid…", and Home's Need-you rows) but the Bills list never offered it.

**What changed.**
- **The blue "Pay" is now "Mark paid"** for an Admin on every unpaid bill row (`apps/web/app/bills/page.tsx` `BillRow`). "Pay" only opened HomeTalk with "Pay the …", and WonderHome cannot pay a bill; two buttons for one job would break rule 14, so the row's one action records a payment made elsewhere. A non-Admin keeps "Open"; an autopay ("Arranged") bill still shows Mark paid, quieter.
- The confirm sheet (`_components/mark-bill-paid-button.tsx`) adds **Who paid**, picked from the household's adults (default: whoever handles the bill), next to the amount and the day. Recorded at once with Undo through `markObligationPaid` (now taking `paidByMemberId`); a one-off bill goes to Settled, a recurring one moves on to its next month, an amount not in yet stays blank, a Checking bill is confirmed (`marked_paid`). Reminders reconcile straight after the response (`after()`), rather than at the next scheduled run.
- **Mark as unpaid** on a settled bill (Settled tile): `markObligationUnpaid` in `finance/repository.ts` puts it back to waiting and removes that month's payment, so totals, monthly spend and budgets agree (`_components/mark-bill-unpaid-button.tsx`).
- **Tidy up → Mark selected as paid**: tick several and confirm once, the sheet naming each (`bill-tidy.tsx`, `markBillsPaidAction`; same write per bill, bounded by `REMOVE_BILLS_MAX`).
- HomeTalk already recorded "I paid the electricity bill"; eval **HT-196** "Mark the internet bill as paid on the 14th" added.
- Words in all eight languages; help Bills ¶12 and `updated` 2026-11-21.

**Permissions.** As before: who may change a bill (an Admin, `requireHouseholdAdmin`, RLS) may mark it paid or unpaid; children never. No schema change, no migration.

**Verified.** `packages/core/src/finance/mark-paid.test.ts` (paid one-off, who paid, amount not in yet, recurring moves on, already settled refused, unpaid restores and removes the month's payment, unpaid refused on a waiting bill), `obligation-currency.test.ts`, `_lib/mark-paid.test.ts`, i18n and help tests, `npm run eval -- --cases HT-196,HT-129` (2/2), typecheck, ESLint, `npm run build -w apps/web`, `check:bundle`, `lint:help-links`. No signed-in UI check: this container has no `apps/web/.env.local` (no service-role key), so no QA household was made and there is nothing to clean up.

**Open.** 11-019: part payment (history keeps one row per bill and month) and "how it was paid" (UPI, card, cash, bank) need a schema change. Part 2 of the request (grouping by Overdue / This week, an explainable total, quick fixes) follows in its own PR.
