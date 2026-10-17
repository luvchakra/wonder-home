# Groceries, Pantry, Shopping & HomeTalk — Phase 0 design

**Status:** Approved by the owner on 2026-10-17, as written, including decisions D1–D6. Phase 1 (the unified Groceries list) is built: story 09-010, `docs/progress/2026-10-17-groceries-phase-1.md`. Phases 2–4 are stories 09-011 to 09-013.
**Implements:** *WonderHome — Groceries, Pantry, Shopping & HomeTalk Integration* (the "spec" below, §1–§14), together with the ten-screen mockup.
**Date:** 2026-10-17

Phase 0 is the spec's §14 deliverable list:
- a map of what exists;
- a gap matrix;
- the UX;
- the data model;
- HomeTalk contracts;
- integration and security;
- the plan.

Section 8 lists the decisions that only the owner can make.

---

## 1. Current state: what the repository actually does

The most important finding is that **WonderHome deliberately keeps no pantry today.** `consumables_and_commerce.sql` says so in its header ("does not keep a pantry inventory"), and so does `commerce/consumables.ts`. An item has a *consumption rate* and the evidence for it. Its "runs out on" date is estimated from the last purchase. The spec reverses that decision: it asks for on-hand stock. That reversal is the first approval this document asks for (§8, D1).

### 1.1 Data (supabase/migrations)

| Table | What it holds | Notes |
|---|---|---|
| `consumables` (`20260917143614`) | The household's tracked item: name, category (free text since `20260921100000`), pet link, `unit` (free text, 1–20 chars, default `'unit'`), `typical_quantity`, `days_per_unit` + `evidence_basis` (must be set together), `last_purchased_on/quantity`, `active` | Retired with `active=false`. Name is unique per (household, category) while active (`20260922170000`). **No stock, no image, no aliases, no expiry.** |
| `consumable_purchases` | One purchase: date, quantity, `unit_cost_minor`, currency, merchant | **No unit column.** The only writer is the HomeSend receipt review. |
| `cart_suggestions` | The intended shopping list: quantity, reason, evidence, needed_by, status suggested/accepted/deferred/removed/ordered | Unique per (household, consumable, status). **Nothing writes it**: `refreshSuggestions` and `meals.bridgeToShopping` are never called. So the Groceries "List" tab is always empty and the `grocerySubject` reminder never fires. |
| `recipe_ingredients`, `meal_ingredient_needs` (`20260917163112`) | Ingredient name, quantity, unit (free text), essential, consumable link; a per-meal copy with status needed/have/shopping/substituted/missing | The recipe form collects names only, so every ingredient is saved as `1 unit`. Quantities are not scaled by servings. |
| `merchant_offers`, `orders`, `order_items`, `purchase_policies` | Commerce/ordering scaffolding (fixture connector only) | Out of scope: the spec forbids a marketplace. |
| `home_send_items` (`receipt` kind), `homesend_changes` (`purchase` domain) | Receipt intake and its undo record | Reused as-is. |
| `whatsapp_identities`, `whatsapp_link_requests`, `notification_preferences.target` | WhatsApp linking (CONNECT code, hashed, 15 min) and the delivery target | `wh.assert_whatsapp_member_is_adult`: a **helper cannot link a number**. |

RLS: any member can read and write `consumables`, `consumable_purchases` and `cart_suggestions`. There are no SQL/RLS tests for the commerce tables.

### 1.2 Domain code

- `packages/core/src/commerce/consumables.ts`:
  - `inferRate` (needs ≥3 purchases), `expectedDepletion`, `REORDER_LEAD_DAYS`, `suggestPurchase`, `assessConsumable`, `mayCreateShoppingAction`, `describeBasis`.
  - Today, "low" means "time since purchase", which the spec forbids as a depletion claim (§2, §6).
- `commerce/repository.ts`:
  - item functions: `listConsumables`, `createConsumable`, `updateConsumable`, `retireConsumable`;
  - purchase functions: `recordPurchase`/`removePurchase`, which refresh the history;
  - `shoppingAgenda`;
  - unused: `refreshSuggestions` and `prepareOrder`, which only prices a basket and never buys.
- `commerce/receipts.ts`: `itemWords`, `matchConsumable` (exact name, or the same head noun; ambiguous gives none), `historyFrom`, `currencyCode`, `unitCostMinor`.
- **Units: there is no conversion code anywhere.**
  - The forms suggest `piece, kg, g, litre, ml, pack, bottle, box, dozen` (`_components/commerce-forms.tsx`).
  - Defaults disagree: the DB and HomeSend use `unit`; HomeTalk, the agents and partner keys use `item`.
