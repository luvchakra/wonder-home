# WonderHome — HomeFood

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 25-001 | One Groceries list: what's at home and what to buy | Done | Formerly 09-010. #207, Phase 1 (design/GROCERIES-PANTRY-HOMETALK-PHASE0.md, approved 2026-10-17): stock and to-buy are separate amounts with unit-safe arithmetic, written only through three database functions; item page, add-item search, mark bought, use soon; groceries on every plan |
| 2 | P0 | 25-002 | HomeTalk manages groceries | Done | Formerly 09-011. #209, Phase 2: quantities and units in HomeTalk ("add 6 more", "we have 10 eggs", "bought 2 kg potatoes"), the same service as the screens (`conversation/quantity.ts`, `conversation/grocery-actions.ts`; actions `set_stock`, `use_stock`, `mark_bought`); dialogues A–H as evaluation cases |
| 3 | P1 | 25-003 | Meals, receipts and use-soon reconcile with stock | Not Started | Formerly 09-012. Phase 3: meal shortfalls by servings and units, receipts add to stock and close list entries, depletion wording never claims stock |
| 4 | P1 | 25-004 | Send to Cook over WhatsApp | Not Started | Formerly 09-013. Phase 4: an approved meal plan sent to a consenting helper through the official WhatsApp template; inert until the template is approved |
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

### Story 25-005 — "Make that 2 litres" corrects an amount
**Epic:** HomeFood
**Priority:** P2
**Goal:** A person changes an amount they just said ("make that 2 litres") and HomeTalk replaces the waiting proposal, or undoes and redoes the change, like any other correction.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.
