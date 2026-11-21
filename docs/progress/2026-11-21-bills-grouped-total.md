# Bills: grouped by Overdue / This week / Later / No due date, with one total line (11-020)

**Why.** The owner, 2026-11-21: "also add more useful features", after a screenshot of a flat list of seven bills, most weeks overdue, none saying so in words. Audited the Bills screen as someone running a household: the first questions are "what is late?", "what is due soon?" and "how much in all?". The list answered none of them and stopped at 8 bills.

**What changed.**
- Upcoming is grouped by what the reader is deciding (rule 17): **Overdue**, **Due this week** (today and the next six days, on the household's clock), **Later**, **No due date**, each in due order; empty groups are left out. An overdue row starts with "51 days overdue" in words (rule 3). The cap of 8 is gone; `listObligations` is now bounded at 500.
- One line above it (rule 9): "₹8,168.82 due · ₹7,018.82 of it overdue · 1 amount not in yet". Sums are integer minor units per currency, never converted (`totalsByCurrency`); a bill with no amount is counted, never guessed. Tapping the line lists each amount added, so the sum can be checked by hand.
- Pure `packages/core/src/finance/bill-groups.ts` (+ tests: group edges, days across a month end, the owner's own list, two currencies). Words in eight languages (plural forms); help Bills ¶13.

**Chosen and left.** Built 1 and 2 of the owner's list. Left as stories in `backlogs/11-Bills-and-Finance.md`: 11-021 full bill detail (rule 21; needs a route, audit and source reads), 11-022 recurring bills done properly, 11-023 quick fixes on a row (the pencil editor already changes due date, amount and who handles it; only snooze is new), 11-024 autopay (needs the owner's yes: it settles money without a person), 11-025 search/filter/CSV, 11-026 split and yearly view; 11-019 part payment and how-paid need a schema change.

**Verified.** `bill-groups.test.ts`, finance, i18n and help tests; typecheck, ESLint, build. No signed-in UI check (no `apps/web/.env.local` in this container); no test data made.