- `meals/repository.ts`: `attachIngredients`, `listRecipeChoices` (existence check), `suggestMeal`, `ingredientNames` (**names only**), and `bridgeToShopping`, which is unused.
- `ai/predictions.ts` `predictStockOuts`: shown on Today and based on the rate.

### 1.3 HomeTalk today

- **Intents** (`conversation/intent.ts`): `add_to_list`, `remove_from_list`, `order_items` (never executable) and `plan_meal`. Parameters are `item`/`items`/`ingredientsOf`. **No quantity or unit exists anywhere.**
- **Rules** (`conversation/rules.ts`): `item()` strips only a leading article/"more". The rules give these results:
  - "add 6 eggs" becomes the item `"6 eggs"`.
  - "add 6 more" becomes the item **`"6 more"`**.
  - "We have 10 eggs" becomes a `set_preference`.
  - "I have 10 eggs" probably becomes **`log_health_issue`**. I read this from the regex and did not run it; I'll check it in Phase 2.
- **Executor** (`conversation/executor.ts`):
  - `addToGroceries` creates a *tracked item* (`unit:"item", typicalQuantity:1`) and de-duplicates through `context/matching.ts`. An item already tracked gives "Nothing to change".
  - `removeFromGroceries` *retires* the item.
  - So "the list" in HomeTalk is really "what WonderHome tracks", a different thing from the Groceries List tab.
- **Corrections** (`conversation/corrections.ts`): "not milk, almond milk" replaces an item, or undoes and redoes it. There is no quantity correction ("make that 2 litres").
- **Ingredients:** "make sure we have everything" (`grounding.ts` 311–340) adds every ingredient *name*. The reply says outright that it cannot see the kitchen.
- **HomeBrain facts** (`context/builders.ts` 468–511): one fact per consumable, made of the rate plus the last purchase. Purchase rows and list rows are not included.
- **Voice:** the Gemini tool `add_grocery_item{item, quantity}` (`voicelink/gemini-live.ts`) folds the quantity into the item string, and `voicelink/capabilities.ts` places it.
- **Evaluation:**
  - `evaluation/cases.ts` HT-07, HT-19 and the HomeSend grocery cases;
  - `conversation/evaluation.test.ts` §21: atta, the same milk, bananas, almond milk, pasta ingredients.
  - Nothing covers quantities.

### 1.4 UI

- `apps/web/app/groceries/page.tsx` is the only grocery screen. It has three tabs:
  - **Overview:** up to 6 suggestion tiles plus insights.
  - **List:** rows from `cart_suggestions`, read-only and always empty, plus "Tracks": 20 items with "Runs out {date}" and an expandable detail with edit/stop tracking.
  - **Orders:** read-only.
- It has **no search, filter, image, stepper, stock or mark-bought control.**
- It is **gated on `commerce.orders`**, which only Pro and Max have, so a Free household sees "not part of this plan".
- The forms (`_components/commerce-forms.tsx`) use `ComboboxField` with "Add new…" for name, category and unit; the usual amount is a number input. The labels are in `_lib/grocery-form-labels.ts`.
- The HomeSend receipt review (`_components/home-send-receipt.tsx`, `routeReceipt` in `(auth)/home-send-actions.ts` 285–402):
  - line-by-line match / new / skip, editable;
  - writes purchases, and undo removes them;
  - **drops the line's unit** and never touches a list or stock.
- Meals (`apps/web/app/meals/page.tsx`): a 7-day plan, and the card's "Ingredients" button links to `/groceries?tab=list`. The recipe `method` is stored but never shown.
- Househelper (`apps/web/app/househelper/page.tsx`): has no messaging. **Nothing implements "send cooking instructions".**
- WhatsApp out (`notifications/whatsapp.ts`):
  - one approved template with (title, body) for notifications to *members*;
  - free text only inside the 24-hour window a person opened;
  - delivery statuses recorded (`whatsapp-webhook.ts`), and STOP honoured.

---

## 2. Gap matrix

Labels: **R** = reuse as-is, **E** = extend, **N** = new, **D** = defer or out of scope.

