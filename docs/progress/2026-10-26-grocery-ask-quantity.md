# HomeTalk asks how much before it adds a grocery (25-036)

Date: 2026-10-26 · the owner's decision · PR #365

## Why

On WhatsApp the owner said "Add oil to the groceries". HomeTalk asked "Should I use coconut oil, mustard oil or sunflower oil?". The owner answered "coconut oil" and got "Coconut oil is already on the shopping list (1 bottle), so there was nothing to add." The owner said: "it should ask for quantity".

The old rule was on purpose: a bare name already on the list was left alone ("two people saying add milk means milk, not twice the milk"), and a new bare name got the item's usual pack. The owner has now changed the product rule, so the old expectations were changed with it.

## What changed

- **Grounding (`conversation/grounding.ts`).** An `add_to_list` that names an item with no amount now ends in one clarify question, awaiting `quantity`, before anything is written. The question lists every bare item at once (`quantityFor`).
  - It is skipped for a meal's ingredients (`forMeal`) and for `keepAsIs`.
  - An item that already carries an amount is never asked about.
- **The question (`grocery-actions.ts` `quantityQuestion`).**
  - A new item: "How much coconut oil should I add? For example 1 litre or 2 bottles." The examples follow the item's unit, and a counted item asks "How many".
  - An item already on the list: "Coconut oil is already on your shopping list (1 bottle). How much more should I add? Or say "that's enough" to leave it."
  - Several items: "How much of each should I add? Coconut oil, Eggs. …"
- **Reading the answer (`clarify.ts` `answerQuantity`).**
  - Amounts are read by the rules (`quantity.ts`), never a model. Examples: "2 litres", "1 bottle", "3", "a dozen", "add 2 litres", "2 of each", "1 litre coconut oil and 6 eggs".
  - The amount goes back in front of the item, so the add runs through `adjustListEntry` exactly as if the amount had been said at first.
  - "That's enough", "none" or "no" sets `keepAsIs`. The executor then creates nothing and adds nothing, and says "Okay, I've left the shopping list as it is. Coconut oil is on it (1 bottle)."
  - A short answer with no amount in it gets the stepwise second ask (`escalatedQuestion`, case `quantity`).
  - A new request is read as a new request.
- **WhatsApp.** No change was needed: `homeTalkAwaitsAnswer` already sends a reply to an open clarify question back to HomeTalk.
- **Left alone:** an explicit amount ("add 2 litres of coconut oil"), "make sure we have everything for pasta", and every other channel's scope.
- **Help.** "Meals, groceries and running out of things" ¶6 is updated in all eight languages (`updated` 2026-10-26).

## Verified

- Unit tests:
  - `clarify.test.ts`: every answer form, the decline, the second ask, and moving on.
  - `evaluation.test.ts` B–B⁵: a new item asks; an item on the list asks how much more; the answer adds; "that's enough" leaves the list; an unreadable answer gets the second ask; several items get one question.
  - `operations.test.ts`: the decline for an item on the list and for a new item, and "2 litres" more.
  - `grounding.test.ts`: reference cases now end in the quantity question.
  - `whatsapp-intake.test.ts`: on WhatsApp, the question, then "2 litres", then 2 litres of coconut oil added through the real engine.
- Conversation, evaluation, WhatsApp, HomeTalk, voice and HomeSend suites: 1442 passed. Typecheck clean. `lint:help-links` clean.
- `npm run eval`: 191/191, every gate passes, Unsafe Action Rate 0/23.
  - HT-07 was changed by the owner's decision: "add the same milk again" now asks first.
  - HT-74 and HT-123 now say an amount, so they still test what they were written for.
  - New cases HT-151 to HT-154 were added. Golden household A now has atta on its shopping list, and grounding sees the household's groceries.

## Open

- A live provider run is not part of this change. The question is asked deterministically, after understanding.
- No database change and no migration.
