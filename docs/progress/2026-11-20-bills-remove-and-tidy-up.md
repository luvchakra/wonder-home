# Bills: Remove, Tidy up, and one email added once (11-016)

**Owner, 2026-11-20** (phone screenshot of Bills): "add option to delete these entries, … many electricity items are there so there should be option to clean up easily". The list had four electricity rows (1 Oct ₹2,500; "BESCOM electricity bill for October" ₹2,140 and "Electricity bill" ₹2,340, both Checking, both due 5 Nov; 24 Nov, amount not in yet) and two broadband-like rows.

## What changed

- **Remove a bill.** The expanded bill row already had an unlabelled cancel icon (`Ban`) that stood a bill down with no confirm. It is now **Remove** (one control, rule 14) with one confirm naming the bill, its amount and due day, and, when payments are on record, saying they stay on Transactions. It stands the bill down (`status = cancelled`; never a hard delete, rule 12), so its reminders stop at the next reconcile (the reminder source reads open bills only) and its money history stays. Admins only, as for editing (RLS agrees). Audited `finance.bill_removed`.
- **HomeSend stays consistent.** Removing a bill HomeSend added marks its live `homesend_changes` undone by that person, and the item `undone` when nothing else from it is live — exactly what Undo leaves — so no item shows "added" for a bill that is gone, and nothing picks it up to add again. `packages/core/src/finance/remove-bills.ts`, `removeBillsAction` in `apps/web/app/(auth)/finance-actions.ts`.
- **Tidy up.** A quiet pill beside Add a bill (Admins, two or more upcoming bills) opens a sheet with:
  - **Looks like the same bill**: bills of the same kind (the picked bill type, else words in the name or payee, else a payee the catalogue knows: "BESCOM…" is electricity, "Airtel Xstream Fiber" broadband) falling due within 7 days of each other. Each group has one plain line from the records ("Electricity: ₹2,140 and ₹2,340, both due Thu, 5 Nov.") and a suggested one to keep — already confirmed, read from what was sent in, has the amount, else the newest — preselected; the person picks and taps "Keep the ticked one, remove the rest".
  - **Pick bills to remove**: every upcoming bill, each kind together, to tick and remove.
  - Every removal is one confirm listing the bills. Nothing is removed or merged by default, nothing pays, and different months of one bill are never called duplicates; a bill with no due date is never a duplicate. `packages/core/src/finance/duplicates.ts`, `apps/web/app/_components/bill-tidy.tsx`.
- **Why the duplicates were made, and the fix.** Every HomeSend add path checks for a matching bill before it writes, and the matcher would have matched the two 5 Nov readings (title similarity 0.9, same day, new amount → update). But a trusted sender's email body and each attachment were handed to the add step as separate deferred tasks that run at the same time, so each checked before the other had written and both were added as Checking. `homesend/email-webhook.ts` now adds an email's items one after the other in one deferred task; the second finds the first and becomes an update. Eval **HS-111** pins the matcher verdict this relies on (a second reading of the bill on record for that day → update, not a new bill).
- Words in all eight languages; help Bills ¶11 and the section's `updated` date; backlog 11-016 Done, 11-017 opened.

## Verified

- Unit: `finance/duplicates.test.ts` (the owner's exact eight rows: groups 4+5 only; 1/7 related as the recurring Electricity rows, never duplicates; no-due-date never a duplicate), `finance/remove-bills.test.ts` (Admin only; only this household's; paid bill kept as a row; HomeSend change undone and item released only when nothing else is live), `homesend/email-webhook.test.ts` (adds run one after the other), plus i18n, audit, sensitive-actions, finance and cache/client-write gates: 279 + 7 passed.
- `npm run eval -- --cases HS-111`: 2/2.
- Typecheck (`apps/web`, `packages/core`), ESLint on changed web files, `lint:help-links`, `npm run tracker`.
- Browser, QA household on the live project seeded with the owner's eight bills: at 360 px Tidy up sits beside Add a bill, the sheet groups the two 5 Nov electricity bills with the reason above and lists each kind together, no horizontal overflow; Remove on the 1 Oct row confirmed "Remove Electricity? Due Thu, 1 Oct · ₹2,500 …" and the row became `cancelled`; Tidy up's keep-one removed the other 5 Nov bill; Pay unchanged. Desktop 1280 px: no overflow.
- Cleanup: the QA household, its rows and the QA user were deleted (counts 0 for households, obligations, members, subscriptions, audit events, profile); temp scripts, `.env.local` and the dev server removed.

## Open

- **11-017**: two separate deliveries of one bill arriving together (a WhatsApp forward and an email) can still each add; and `homesend/add-default.ts` `addWaitingItem` (a tap or the 24-hour default on "Add this bill?") adds without re-checking. Needs a per-household serialisation of HomeSend bill writes or a payee + due-date guard, and a re-match there that resolves the item rather than leaving it waiting.
- The owner's real bills were not touched; the owner cleans up with the new controls.
- No migration and no SQL.