| Spec | Requirement | Verdict | Where |
|---|---|---|---|
| §3.1 | One unified list: status bar, image, name+category, IN STOCK amount+unit, TO BUY stepper, chevron | **E** | Rewrite `groceries/page.tsx` around the new kit `GroceryRow` (§3.1 below) |
| §3.1 | Search, category filter, one add action | **N** (UI), **R** (`ComboboxField` / `ChoiceChips`) | Search runs server-side over the household's own items |
| §3.1 | Stepper changes to-buy only; stock is edited explicitly | **N** | `shopping_list_entries` + `inventory_balances` (§4) |
| §3.1 | Unit-aware steps, decimals, conversion | **N** | `commerce/units.ts` |
| §3.1 | Food image | **N** | Household photo (same upload path as pet and member photos) or an illustrated category tile. See D2 |
| §3 #3 | Item detail: stock edit, expiry, storage, related recipes, purchases, add to list | **E** | Today's expandable detail becomes `/groceries/[itemId]` |
| §3 #4 | Add item: search existing before creating, near-duplicate prevention | **E** | `context/matching.ts` `matchIncoming` (already used by HomeTalk) |
| §3 #5 | Shopping list view: to-buy / bought / history; mark bought with actual quantity | **N** | Focused view `?view=list` of the same rows |
| §3 #6 | Week plan → shortfalls only | **E** | Rewrite `bridgeToShopping` as `mealShortfalls` (quantities, servings, units, stock) |
| §3 #7 | Use soon (expiry, low stock) | **N** | Expiry evidence on purchases and balances (§4) |
| §3 #8 | Receipt import → review → inventory | **E** | `routeReceipt` gains unit, stock and list reconciliation; existing HomeSend pipeline |
| §3 #8 | Retailer logos ("Supported stores") | **D** | Marketplace and branding: not shown (see §3.8) |
| §3 #9 | Send to Cook over official WhatsApp | **N**, inert until set up | New template plus helper consent; reuses `notifications/whatsapp.ts`. See D4 |
| §3 #10 | Shopping summary | **N** (thin) | Counts from the same rows; no checkout |
| §3 #1 | Home dashboard groceries/meals/cook cards | **E** | `_screens/home-dashboard.tsx` domain tiles |
| §3.2 | Groceries top-level, Pantry a view | **R/E** | Groceries stays a *domain* (sidebar plus More, CLAUDE.md rule 6). Pantry becomes `?view=pantry`. The mockup's tab bar, which swaps the assistant for Groceries, is not followed |
| §4 | Item: aliases, image, preferred unit, default step | **E** | Columns on `consumables` |
| §4 | Inventory balance with confidence and version | **N** | `inventory_balances` + `inventory_events` |
| §4 | List entry with state, source, idempotency | **N** | `shopping_list_entries` |
| §4 | Purchase record with unit and review status | **E** | `consumable_purchases` + unit, `home_send_item_id`, best-before |
| §4 | Suggestion with evidence and status | **E** | `cart_suggestions` keeps the *suggestion* role it was designed for |
| §4 | Conversation action audit | **R** | `conversation_actions` + `ai_corrections` + `homesend_changes` |
| §5.1 | HomeTalk: read stock, list, purchases, meals, expiry | **E** | HomeBrain grocery facts gain balance, list and expiry |
| §5.1 | Add / increase / decrease / remove / mark bought, with quantity+unit | **E** | `add_to_list`/`remove_from_list` gain `quantity`/`unit`/`mode`; new `mark_bought` |
| §5.1 | Record consumption and restocking | **N** | New `set_stock` / `use_stock` actions |
| §5.1 | Meal shortages | **E** | `ingredientsOf` grounding calls `mealShortfalls` |
| §5.1 | Explain why | **E** | `homebrain/why.ts` from suggestion evidence |
| §5.1 | "add six more", "make that two litres", "not those, brown eggs" | **E** | `references.ts`, `corrections.ts` + `conversation/quantity.ts` |
| §5.1 | Voice parity | **E** | Gemini `add_grocery_item` sends quantity+unit as words; `capabilities.ts` places the new actions |
| §6 | Evidence-based, never "purchase age = depletion" | **E** | Re-word `assessConsumable` and `predictStockOuts` as *inferred*; observed vs inferred vs unknown |
| §6 | Add / not now / we have it / stop suggesting | **N** | Suggestion statuses + `stop_suggesting` flag on the item |
| §7 | Receipt → reviewable change set → idempotent reconciliation | **E** | HomeSend plan / receipt review |
| §8 | Servings-scaled ingredient quantities | **E** | Recipe form collects quantity+unit; scale by `meals.servings` (new, defaults to `recipes.serves`) |
| §9 | Shared WhatsApp gateway, consent, templates, statuses | **E** | `notifications/whatsapp.ts` + `whatsapp/linking.ts` |
| §11 | RLS, idempotency, concurrency | **N** | `version` column + `If-Match`-style check in services; RLS tests |
| §12 | Tests A–H, property tests, E2E 10 views | **N** | §7 |
| — | `order_items`, `merchant_offers`, `prepareOrder`, Orders tab | **D** | Left untouched. The Orders tab is hidden until a shop is real |

