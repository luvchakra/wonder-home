# Groceries Phase 2: HomeTalk manages groceries (story 09-011)

## What was done
HomeTalk now understands amounts and stock, through the same services the Groceries screens use (`commerce/inventory.ts`, the shopping list), as approved in the Groceries Phase 0 design.

- **Amounts are read by rules.** `conversation/quantity.ts`'s `readItemAmount` reads "6 eggs", "6 more", "2 kg potatoes", "1.5kg rice", "half a kilo of tomatoes", "a dozen eggs" and "two bunches of coriander". A model never decides a number. Names such as "7up", "a milk" and "almond milk" stay names.
- **Three new actions:**
  - `set_stock`: "we have 10 eggs".
  - `use_stock`: "we used half a kilo of rice".
  - `mark_bought`: "bought 2 kg potatoes". Something bought that was not on the list is added, then marked bought.
  - Rules for all three are in `conversation/rules.ts`. They need an amount, so "we have 2 kids" and "I got a call from school" are not stock.
- **Shared behaviour** lives in `conversation/grocery-actions.ts`:
  - **Adding.** "Add milk" when milk is already on the list changes nothing and says so. "Add 6 more eggs" adds to what is there.
  - **Removing.** Taking something off the list subtracts the amount given, or removes the entry. It never stops tracking the item.
  - **Meals.** A meal's missing ingredients skip what is confirmed at home.
  - **Matching.** An item is matched by name or alias, ignoring plurals. When two items fit, HomeTalk asks one question ("cherry tomatoes or plum tomatoes?").
- **Approval.** Stock changes are `schedule` actions against `groceries.stocked`, so they follow the household's groceries autonomy and ask first by default. Voice channels leave them to the app (`pantry_changes` in the capability matrix).
- **Conversation context.** "Add 6 more" resolves "that" to the item just discussed (`grounding.ts`, `references.ts`). Undoing or correcting an add reverses exactly the amount it added, including results written in the old shape.
- **Wording.** A purchase date is never read as "run out". `commerce/consumables.ts` now says "may run low… going by past purchases. Nobody has said how much is left." Such an estimate is never blocking, except for medicine (§2 of the spec, an approved reversal).
- **Help.** A new Meals and groceries paragraph in all eight languages.

## Verified
- quantity 15 unit, grocery operations 35, rules 85, and the conversation dialogues A–H in `evaluation.test.ts`.
- Golden cases HT-23 (`set_stock` waits for approval), HT-24 (`mark_bought` waits for approval) and HT-25 ("I have a headache" stays health).
- Full unit run: 219 files, 3152 tests. tsc core and web.
- Gates: boundaries, secrets, help links, security (12/12), and `npm run eval` (functional 55/55, 0 unsafe, voice 26/26 placed). Tracker current.
- No migration: Phase 1's tables and RPCs carry everything.

## Open
- "Make that 2 litres" (`readMakeThat`) is parsed but not yet wired as a correction.
- Phase 3 (09-012): meals, receipts and use-soon from real amounts.
- Phase 4 (09-013): Send to Cook over WhatsApp.
