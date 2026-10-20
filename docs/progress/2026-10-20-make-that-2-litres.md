# "Make that 2 litres" corrects an amount (25-005)

**Date:** 2026-10-20 · **From:** backlog 25 (`backlogs/25-HomeFood.md`), the next row of `tracking/PRIORITY-ITEMS-REPORT.md` after 25-003c.

## What was built

- `conversation/corrections.ts`: a value correction that is only an amount ("make that 2 litres", "actually, make it 500 grams", "make that 10") is now read by the same rules that read amounts everywhere (`readItemAmount`). For an add, order, stock or purchase request with one item it rewrites that item's amount and keeps its name: "milk" becomes "2 litres milk", "1 kg rice" becomes "500 grams rice". The person's own unit word is kept.
- A proposal still waiting is replaced. An executed add is taken back off the list through the executor's existing undo and redone with the new amount, both kept on the record.
- Before this, "make that 2 litres" after "add milk" fell through to the "a different thing on the list" branch and would have renamed the item "2 litres". An amount said about a request that has none (an absence) is now refused, where it used to be read as a person called "2 litres".
- A request with several items is left alone: which one is meant is not guessed.
- Help "Talk to WonderHome" ¶3 gives the example in all eight languages.

## Verified

Unit: `corrections.test.ts` (5 new): the amount is read as a correction value; item kept and amount changed on a proposal and on an executed add; stock and purchase requests; several items and amount-less requests refused; the reply says "milk → 2 litres milk". Whole `conversation/` suite (584) green.

## Still open

An executed stock change or purchase cannot be taken back by a correction (no undo service for them), so correcting one says so and leaves it as it was, as for every kind without one. Adding that undo is its own story if wanted.