---

## 3. UX design (mapped to the ten mockup screens)

General deviations from the mockup:
1. **Brand colour, not green.** Committing actions use Primary indigo (CLAUDE.md rule 3). Green is reserved for "handled". The mockup's green buttons become `Button` (primary).
2. **No retailer logos or "supported stores".** That is marketplace framing, and it shows marks we have no agreement for.
3. **Photos are the household's own, or an illustrated category tile.** No stock photography and no image-search API (rule 8, D2).
4. **The tab bar stays** Home · Today · **AI** · Family · More. Groceries is reached from the desktop sidebar, More, and the Home tile.
5. **Dates only from evidence.** "Use by 27 Sep" appears only when a printed date or a person entered it. An estimate says "estimated" (spec §6).

### 3.1 Groceries (screen 2): the primary list

Route: `/groceries`. Its views are a `SegmentedControl` (*All · To buy · Use soon*) plus a category `ChoiceChips` row, a search field and one "Add item" button. History and the summary are linked from the To buy view.

**The row** is a new kit component, `GroceryRow`, in `@wonderhome/core/ui`:

```
┃ [img] Tomatoes          IN STOCK   TO BUY            ›
┃       Vegetables         1.5 kg   [−  500 g  +]
```

- **Status bar.** The left `┃` is a 4px bar: red = none or below the item's low level, amber = low or unconfirmed, green = enough. An `sr-only` word carries the same meaning ("Low", "Unknown", "Enough"), and so does the tooltip.
  - **Unknown stock is its own state:** a grey bar, and the IN STOCK cell reads "—" with an "Unknown" label. Stock is never guessed (spec §2).
- **IN STOCK** is read-only on the row. Tapping it opens the detail at the stock editor.
- **The stepper** `[− 500 g +]` changes only the to-buy amount, by the item's step. Tapping the centre opens a small sheet to type any value and pick a compatible unit.
  - `−` at the last step removes the entry and shows the undo toast "Removed from list · Undo".
  - The buttons are 44×44 with `aria-label`s ("Buy less tomatoes", "Buy more tomatoes"). Changes are announced through an `aria-live` region ("Tomatoes: 1 kg to buy").
- **Name** wraps and is never truncated (rule 11). The category sits on the line under it.
- **Layout by width:**
  - At 360px the row wraps the stock and stepper onto a second line under the name.
  - From `sm`, it is one line.
  - On desktop it is a wide list with column headers, not a card grid.
- **Writes.** The stepper debounces about 400ms, then calls `adjustListEntryAction` with an idempotency key. The UI updates optimistically and rolls back with an error toast if the write fails.
- **States:** empty ("Nothing tracked yet", with Add item and "Send a receipt" via HomeSend), loading skeleton, error alert.
- **Plan gate.** Groceries is a core household feature, so it should not sit behind `commerce.orders`. See D3.

### 3.2 Item detail (screen 3)

Route: `/groceries/[itemId]`. It holds:
- a large photo or tile, the name, category, and a photo upload;
- **"In your stock" card:**
  - the amount, its confidence ("Confirmed by Kunal today" / "From a receipt, 12 Oct" / "Not confirmed");
  - a stepper, plus "Set exact amount", plus a primary **Update stock** button. Stock is written only on that button;
- **To buy:** the same stepper as the row;
- **Use by:** only when known, with its basis (printed / entered / estimated);
- **Details:** preferred unit and step, low level, storage (fridge / freezer / pantry, picked), aliases, a note;
- **Used in:** recipes linking to Meals;
- **Purchases:** the last 5 from `consumable_purchases`, each with receipt evidence;
- **Suggestion card,** when one is open: the reason and evidence, with **Add** / **Not now** / **We have it** / **Stop suggesting**;
- Edit and Stop tracking (rule 12).

### 3.3 Add item (screen 4)

A sheet, not a route, opened from the one "Add item" button:
- the search field first. It searches the household's items, including retired ones (shown as "Track again"), with tolerant matching;
- results are rows with **Add to list**;
- "Not here? Add *{typed}*" opens the custom form: category, preferred unit, optional first to-buy amount, optional current stock;
- near-duplicates are caught by `matchIncoming`: "You already track *Tomato* — use that?".

### 3.4 Shopping list (screen 5)

