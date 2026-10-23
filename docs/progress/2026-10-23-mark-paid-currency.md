# Marking a monthly bill paid failed for every bill with an amount

2026-10-23. The owner tapped **Mark as paid** on the Electricity reminder (₹3,100, due 24 Oct) and got "Something went wrong (reference notifications-41g7q9)".

## Cause
- **The rule:** the database keeps a bill's amount and currency together (`obligations_amount_has_currency`: both set or both empty).
- **The bug:** `markObligationPaid` moves a recurring bill on to its next due date with the amount cleared, because next month's figure is not known yet. But it kept the currency, so the update was refused. The Postgres log shows the violation at 09:02:35 UTC.
- **Who it hit:** every recurring bill with an amount, whether marked paid from a reminder, from Bills or through HomeTalk.
- **The half-written state:** the payment had already been written to the bill's history before the refused update. So the bill showed October as paid while still showing as due on 24 Oct.

## Fix
- **`finance/repository.ts`:**
  - marking paid clears the currency with the amount;
  - `createObligation` never writes a currency without an amount;
  - `updateObligation` clears the currency when the amount is cleared.
- **`home-send-writes.ts`:** an update from a document that adds an amount now sends its currency: the document's, else the bill's own.
- **The owner's bill:** completed by hand, as the fixed code would have done. Electricity (`fc2f5892…`) is now due 24 Nov, status expected, with no amount until November's is in. October's ₹3,100 payment stays in its history.

## Verified
- `finance/obligation-currency.test.ts`: marking a monthly bill paid moves it on with neither an amount nor a currency, and creating or changing a bill never writes a currency alone. Both cases fail on the old code and pass on the new.
- The finance, bill-talk, HomeSend and app action suites pass (428 tests). Typecheck and lint pass.
