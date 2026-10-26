# An amount in another unit is converted or asked about, never refused raw (25-038)

2026-10-26 · HomeFood · PR #PR

## What happened

At 9:03 PM IST the owner sent on WhatsApp: "add 1 litre coconut oil to the
list". WonderHome replied: "I tried, and it did not go through: Coconut oil is
kept in bottle, so 1 l does not fit it." Their reaction: "what is this???".

Their Coconut oil is counted in bottles. `conversation/grocery-actions.ts`
`amountFor` threw that sentence when the amount said (litres) did not convert
to the item's unit (bottles), and HomeTalk put it after "I tried, and it did not
go through".

## What changed

- **One rule, `commerce/pack-amount.ts` (`readAcrossUnits`).**
  - **The pack size is known** (the catalog's pack): the amount becomes whole
    packs, within 5%. HomeTalk adds them and says both units: "Added
    **Coconut oil** (+1 bottle, 1 L, now 2 bottles)". For an item kept in
    litres, "2 bottles" is twice its pack.
  - **Otherwise** (no known size, or not a whole number of packs, e.g. 500 ml
    of 1 L bottles): one question through the quantity clarify, "Coconut oil
    is kept in bottles. How many bottles should I add for 1 litre? For example
    "1 bottle", "2 bottles", or "count it in litres instead"." The clarify's
    parameters carry `choices: ["1 bottle", "2 bottles", "Count it in litres
    instead"]`. The tap-to-pick work (session_016mJcS359LyVr9JyYrSBKZm) had
    not landed, so for now the choices are listed in the question text as well.
  - **"Count it in litres instead"** (`clarify.ts` `answerQuantity` →
    `switchUnit`): `addToShoppingList` changes the item's unit through
    `commerce/unit-change.ts` `changeItemUnit`, the same change the Groceries
    screen makes, then adds the amount.
- **No raw refusals.** Grounding (`grounding.ts`) asks before anything is
  written. A write that still meets a unit refusal (add, remove, stock change
  or bought, including the database's "unit does not match this item") gets
  proper wording from `inItsUnit`: "Coconut oil is counted in bottles, so I
  have left it as it was. Tell me the amount in bottles, or change how it is
  counted on the Groceries screen." Such refusals carry `details.sayAsIs`.
  `executor.ts` `failedReply` is now the one place that writes "I tried, and
  it did not go through". It says these refusals as they are. All three call
  sites in `hometalk-turn.ts` use it.
- **Same words everywhere.** WhatsApp gets its reply from the same HomeTalk
  turn as the app. Both are put into the member's language by the same
  `localizeReply`.
- **Help:** the Meals and shopping section gains one sentence, in all eight
  languages.

## Verified

- `conversation/grocery-units.test.ts`, 13 tests, each with its expected result
  written first:
  - 1 L of 1 L bottles is +1 bottle, and the reply says both units;
  - bottles of unknown size are asked about, with choices;
  - "Count it in litres instead" changes the unit, then adds 1000 ml;
  - 500 ml of 1 L bottles is asked about;
  - "2 bottles" is added straight;
  - no reply contains "does not fit", "1 l" or "I tried".
- A new WhatsApp case in `whatsapp-intake.test.ts`: the question goes out on
  WhatsApp with its choices, and "count it in litres instead" is executed with
  `switchUnit`.
- Eval HT-160 (household D now keeps Coconut oil in bottles): `npm run eval --
  --cases HT-160` passes.
- Core suites for conversation, whatsapp, commerce, homebrain, evaluation,
  hometalk, help and i18n all pass. Typecheck across workspaces, web ESLint,
  `lint:boundaries` and `lint:help-links` are clean.

## The owner's own item

Their Coconut oil (`3ba001a0-…`) is counted in bottles. It is linked to the
catalog entry "Coconut hair oil", whose pack is 200 ml. Because of that link,
"1 litre" now reads as **5 bottles**. Their data was not changed. To count in
litres, they can change the unit on the Groceries screen, or answer "count it
in litres instead" if HomeTalk asks.

## Open

- `picksSwitch` reads only the English "count it in litres instead". A reply
  in another language to the translated question falls back to the
  how-many-bottles reading.
- Once the tap-to-pick choices land, render `parameters.choices` as buttons.
