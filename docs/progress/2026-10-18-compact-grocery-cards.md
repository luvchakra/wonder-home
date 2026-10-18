# HomeFood: compact grocery cards, nutrition on each, items named in words counted like the catalog (25-012)

**Date:** 2026-10-18 · **Stories:** 25-012 (Done), 25-013 (queued)

## What the owner asked

- **Compact cards.** Make the Groceries cards more compact.
- **Nutrition.** Show nutrition for the items on the list.
- **Units.** Pasta showed "1 pc". It should be in grams, and the unit should be changeable.

## What was built

- **Compact rows** (`GroceryRow`, `packages/core/src/components/ui/grocery-row.tsx`).
  - On a phone: picture, name and chevron on one line, then *In stock* and the *To buy* stepper across the card's full width.
  - On a wider screen: everything on one line.
  - The picture is 40px, the stepper buttons are 36px, and the labels never wrap.
  - At 360px a row is about 105px, against 128px before.
- **Nutrition under the name.** Energy and protein per 100 g (or 100 ml) appear beside the category.
  - They come from the same source the item page credits: IFCT 2017 for a curated Indian food, or the label for a packed product (`cardNutrition` in `commerce/catalog.ts`).
  - Nothing is shown when neither source has a figure. Nothing is estimated.
- **Items named in words.** HomeTalk's "add pasta", an agent's add and a meal's shortfall all read the name against the catalog first (`pickCatalogItem` / `catalogItemFor`).
  - An exact name or alias links to that catalog item, with its picture, nutrition and pack.
  - A word that only its variants carry ("Pasta, penne", "Pasta, macaroni") takes how the everyday variants are counted, and the pack they share. No variant is ever picked for the household.
  - So "add pasta" is 500 g of Pasta under Rice & grains, not 1 pc.
  - An amount the person said still decides the unit.
  - With no amount, an existing catalog item is added at its usual pack (`amountFor`).

## Held back: changing pieces to grams (25-013)

The item page's unit picker already changes a unit that converts (g to kg). A unit that does not convert (pcs to g) is refused while anything is at home or on the list.

The full change was built and tested:
- a database function, `public.change_consumable_unit`, with a record table, `consumable_unit_changes`;
- stock goes back to "not counted" and is recorded;
- the list restarts at the usual buy;
- a "Counted in" picker in the amount sheet, with an own-unit option.

Its database tests passed 6/6. The live migration was cancelled twice at the approval prompt, and the owner chose to ship this PR without it. The work is kept for 25-013.

**Until then, for an item already in pieces (like the owner's Pasta):**
1. Take it off the list.
2. Change its unit on the item page.

## Verified

- **Unit tests.** `commerce/catalog-names.test.ts` (9 tests) covers:
  - "pasta" counted in grams, and the shared 500 g pack;
  - exact names and aliases linking to their item;
  - variants that disagree giving nothing;
  - the card's nutrition source.
- **Wider runs.** Commerce, conversation, AI and i18n tests pass (914), as do typecheck and lint.
- **Browser.** Checked at 360px and 1280px against the live project with a QA household. Items were added through HomeTalk ("Add pasta…", "Add 2 litres of milk…") and from the catalog (eggs, toor dal).
  - Rows were compact, with labels on one line.
  - Eggs showed 135 kcal · 13.3 g protein per 100 g.
  - Toor dal showed 331 kcal · 21.7 g protein per 100 g.
  - Pasta was made under Rice & grains, in grams.
  - There was no horizontal scroll and no page errors.
  - The pasta in that check started at 100 g because it was added before the pack rule. The rule itself is covered by the unit tests.

## Where the code lives

- `packages/core/src/components/ui/grocery-row.tsx`
- `packages/core/src/commerce/catalog.ts` (`pickCatalogItem`, `catalogItemFor`, `cardNutrition`)
- `packages/core/src/conversation/grocery-actions.ts`
- `packages/core/src/ai/executors.ts`
- `apps/web/app/(auth)/meal-actions.ts`
- `apps/web/app/groceries/page.tsx` and `_components/`
- Help: Meals, groceries and running out of things, paragraph 9, in all eight languages.

## QA cleanup

Recorded after the merge.