`/groceries?view=list`. It shows the same `shopping_list_entries` rows and the same steppers, grouped by category, with the count in the title.
- Each row has a "Bought" checkbox action, and there is a footer **Mark bought**. Either opens a sheet that confirms the *actual* amount per item, prefilled with the to-buy amount.
- Confirming:
  - records a purchase;
  - adds the bought amount to stock;
  - closes the entry, or leaves a partial remainder (spec §5.3 E).
- The tabs are *To buy (n) · Bought (n)*, where Bought means the last 14 days. History is linked.

### 3.5 Meals → list (screen 6)

This lives on the existing Meals plan, not a new screen. Each meal card's "Ingredients" opens a sheet listing **only the shortfalls**: needed (scaled to servings) minus stock minus what is already to buy, with an "estimate" label when stock is unknown. One button: **Add n to the list**.

### 3.6 Use soon (screen 7)

`/groceries?view=use-soon`. It has two groups, and they are never mixed:
- **Use first:** items whose expiry is known, with its basis.
- **Running low:** below the low level, with confirmed or estimated stock labelled as such.

It never suggests eating something past an estimated date (spec §6).

### 3.7 Shopping summary (screen 10)

This is the top of the To buy view, not a separate page. It has three `StatChips`: *to buy*, *in stock*, *needs review* (open suggestions plus HomeSend items waiting). Each opens its rows (rule 21).

### 3.8 Receipts (screen 8)

This reuses `/home-send` and the existing receipt review. Each line gains:
- **unit**;
- **"add to stock" (default on)**;
- **"clears list entry"** (prefilled when a to-buy entry matches).

The review shows before → after stock per line. "Connect email accounts" becomes the existing HomeSend forwarding address card. It does not become mailbox OAuth.

### 3.9 Send to cook (screen 9)

This is reached from a meal or the day on Meals, not from Groceries:
- a preview built from the approved meal plan: meals, servings, ready-by, prep notes, editable;
- the recipient, from helpers with a **verified, consented WhatsApp number**;
- **Send on WhatsApp**;
- the state shown afterwards is the provider's real one: queued → sent → delivered / read / failed;
- if the number isn't eligible, the reason is shown, and there is "Copy message" / show in-app instead.

---

## 4. Data model and migrations

Principle: extend `consumables` as the one item identity. Add stock and list as their own tables, so the two amounts can never overwrite each other (spec §3.1). Keep `cart_suggestions` for what it was designed for: suggestions.

### 4.1 Units (`packages/core/src/commerce/units.ts`, pure)

- Dimensions: `mass` (base g), `volume` (base ml), `count` (base pcs), and `other` (bunch, pack, box, bottle, packet, dozen, which is count×12).
- Known units with aliases: kg, g, l/litre/liter, ml, pcs/piece/item/unit, dozen, bunch, pack….
- `toBase`, `fromBase`, `convert(a, from, to)`. Conversion between dimensions is refused unless the item has a stated `grams_per_piece`, which is deferred.
- `add`/`subtract` clamp at 0 and use decimals (rule 22-style, not floats).
- `stepFor(unit)`: g→100, kg→0.5, ml→250, L→0.5, pcs→1, dozen→1.
- `formatQuantity(q, unit, locale)` picks the display unit (1500 g → "1.5 kg") and uses locale digits.
- Property tests cover round-trips, clamping and associativity.

### 4.2 Migration `…_grocery_inventory.sql`

**Changes to `consumables`:**
- `aliases text[] default '{}'`
- `image_path text` (private storage bucket, same pattern as member photos)
- `preferred_unit text` (normalised; backfilled from `unit`)
- `step numeric(10,3)`
- `low_level numeric(10,3)` (base units)
- `storage text check in ('fridge','freezer','pantry','other')`
- `note text`
- `suggestions_off boolean default false`

**Backfill:** `unit` values `'unit'` and `'item'` become `'pcs'`.

**New `inventory_balances`** (one row per item):
- household_id, consumable_id (unique)
- `quantity numeric(12,3) check >= 0`, `unit text` (base unit of the dimension)
- `confirmed_at`, `confirmed_by_member_id`
- `source` (stated / receipt / purchase / consumption / correction)
- `confidence` (confirmed / derived)
- `version int`, `updated_at`

**New `inventory_events`** (append-only history and undo):
- household_id, consumable_id
- `delta`, `unit`, `after_quantity`
- `kind` (set / purchase / use / correction / undo)
- `actor_member_id`
- `source_ref` (conversation_action_id / home_send_item_id / purchase_id)
- `created_at`
- No update or delete policy.

