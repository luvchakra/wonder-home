# A number said without a unit is the item's practical amount (25-037)

**Date:** 2026-10-26 · **Story:** HomeFood 25-037 · **Code:** `packages/core/src/commerce/bare-amount.ts`

## Why

The owner on WhatsApp: "milk, eggs and bread" → HomeTalk asked how much of each → "2 of each" → "Added Milk (+2 ml, now 2.502 L), Eggs, Brown (+24 pcs, now 32 pcs) and Bread, White (+2 loaves, now 3 loaves)". A bare number was read in the unit the item is *stored* in (`amountFor` used `line.amount.unit ?? item.unit`): ml for milk, dozen for eggs. Bread was right only because it is kept in loaves. The owner: "define default unit amount for each, which is practical, 2 for milk should not be 2ml, should be 2L ... 2 for eggs should not be 2 dozen, should be 2 pieces of eggs".

## The rule

One function, `readBareNumber(count, item)`, read from data the item already carries (its unit, and its catalog entry's category, pack and ladder), with a name check only where an item has no catalog entry:

| Item | "2" means | How it is known |
|---|---|---|
| Liquids (milk, oil, juice) | 2 L | kept by volume |
| Liquids sold only in small packs (buttermilk 200 ml) | 2 packs | catalog pack under 250 ml |
| Counted things (eggs, bananas by the dozen) | 2 pcs | kept in pcs or dozen |
| Kept in its own word (bread, coriander, a packet) | 2 loaves, 2 bunches… | the item's unit |
| Loose weighed staples (rice, atta, dal, sugar, onions, vegetables, meat) | 2 kg | kept in kg, catalog pack ≥ 1 kg, or a ladder rung ≥ 250 g; by name when made by hand |
| Small weighed things (spices, tea, butter, paneer, cheese) | 2 of the catalog's pack (2 × 200 g paneer) | pack, else the household's step, else the ladder's first rung |
| … and 50 or more of them | grams ("200 paneer" is 200 g) | no one buys 50 packs of a spice |
| Things people count but the list keeps by weight (lemons, apples, bananas by the kilo) | asked | no weight is guessed for a piece |

Past what anyone buys at once (20 L, 25 kg, 60 pcs, 20 packs) the number is asked about once in grounding — "Did you mean 2 L of milk? Say "yes", or tell me the amount with its unit, like "2 litres"." — and "yes" takes the amount named (`quantityMeant`, answered in `clarify.ts`; the engine lets that yes through instead of reading it as a yes to a proposal). An explicit unit always wins: "2 dozen eggs" is 24 pcs, "500 ml milk" is 0.5 L.

## Where it is used

- Every HomeTalk grocery write: `conversation/grocery-actions.ts` `amountFor` (add, remove, we have, used, bought), so "2 milk", "2 of each" and an answer to "how much…?" all read the same way.
- The how-much question: examples come from the same rule and read back as they say ("1 litre milk and 6 eggs"; "2 of each" only when 2 reads for every item). Single item: "1 litre or 500 ml", "6 or a dozen", "1 kg or 500 g", "1 loaf or 2 loaves". The old "2 bottles" for milk kept in ml would not have fitted the item.
- HomeSend's grocery add (`homesend/record-types.ts` `groceryAmount`, used by `home-send-writes.ts` `addGrocery`): a tracked milk given "2" with no unit used to add 1 ml; a new item with no unit said is now kept the way the catalog keeps it.
- Help: meals-and-shopping §6 says how a number on its own is read, in all eight languages.

## Verified

- `commerce/bare-amount.test.ts` (17): the rule table, the asks, examples reading back.
- `conversation/operations.test.ts`: the owner's case end to end through the executor ("+2 L, now 4.5 L", "+2 pcs, now 10 pcs", "+2 loaves, now 3 loaves"); "2 milk", "3 eggs", "2 rice", "1 oil"; "2 dozen eggs", "500 ml milk", "500 g rice"; "we have 10 eggs" is 10 pcs; "2000 milk" is never written.
- `conversation/evaluation.test.ts` B⁶, B⁷: the question's text and examples, "2 of each", the example answered, "Did you mean…?" then "yes".
- `whatsapp/whatsapp-intake.test.ts`: the WhatsApp path with the owner's three items.
- `homesend/record-types.test.ts`: `groceryAmount`.
- Eval HT-158, HT-159 pass (`npm run eval -- --cases HT-158,HT-159`).
- Typecheck (core, web), touched suites (1758 tests), help links, import boundaries, `npm run build -w apps/web`, `check:bundle`.

## Open / for a person

- The owner's own list may still hold the amounts the bug made (milk 2.502 L, eggs 32 pcs). Their data was not changed; they can fix those rows on the Groceries screen. "Undo" only works right after the change.
- No migration; nothing to apply live.
