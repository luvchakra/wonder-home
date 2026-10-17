# Groceries Phase 1: one list, with what's at home and what to buy

**Story:** 09-010 (new). **Design:** `design/GROCERIES-PANTRY-HOMETALK-PHASE0.md`. The owner approved it as written on 2026-10-17, including decisions D1–D6.

## What was done

Groceries is now one list. Each row shows how much is **in stock** and how much is **to buy**, side by side. The two never overwrite each other.

- **Data** (migration `20261017200000_grocery_inventory_and_list.sql`, applied live).
  - `consumables` stays the one identity of an item. Its `unit` is now normalised (`unit`/`item`/`piece` became `pcs`, `litre` became `l`, …). It gains a step, a low level, where it is kept, aliases, a note and a photo path.
  - New tables:
    - `inventory_balances`: the amount at home, in base units, with who confirmed it, when, its source and a version.
    - `inventory_events`: the history of those changes, append-only.
    - `shopping_list_entries`: what to buy. An item has at most one open entry, so adding again combines the amounts.
    - `shopping_list_events`: the history of list changes.
  - `consumable_purchases` gains a unit, the list entry it closed, and a best-before date.
  - Sessions can only read these tables. Three `SECURITY DEFINER` functions write them, each doing its arithmetic and checks in one statement:
    - `apply_inventory_change`, `adjust_shopping_entry` and `mark_bought`, plus `set_inventory_use_by`.
    - No amount goes below zero.
    - The idempotency key makes a retry a no-op.
    - A stale version comes back as a conflict, not a write.
    - A unit that doesn't match the item is refused.
  - Who may write (D5):
    - adults change stock;
    - adults and children change the list;
    - helpers read only.
  - Item photos go in the private `avatars` bucket under `<household>/groceries/`; adults write them.
  - Groceries is part of every plan through a new `groceries.core` feature (D3). Ordering stays `commerce.orders`.
- **Units** (`packages/core/src/commerce/units.ts`). Mass, volume and count convert (g/kg, ml/L, pcs/dozen). Any other word (a bunch, a pack, a household's own "sachet") is its own unit and converts to nothing. Amounts are rounded to three decimals and clamped at zero. It also holds each unit's default step and the reader-facing formatting ("1.5 kg", "6 pcs", "1,5 kg" in German).
- **Service** (`packages/core/src/commerce/inventory.ts`). Every change to either amount goes through one service:
  - functions: `listGroceries`, `getGroceryItem`, `adjustListEntry`, `changeStock`, `markBought`, `setUseBy`, `recentlyBought`, `stockHistory`, `listRetiredGroceries`, `restoreGrocery` and `setGroceryImage`;
  - HomeTalk, HomeSend and agents will call the same functions in later phases;
  - `refreshPurchaseHistory` converts each purchase into the item's own unit, so the consumption rate still works when old and new purchases are in different units.
- **Screens.**
  - `/groceries` has three views over the same rows: All, To buy and Use soon.
    - **All:** search, category chips, and a `GroceryRow` per item (new kit component).
    - **To buy:** grouped by category. "Mark as bought" asks for the actual amount of each item and the date. "Bought in the last two weeks" lists what was bought, and the summary chips sit at the top of this view.
    - **Use soon:** use-by dates someone entered, and items at or below their low level. The two are never mixed or estimated.
  - The to-buy stepper debounces taps into one delta write with its own key. When an item is not on the list, it shows a single `+ cart` button (asked for by the owner). Tapping the middle opens a sheet for typing any amount in a unit that converts.
  - **Add item:** searches active and stopped items first, offering "Track again" for stopped ones. The server refuses a near-duplicate unless the person says it really is different.
  - `/groceries/[id]` is the item's page:
    - photo, "In your stock" with who confirmed it, a draft stepper and **Update stock** (version-checked);
    - to buy, use-by date, details (category, unit, step, low level, kept in, also called, note);
    - what was bought before, changes to stock, and Stop tracking (with its history kept).
  - The old Overview/List/Orders screen was removed, along with `commerce-forms.tsx`, `commerce-actions.ts`, `grocery-form-labels.ts` and their unused catalog keys.
- **Words.** A new i18n area, `grocery`, in all eight languages. The client receives templates with their `{name}`/`{amount}` placeholders kept: the translator drops placeholders it isn't given, and this cost one browser round to find. Count words come resolved for every plural category the reader's language has.
- **Help.** "Meals, groceries and running out of things" was rewritten in eight languages, and Plans now lists groceries under Free. Both sections are dated 2026-10-17.

## Verified

- **Unit tests:** `units.test.ts` (12) and `inventory.test.ts` (11). The full suite passes: 217 files, 3,109 tests (core), plus web.
- **Database RLS tests:** `scripts/test-grocery-rls.mjs`, 11 tests:
  - adult, child and helper write rules;
  - clamping at zero, idempotent replay and stale versions;
  - one open entry per item;
  - a partial buy, use-by dates;
  - another household sees nothing, and every plan includes groceries.
- **Live project:** `npm run verify:live` 249/249, covering the new tables, columns, entitlement, and that the anonymous role cannot change stock.
- **Browser** at 360px and 1280px against the live project, signed in as a QA household:
  - added Tomatoes (kg, 0.5 to buy, 1.5 at home), Eggs (pcs, 6 to buy) and Milk (L, 1 at home);
  - stepped Eggs to 8 to buy, and add-item search found "Tomatoes" for "Tomato";
  - marked 6 eggs bought: the list kept 2 to buy and stock became 6;
  - set stock to 8 on the item's page; the history showed "Set to 8 pcs" and "6 pcs added";
  - the cart button adds 500 ml of milk, and removing it brings the cart back;
  - no horizontal overflow anywhere.
- **Other checks:** typecheck, ESLint, migration lint, the release checks and a production build. Their results are in the PR.

## Still open

- **Phase 2 (09-011), HomeTalk.** HomeTalk still adds by name only (`addToGroceries` creates an item with no amount). Quantities, "add 6 more", "we have 10 eggs" and "bought …", and dialogues A–H are the next PR.
- **Old depletion wording.** `shoppingAgenda` / `assessConsumable` still say "has probably run out" from purchase dates. That breaks the new rule that a purchase date is never read as depletion, and its rewording belongs to Phase 2/3.
- **Unused ordering code.** `cart_suggestions` and the suggestion/order code are untouched and still unused.
- **Phase 3 (09-012):** meal shortfalls, receipts adding to stock, and use-soon reminders.
- **Phase 4 (09-013): Send to Cook.** It needs the owner to register a `cooking_instructions` WhatsApp template with Meta.

## Clean-up

The QA account and household used for the browser check were deleted after the merge; see the PR thread for confirmation.