**New `shopping_list_entries`:**
- household_id, consumable_id
- `quantity numeric(12,3) check > 0`, `unit`
- `state` (to_buy / bought / removed)
- `source` (manual / hometalk / meal / suggestion / receipt)
- `meal_id null`, `suggestion_id null`
- `created_by_member_id`, `version`, timestamps, `bought_purchase_id`
- **Partial unique index (household_id, consumable_id) where state='to_buy'**. Adding the same item twice combines the amounts; it never makes a second row.

**`consumable_purchases`** gains:
- `unit text`, `home_send_item_id`, `shopping_entry_id`
- `best_before date`, `expiry_basis` (printed / entered / estimated)

**`cart_suggestions`** gains:
- `quantity_unit`, `dismissed_reason` (not_now / have_it / stop)
- `expires_at`
- the status values `dismissed`, `expired`

The meaning of a `cart_suggestions` row becomes "a proposal". Accepting one creates or increments a list entry.

**`meals`** gains `servings smallint null`, which falls back to `recipes.serves`.

**RLS:**
- Members read all of these tables.
- Adults and Admins write balances and list entries. Children may add to the list, which matches today's grocery add; stock writes are adults only.
- Helpers write per D5.
- `inventory_events` is insert-only and written by the server through a `security definer` function `wh.apply_inventory_change(...)`. That function does the version check and the clamp atomically.

**Rollback:** the new tables can be dropped without touching existing rows. The columns are additive and nullable. The unit backfill is recorded in a `_unit_backfill` table, so it can be reversed.

**Verification:** `npm run verify:live` checks are added for every new table and column, and RLS tests go in `scripts/test-grocery-rls.mjs`.

### 4.3 Services (`packages/core/src/commerce/inventory.ts`, `shopping-list.ts`)

These are the only writers. UI actions, HomeTalk executors, HomeSend and agents all call them.

| Service | Arguments | Notes |
|---|---|---|
| `adjustListEntry` | `{itemId, delta?, set?, unit, source, idempotencyKey, expectedVersion?}` | Converts units, combines, removes at 0, returns `{before, after}` |
| `markBought` | `{entries:[{entryId, quantity, unit}], purchasedOn, merchant?}` | Purchase + stock + entry close, in one transaction, idempotent |
| `setStock` / `useStock` | `{itemId, quantity, unit, source, idempotencyKey, expectedVersion?}` | `useStock` clamps at 0 and reports when it clamped |
| `mealShortfalls` | `{mealIds}` | `{item, needed, inStock, onList, shortfall, certainty}` |
| `undoInventoryEvent` / `undoListChange` | | Compensating events, never deletes |

**Concurrency:** writes carry `expectedVersion` when the screen had one. A stale write returns a `conflict`, and the UI shows the fresh amount.

---

## 5. HomeTalk design

### 5.1 Understanding

**New pure module `conversation/quantity.ts`:**
- `readQuantity("half a kilo of tomatoes") → {quantity: 0.5, unit: "kg", item: "tomatoes"}`
- It handles digits, number words (it reuses `WORD_COUNTS`) and "half / a dozen / a couple".
- "6 more" → `{quantity: 6, mode: "increment", item: null}`
- "make that 2 litres" → `{set: 2, unit: "L"}`

**Model schema** (`ai/model-client.ts`): add nullable `quantity`, `unit`, `quantityMode` (`increment` | `decrement` | `set`). These are named and nullable, with no ids, as HomeTalk 2.0 requires.

**Intents:**

| Action | Example | Kind / autonomy |
|---|---|---|
| `add_to_list` (extended) | "add 6 eggs", "add 6 more", "add milk" | draft; executes like today, with a receipt |
| `remove_from_list` (extended) | "remove 500 g of rice from the list", "remove the milk" | draft |
| `mark_bought` (new) | "bought 2 kg potatoes and 1 litre milk" | **confirm**: changes stock |
| `set_stock` (new) | "we have 10 eggs in the fridge" | **confirm**, unless the household set this outcome's autonomy to execute |
| `use_stock` (new) | "used 2 eggs" | confirm, with the same rule |
| `add_to_list` + `ingredientsOf` (extended) | "add only what we're missing" | draft; the shortfalls are listed in the preview |
| `send_to_cook` (new, Phase 4) | "send today's menu to Rita" | **always approval**; never by voice (`capabilities.ts`) |

**Fixes to existing rules:**
- The `have` branch of the preference rule and the health rule's "I have…" must not capture a quantity followed by a tracked item. "I have 10 eggs" becomes `set_stock`.
- `item()` no longer keeps a number or unit inside the name.

