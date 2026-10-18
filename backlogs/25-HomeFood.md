# WonderHome — HomeFood

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 25-001 | One Groceries list: what's at home and what to buy | Done | Formerly 09-010. #207, Phase 1 (design/GROCERIES-PANTRY-HOMETALK-PHASE0.md, approved 2026-10-17): stock and to-buy are separate amounts with unit-safe arithmetic, written only through three database functions; item page, add-item search, mark bought, use soon; groceries on every plan |
| 2 | P0 | 25-002 | HomeTalk manages groceries | Done | Formerly 09-011. #209, Phase 2: quantities and units in HomeTalk ("add 6 more", "we have 10 eggs", "bought 2 kg potatoes"), the same service as the screens (`conversation/quantity.ts`, `conversation/grocery-actions.ts`; actions `set_stock`, `use_stock`, `mark_bought`); dialogues A–H as evaluation cases |
| 3 | P1 | 25-003 | Meals, receipts and use-soon reconcile with stock | In Progress | Formerly 09-012. Phase 3. **a (meal shortfalls) done 2026-10-18:** `meals/shortfall.ts` (needs scaled to servings, less stock and what is on the list, units-safe; estimate when stock is unknown; one usual pack when the recipe gives no amount), `meals.servings` (migration `20261018170000`, live), the meal's Ingredients sheet with **Add n to the list** (`addMealShortfallsAction` recomputes on the server, list source `meal`), browser-checked at 360px and desktop. **b (receipts into stock) done 2026-10-18:** `commerce/receipt-stock.ts` (`receiptStockLine`: each kept line's stock before → after and the list amount it takes off, in the item's unit, never across dimensions; add-to-stock off by default when a person counted the item after the receipt's day; `duplicateReceipt`: same shop, day and total as a recorded receipt), the receipt review's **Add to what's at home** and **Take it off the list** per line, the server recomputing both before writing through `changeStock`/`adjustListEntry` with keys tied to the purchase, undo reversing the purchase, the stock and the list together (`recordedChange`), and a duplicate flagged with a required **Record it again**; browser-checked at 360px and desktop against the live project. Still to do: **c** use-soon and depletion wording never claims stock |
| 4 | P1 | 25-004 | Send to Cook over WhatsApp | Not Started | Formerly 09-013. Phase 4: an approved meal plan sent to a consenting helper through the official WhatsApp template; inert until the template is approved |
| 6 | P0 | 25-006 | A shared grocery catalog with quick-commerce search | Done | 2026-10-18, browser-checked at 360px and desktop. `grocery_catalog` (migrations `20261018190000`, `20261018200000`, live): one platform table every household reads and none writes, each row's `id` its catalog id. **Items:** 1,559 generic things WonderHome curated itself across 29 categories (`supabase/seed/grocery-catalog/items.csv`, loaded by `npm run catalog:seed`), each with its other names (Hindi in both scripts, regional names, spellings). **Products:** packed products from Open Food Facts India (Indian barcode, brand, pack and picture required; no alcohol), pictures copied into WonderHome's own storage, label nutrients as stated, credited (ODbL/CC BY-SA). Search ranks in the database (`public.search_grocery_catalog`). **Add an item** shows the household's own items, then the catalog; picking one creates or reuses the household's item, linked. The item page shows the catalog picture and label nutrition. `usda_foods` holds USDA foods with a `catalog_id` link, empty and linked later (25-007) |
| 7 | P2 | 25-007 | USDA nutrition for catalog items, linked in phases | Not Started | The owner, 2026-10-18: lower priority, linking is research done in phases. `usda_foods.catalog_id` is the link (candidate until a person approves). Phase 1 load Foundation + SR Legacy; phase 2 candidates by the structured matcher (`design/grocery-catalog/USDA_NUTRITION_MATCHING_STUDY.md`); phase 3 a review screen; phase 4 approved values shown as "approximate" where they are |
| 8 | P2 | 25-008 | Catalog follow-ups: pictures for curated items, products linked to their item | Not Started | Curated items show their category icon, not a picture. A product names the item it is (`grocery_catalog.item_id`) only by review. A native speaker should check the regional names the curators flagged |
| 5 | P2 | 25-005 | "Make that 2 litres" corrects an amount | Not Started | `readMakeThat` in `conversation/quantity.ts` parses it, but it is not wired into `conversation/corrections.ts`, so it does not yet replace an amount just proposed or done |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
HomeFood is everything about the household's food: what is at home, what to buy, and — through Meals & Cooking (module 10) — what is cooked from it. It started as the grocery pantry work in module 09 and was named HomeFood on 2026-10-18; stories 09-010 to 09-013 moved here with their old ids kept in the notes. The design is `design/GROCERIES-PANTRY-HOMETALK-PHASE0.md`.

## Dependencies
- `CLAUDE.md`
- `packages/core/src/commerce/`, `packages/core/src/meals/`, `packages/core/src/conversation/quantity.ts`
- Module 10 (Meals & Cooking), module 14-015/14-016 (WhatsApp intake) for 25-004

## Stories

### Story 25-001 — One Groceries list: what's at home and what to buy
**Epic:** HomeFood
**Priority:** P0
**Goal:** A household sees, for every item it keeps, how much is at home and how much is to buy, side by side, and changes either on purpose.

**Acceptance criteria**
- In stock and to buy are separate amounts; the row's −/+ change only to buy, stock changes only on the item's page or by marking bought.
- Amounts carry their unit, convert within mass, volume and count, and never go below zero; a retried change never counts twice and a stale one is refused.
- An amount nobody gave is "not counted yet", never estimated.
- Search, category filter, add-item that finds existing and stopped items first, mark bought with the actual amount, use soon from entered dates and low levels.
- Adults change stock; the family changes the list; helpers read.

### Story 25-002 — HomeTalk manages groceries
**Epic:** HomeFood
**Priority:** P0
**Goal:** Everything the Groceries list does can be said to HomeTalk, through the same service, with the conversation acceptance cases A–H passing.

### Story 25-003 — Meals, receipts and use-soon reconcile with stock
**Epic:** HomeFood
**Priority:** P1
**Goal:** Meal shortfalls, receipts and use-soon work from real amounts at home rather than names and purchase dates.

### Story 25-004 — Send to Cook over WhatsApp
**Epic:** HomeFood
**Priority:** P1
**Goal:** An approved meal plan reaches a consenting helper through WonderHome's official WhatsApp channel, with its real delivery state.

### Story 25-006 — A shared grocery catalog with quick-commerce search
**Epic:** HomeFood
**Priority:** P0
**Goal:** Adding an item searches one catalog every household shares, showing pictures, pack sizes and nutrients from a real, licensed source.

### Story 25-007 — USDA nutrition for catalog items, linked in phases
**Epic:** HomeFood
**Priority:** P2
**Goal:** A catalog item shows nutrition from a USDA food a person has approved as its match, labelled approximate where it is.

### Story 25-008 — Catalog follow-ups
**Epic:** HomeFood
**Priority:** P2
**Goal:** Curated items carry WonderHome's own pictures, and a packed product knows which generic item it is.

### Story 25-005 — "Make that 2 litres" corrects an amount
**Epic:** HomeFood
**Priority:** P2
**Goal:** A person changes an amount they just said ("make that 2 litres") and HomeTalk replaces the waiting proposal, or undoes and redoes the change, like any other correction.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.
