# A receipt becomes purchase history (story 09-009 Done)

**Date:** 2026-09-24 · **Module:** 09 Commerce, Groceries & Pet Supplies · **Story:** 09-009

## What was done

The test spec's live E2E-002 found that a paid receipt sent through HomeSend
was correctly *not* read as a bill, but nothing recorded what was bought.
`consumable_purchases` had been modelled and was never written. Now a receipt
is a HomeSend kind of its own, and it becomes purchase history line by line.

- **Reading.** `ai/classify-intake.ts` adds the kind `receipt`, with `merchant`
  and `lines` (name, quantity, unit, line total; up to 40). The prompt says a
  receipt is proof of a purchase already paid for, and is never a bill. The
  deterministic backstop (`sanitizeIntakeExtraction`) enforces this:
  - A receipt keeps only its amount, currency, document date, merchant and
    lines. Anything bill-shaped the model set is dropped (payee, bill kind,
    due date).
  - No other kind may carry a merchant or lines.
  - A line whose name contains an id is dropped.

  A receipt's date words ground to `documentDate`, in the household's own
  timezone.
- **Confirmation.** A receipt always waits for a person, whatever its
  confidence or the household's autonomy setting (`homesend/confirmation.ts`,
  like bills and health documents). Its understanding proposes
  `record_purchases`, with the shop and each line as named entities.
- **Matching.** `commerce/receipts.ts`'s `matchConsumable` suggests a tracked
  item only when the match is plain:
  - an exact word match, or containment where the tracked name's last word is
    also the line's last word. So "Amul Toned Milk 1L" is Milk, but "Milk
    bread" is not.
  - measures and noise words are ignored;
  - if two tracked items fit equally, it suggests nothing.

  `currencyCode` turns "Rs"/"₹"/"£"/"€" into ISO codes. `unitCostMinor`
  converts at the storage boundary only; everything shown is decimal
  (rule 22).
- **Review form** (`apps/web/app/_components/home-send-receipt.tsx`):
  - the shop, the day, the currency (a picker with an add-new option), the
    printed total, and one row per line;
  - each line has a name, how many, a "Counted in" picker, a line total, and
    "This is": a tracked item, "New — start tracking it", or "Don't record
    this line";
  - a caption under the select names the full item, so nothing is cut short
    (rule 11);
  - lines can be added and removed before anything is written (rule 12).
- **Writing** (`home-send-actions.ts`'s `routeReceipt`). For each kept line:
  - A new item reuses a same-named tracked item. Otherwise the line creates a
    consumable, with its own `grocery_item` change.
  - `recordPurchase` inserts the purchase and records a `purchase` change
    (migration `20260927100000_homesend_receipts.sql` adds the kind `receipt`
    and the change domain `purchase`, **applied live**).

  The item is then routed with the closed-word decision "added".
- **History refresh** (`commerce/repository.ts`). Each record or undo
  recomputes the consumable's last purchase from its own history (latest day,
  summed quantity that day). It re-infers `days_per_unit` with `inferRate`
  (three or more purchases) only when the basis is empty or `purchase_history`.
  A rate a member stated is never overwritten.
- **Undo.** Every line is its own change with its own Undo in the HomeSend
  inbox ("Bought: …", "Now tracking: …"). Undoing a purchase deletes it through
  `removePurchase` and refreshes the history. The item reads "Undone" once
  every line is undone.
- **Groceries.** Each tracked item's expanded detail lists its recent purchases
  (day · quantity · shop · cost each).

## Verified

- `npm run typecheck`, `npm run lint`: clean.
- Unit tests: 2466/2466. New: receipts 15, intake receipt 7, and the golden
  case HS-14 (a FreshMart receipt for household E, expected to be read as a
  receipt, dated, governed, and never executed).
- `npm run test:db`: 450/450. New: 3 commerce purchase RLS tests, plus the
  HomeSend receipt kind and purchase-change test.
- `npm run eval`: 46/46 with 0/14 unsafe, both deterministic and with
  `--provider configured` on Gemini.
- `npm run verify:live`: 157/157. New: the receipt kind and purchase-change
  constraint probes, and the school time columns.
- Live Gemini: the FreshMart and BigBasket receipts were read as receipts with
  lines. A paid-bill confirmation stayed `unknown`.
- Browser QA at 360px and desktop with a QA household:
  - The receipt review was prefilled: "Amul Toned Milk" matched Milk, Eggs was
    new, and Bread was left out.
  - Milk got its purchase at 28.00 INR each from FreshMart. Last purchased
    became 22 Sep × 2 and the rate was inferred from purchase history.
  - "Eggs (12)" started being tracked.
  - Undoing Milk put its history back to 18 Sep × 2 and cleared the inferred
    rate (checked by SQL).
  - Groceries shows "Recent purchases".
  - No horizontal overflow at either width.

Two things were found live and fixed:
- Gemini returns "Rs" as the currency. It is now normalised in the form and
  on the server.
- At 360px, the labels "Not recorded…" and "Something new — start tracking…"
  and the date field were clipped. The labels were shortened, the date and
  currency fields are stacked, and a caption carries the full name.

## Open

- An undone line reads "Bought: a line from this receipt", because the
  purchase it named has been deleted. `homesend_changes` has no label column.
  Keeping one is a small follow-up if it matters.
- Stock is not decremented from a purchase. Depletion stays an inferred rate,
  not an inventory count.

## Test data cleanup

Ran after PR #136 merged:
- Deleted the QA account `279680ea-bfb9-4906-84e8-38476c7d3ce9` with
  `qa-test-user.mjs`.
- Deleted its household `de4571ea-cf56-4919-96d9-78ac7199d2b0` ("Receipt QA
  Home"): audit and channel events first, then the household, which cascades
  its consumables, purchases, HomeSend items and changes.
- Deleted this session's rate-limit counters.
- Deleted the local screenshots and QA scripts.

SQL counts for the household, consumables, purchases, HomeSend items, audit
rows, counters and the auth user are all 0. No files were uploaded; the
receipts were pasted text.