**Grounding** (`conversation/grounding.ts`):
- The item resolves against `consumables` (name + aliases) through `matchIncoming`.
- Two plausible items ("tomatoes" vs "cherry tomatoes") produce one question (case F).
- A missing item with a number ("add 6 more") resolves through `references.ts` to the focus item.
- A missing unit uses the item's preferred unit.
- With no item default, it asks "How much milk?" once (case B).

**Replies** use a structured confirmation in the message metadata, rendered as a compact card: `Eggs · +6 pcs · Shopping list now 12 pcs`, with a link to `/groceries/[id]`. They go through `REPLY_CLASSES` (`grocery` class) and `reply-language.ts` with the quantity as a token.

**Suggestions** use observed / inferred / unknown wording from one function, `describeStockEvidence`, so HomeTalk, the item detail and notifications say the same thing. For example: "Eggs were last recorded as bought 7 days ago. I don't have a confirmed count."

**HomeBrain facts:** each item's fact carries stock with its confidence, the to-buy amount, the last purchase and expiry with its basis. `homebrain/validate.ts` gains a stock-claim check: any "you have N" in an answer must match a fact.

### 5.2 Dialogues (become `conversation/evaluation.test.ts` cases)

| Case | Turns | State change |
|---|---|---|
| A | WH suggests eggs. User: "Yes, add 6." | list eggs +6 pcs (6 → 12 if 6 were already listed); stock untouched |
| A′ | "Okay, add 6 more to the list" | the same increment, through the focus |
| B | "Add milk to the list." → "How much milk?" (only if no default) → "One litre." | list milk +1 L |
| C | "Plan dinner for four tomorrow using what we have" → proposal with verified and estimated shortfalls → "Add only what we're missing." | per-item shortfall, combined with existing to-buy entries, linked to `meal_id` |
| D | "Actually we have 10 eggs in the fridge." | proposal: stock eggs = 10 pcs. On yes, set. Then: "Eggs are also on your list (6). Keep it?" |
| E | "Bought 2 kg potatoes and 1 litre milk." | proposal listing the matched entries. On yes: purchases, stock +, entries closed or partial; a remainder stays visible |
| F | "add tomatoes" → "Tomatoes or cherry tomatoes?" → "Regular tomatoes, half a kilo." | list tomatoes +500 g |
| G | "No, I meant remove 500 grams of rice from the shopping list." | correction: list rice −500 g; stock untouched; both kept on record |
| H | A child (or an adult without the permission) asks to send cooking instructions | declined with the reason, or routed to an Admin's approval; nothing sent |
| extra | "add 6 more" with no focus | "Six more of what?" |
| extra | "used 20 eggs" with 10 confirmed | asks; if confirmed, clamps to 0 and says so |
| extra | Model or tool failure | no "Done"; nothing written |

`npm run eval` gains golden cases HT-G1 to HT-G8 for A–H against golden households, plus a HomeSend receipt-with-units case.

---

## 6. Integration and security

- **One write path.** UI server actions, HomeTalk executors, HomeSend apply and agents (`list.add_item`) all call the §4.3 services. The `list.add_item` tool and partner `groceries.write` move to `adjustListEntry`, so they add *to buy* instead of creating a bare tracked item.
- **HomeSend:**
  - `routeReceipt` keeps the line unit and calls `markBought` with `home_send_item_id`, so it is idempotent per line.
  - It never overwrites stock a person confirmed later than the receipt date. That case is shown as a conflict line.
  - Duplicate receipt: the same merchant, date and total as an applied item is flagged before apply.
  - Order confirmations stay "receipt" only when they are marked paid. "Never assume all ordered items arrived" means each line defaults to *add to stock*, can be unticked, and the review says so.
- **Meals:**
  - `bridgeToShopping` is replaced by `mealShortfalls` + `adjustListEntry(source:'meal', meal_id)`.
  - The recipe form gains quantity + unit per ingredient.
  - `ingredientNames` callers move to the shortfall service.
- **Notifications:**
  - `grocerySubject` reads `shopping_list_entries` (to_buy) and open suggestions. That makes it real for the first time.
  - A new `use_soon` source exists only for printed or entered expiry.
  - All wording is `reminder.*` keys in 8 languages.
- **WhatsApp, Send to Cook (Phase 4):**
  - Linking: a helper links a number through the same CONNECT-code flow, as **outbound-only**. The adult-only rule stays for *intake*: a helper's messages are still not forwarded into HomeSend. The helper's reply STOP opts out.
  - Delivery: a new approved utility template `cooking_instructions` (variables: helper name, date, menu body). It is sent only when the template name is configured and the helper's consent row exists.
  - Eligibility: a 24-hour-window free-text message is used only when the helper wrote in within the window.
  - Status comes from the existing webhook.
  - Who may send: Admins and the meal's cook-responsibility owner (`may("meals.instruct")` + permission). Children never, and never by voice.
  - Content is built from approved meal rows only. The body passes the same `speakable`-style clean-up, and no health details are sent.
