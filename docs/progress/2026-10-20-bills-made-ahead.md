# Bills picked not typed, payees by location, months made ahead (11-010)

**Date:** 2026-10-20
**Asked by:** the owner: "instead of free text field, make these fields drop down values based on typical household requirements. the payee options can be populated based on home location. put more intelligence in this module. also add option to add historical bills. auto generate advance billing entries which user can fill will about and paid dates. minimum intervention required by user. align this properly with HomeTalk and HomeBrain so this can be fully controlled by these modules"

## What was done
- **Picked, not typed (rule 20).**
  - Add a bill opens on "What is it?" with 22 typical Indian household bills (`finance/bill-catalog.ts`), plus Something else.
  - Picking a bill fills in its kind and how often it comes. Its name stays editable.
  - Who in the family pays it is a picker, and how often it comes can now be changed when editing.
  - `obligations.bill_type` keeps which bill it is.
- **Payees by home location.**
  - `finance/payees.ts` reads the state and city from the address saved under Manage Household (`/household/address`), matched by name.
  - It offers the companies serving that city first, then the state's own companies: electricity, water, piped gas and property tax. National payees follow: LPG, telecom, broadband, DTH, streaming, banks, cards and insurers.
  - A household's own payees come first only for a bill with no payee list of its own, such as rent or school fees.
  - Add a new payee is always there.
- **Earlier bills.** Rows at the bottom of Add a bill record months already paid, one history row each, so the usual amount is known from the start.
- **Months made ahead.**
  - `finance/periods.ts` works out a bill's coming months from its due date: this month and the next three, or one ahead for a quarterly or yearly bill. Nothing is stored until someone says something about a month.
  - Each month shows Paid, the amount someone gave, or "Usually ₹X" from the last payment. A figure is never invented.
  - The pencil on a month (`fillBillPeriodAction`) takes an amount, kept in `obligation_periods` (migration `20261020170000`, live, RLS set forms). It can also take the day it was paid:
    - for the current month, the bill moves on (`markObligationPaid`, which now takes the next month's given amount and never carries last month's figure over);
    - for a later month, the bill is paid ahead and skips that month when it gets there (`nextOpenDueDate`).
  - The monthly spend card counts only months up to now.
- **HomeTalk** (`conversation/bill-talk.ts`). Three new actions, each through the finance service under the speaker's own session:
  - `add_bill` is asked once, with its own reason.
  - `record_bill_payment` is done at once.
  - `set_bill_amount` is done at once.

  Both done-at-once actions can be undone through `undoBillPayment`, which also restores an advance amount the next month took. Bills are grounded to the household's own by name or kind (`matchBill`), and when two bills fit HomeTalk asks one question. Other wiring:
  - financial reply class;
  - voice capability `bill_records` (in the app only, never Alexa);
  - the model's schema gains `dueDay`, `recurrence` and `period`.

  No money moves. Paying stays `make_payment`.
- **HomeBrain.** Paid months (`bill_payment`) and coming months (`bill_period`) are facts. "How much was the electricity bill last month?" and next month's rent are answered from records. A database trigger marks the store stale on writes to `obligation_history` and `obligation_periods`.

## Verified
- Unit tests:
  - new: `payees.test.ts`, `periods.test.ts`, `bill-talk.test.ts`;
  - extended: rules coverage, the conversation evaluation (§21 table and a bills golden case), context golden;
  - all unit tests pass (3,843).
- `npm run eval`: 148/148, unsafe 0/19, voice gate pass (HT-129 to HT-131 added).
- `scripts/test-bill-periods-rls.mjs`: 5/5.
- Typecheck, lint and migration lint pass.
- Browser, on the live project with the QA household, which was given a Bengaluru address, at 360px and 1280px:
  - Electricity picked by default, with BESCOM first ("Companies serving Bengaluru come first");
  - two earlier bills saved;
  - Coming up showed November to February;
  - December's amount was set and January paid ahead;
  - HomeTalk "I paid the electricity bill, 2,380 today" was done, then undone;
  - "next month's electricity bill is 2,700" was noted;
  - "add the water bill, 600 due on the 10th every month" was asked, then added after "yes".
- Two things the QA run caught were fixed:
  - text clipped at 360px in the who-pays picker and the earlier-bill month;
  - undo dropping an advance amount.

## Open
- **11-011:** payees for smaller cities and for homes outside India.
- **No live payment provider:** paying stays out of WonderHome, as before.
