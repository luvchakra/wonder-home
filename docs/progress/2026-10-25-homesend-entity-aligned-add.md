# HomeSend: Add creates WonderHome's own record, aligned to the entity already there

Date: 2026-10-25 · PR #329

## Why

The owner wants Add in HomeSend to create the same WonderHome record a person adding it by hand would create, aligned to the existing entity structure.

Reading each `createNew` branch against the screen that owns the entity turned up four gaps:

| Kind | Before | The entity's own Add |
|---|---|---|
| Grocery (and each ticked need) | A new `consumables` row every time, unit "unit", no catalog link, nothing on To buy | Reuses an item already tracked; a counted unit; the catalog entry; the amount on To buy |
| Event | Always `kind: gathering`, no category; the place only in the notes, if anywhere | The calendar's kind and category; Where in `location` |
| Bill | Kind only | Bill type (`bill_type`) and how often it comes (`recurrence`), as the Bills picker sets them |
| Class outside school | The AI's exam/competition/event reading was never stored, so the review could not pre-select it | Pre-selected from the reading |

## What changed

- **`packages/core/src/homesend/record-types.ts`** holds the mapping from a reviewed item to each domain service's input. It is pure, and each piece is unit-tested.
  - `eventShape` picks the calendar kind and category from the words: birthday, special occasion, travel, appointment/health (a blood-test camp), school event, outing, or household gathering. Anything else is a family gathering.
  - `billShape` takes the bill type and its usual cadence from `bill-catalog.ts`. The kind the person picked still wins.
  - `groceryShape` sets a known unit (pcs when none was read) and an amount to buy of at least 1.
- **`home-send-writes.ts`**
  - `addGrocery` follows Groceries' own Add (`grocery-actions.ts`):
    - An item already tracked is put on To buy instead of being added twice.
    - A new item gets the catalog link when its name and unit match, then goes on To buy.
    - The list change carries a key (`hs:<intake>:list`).
  - Events and bills are written with their shapes, still through `addFamilyEvent` and `createObligation`.
  - `Created` now reports `changeType`/`previous` when a write changed an existing record.
- **Undo** (`home-send-actions.ts` `reverseChange`): a grocery that was already tracked is recorded as an "updated" change with its list key. Undo removes exactly that list addition and never retires the item. An item HomeSend created is still retired. The one-item confirm, the household-autonomy auto-add, the ticked needs and a document plan's grocery lines all record changes this way.
- **The place** (`ai/classify-intake.ts`):
  - The AI now fills a new `location` field: where a school item, class or event happens, as written. Notes no longer repeat it.
  - The location and the class kind are stored on the item (`HomeSendExtraction.location`, `activityKind`).
  - The event review shows a "Where (optional)" field (`homesend.field.where` in eight languages), saved to `family_events.location`.
- **Help:** `help.guide.home-send.body.4` was updated in eight languages to say what Add now saves.
- **Backlogs:** 25-035 (HomeFood) and 26-021 (HomeEvents) are added as Done, and `npm run tracker` was run.

## Verified

- `tsc` passes for core and web, and ESLint passes on the changed files.
- Vitest passes for `homesend/` (including the new `record-types.test.ts`), `ai/`, `whatsapp/`, `evaluation/`, `apps/web/app/(auth)` and `_components`.
- `npm run eval` passes 165/165, with 0 unsafe actions.
- `tracker --check` passes.
- No migration was needed:
  - `family_events.category` and `location` already exist, as do `obligations.bill_type` and `recurrence`.
  - `homesend_changes` already allows `updated` changes with a `previous` value.
- Not browser-checked: the only UI change is one standard `Field`.

## Open

- An event's Where is typed text. Picking the place from Google Maps (26-014's `EventPlaceField`) in the review is a follow-up.
- Items already in HomeSend keep their old reading: no location, no class kind.

## Cleanup

No test data was created.