- **Untrusted input:**
  - Receipts, email and WhatsApp content are fenced (`homesend/injection.ts`).
  - Model output only proposes. Units, quantities and items are validated by the services (Zod + `units.ts`), and the household always comes from the session.
- **Observability:**
  - `grocery_events` (closed words): list_adjusted, stock_set, purchase_marked, suggestion_{accepted, dismissed}, conflict, clamp.
  - Plus the existing `homesend` metrics and the WhatsApp delivery events.
  - No item names in logs.

---

## 7. Plan, tests, flags, risks

Each phase is one PR. Each PR carries its migration (applied live, `verify:live`), help text in 8 languages, a progress note, a tracker update and a browser check at 360px and on desktop.

| Phase | Scope | Gate tests |
|---|---|---|
| **1 — Unified Groceries** | `units.ts`; migration §4.2; services §4.3; `GroceryRow`, search and filters; item detail; add sheet; shopping-list view with mark bought; image upload and tile fallback; Free-plan decision (D3) | units property tests; service unit tests (combine, clamp, idempotency, version conflict); RLS tests; E2E for list ↔ detail ↔ list view |
| **2 — HomeTalk** | `quantity.ts`; model schema; extended and new intents; grounding, references and corrections for quantity; structured confirmation; HomeBrain facts + validator; voice tool words; capabilities placement | A–H in `evaluation.test.ts` + `npm run eval` golden cases; "no hallucinated stock" validator tests; voice readiness gate |
| **3 — Meals + HomeSend + Use soon** | Servings, recipe quantities, `mealShortfalls`, meal sheet; receipt units/stock/list; duplicate receipts; Use soon view; notification sources | `plan.test.ts`-style golden receipts; shortfall tests (units, servings, existing to-buy) |
| **4 — Helpers + WhatsApp** | Helper outbound link + consent; template sender; Send to Cook preview; delivery state; permission (case H) | Webhook and status tests; permission tests; inert-without-config tests |
| **5 — Hardening** | E2E of the ten views at 360 / 412 / desktop; accessibility; concurrency (two members + HomeTalk); offline/error; perf | Full suite + nightly |

**Feature flags:** none new. Each phase ships complete and replaces the old view in place; there are no real households yet. Send to Cook is inert until `WHATSAPP_COOK_TEMPLATE_NAME` is set and the template is approved by Meta. That is a person's errand.

**Risks:**
1. Reversing the "no pantry" principle (D1). Stock goes stale silently. Mitigation: confidence plus `confirmed_at` on every display; "Unknown" is a first-class state; suggestions never assert depletion.
2. Unit ambiguity in receipts ("1 pc 500g pack"). Mitigation: keep the printed text, ask in the review, and allow no cross-dimension conversion without a stated weight.
3. Rule collisions in HomeTalk ("I have…" with health or preference). Mitigation: rule-order tests and the evaluation matrix.
4. WhatsApp template approval and helper consent are outside our control. Mitigation: an in-app copy/preview fallback and an honest state.
5. Scope. This is five PRs. Phases 1 and 2 deliver the spec's core outcome: the one list plus HomeTalk.

---

## 8. Decisions for the owner

| # | Decision | Recommendation |
|---|---|---|
| D1 | Reverse "WonderHome keeps no pantry inventory" and keep on-hand stock with confidence | **Yes**, as designed: stock shown with its source, "Unknown" when unconfirmed |
| D2 | Item images | **The household's own photo, else an illustrated category tile.** No image-search or stock-photo API, which adds cost, licence questions and off-brand imagery |
| D3 | Groceries is behind `commerce.orders` (Pro/Max only) | **Make the list, stock and HomeTalk groceries part of every plan** (new `groceries.core` on free). Keep orders and receipts-to-stock automation as the paid part. This is a pricing call |
| D4 | Send to Cook over WhatsApp | **Build it inert** (Phase 4). A person registers the `cooking_instructions` template with Meta |
| D5 | May helpers update stock or the list (e.g. a cook marking "used 2 kg rice")? | **Not in v1:** helpers read; adults write. Revisit with helper accounts |
| D6 | Stock changes from HomeTalk ("we have 10 eggs") | **Confirm first by default**; the household's autonomy setting can change it to execute |
