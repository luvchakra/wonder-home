# WonderHome — Commerce, Groceries & Pet Supplies

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 09-001 | Consumable model | Done | a rate and its evidence, never an inventory somebody must keep accurate |
| 2 | P0 | 09-002 | Suggested cart | Done | every suggestion carries why, how much and by when |
| 3 | P0 | 09-003 | Commerce adapter | Done | commerce adapter on the shared connector contract; nothing live |
| 4 | P0 | 09-004 | Purchase approval | Done | one deterministic allow/approve/refuse used by both the API and the tool gate |
| 5 | P1 | 09-005 | Auto recurring orders | Done | idempotency keyed on the basket, so a retry cannot buy twice |
| 6 | P1 | 09-006 | Order tracking | Done | only a real transition moves an outcome, so a poll cannot duplicate a notification |
| 7 | P1 | 09-007 | Pet supply prediction | Done | pet supplies use the same depletion model, scoped to the animal |
| 8 | P2 | 09-008 | Merchant optimization | Done | cheapest that can actually deliver in time; stale prices are excluded |
| 9 | P1 | 09-009 | A receipt becomes purchase history | Done | Found by the test spec's live E2E-002 (23 Sep 2026): a paid receipt sent through HomeSend is now correctly not a bill, but nothing records the purchase — `consumable_purchases` is modelled and never written |
| 10 | P0 | 09-010 | One Groceries list: what's at home and what to buy | Done | Groceries Phase 1 (design/GROCERIES-PANTRY-HOMETALK-PHASE0.md, approved 2026-10-17): stock and to-buy are separate amounts with unit-safe arithmetic, written only through three database functions; item page, add-item search, mark bought, use soon; groceries on every plan |
| 11 | P0 | 09-011 | HomeTalk manages groceries | Done | Phase 2: quantities and units in HomeTalk ("add 6 more", "we have 10 eggs", "bought 2 kg potatoes"), the same service as the screens; dialogues A–H as evaluation cases |
| 12 | P1 | 09-012 | Meals, receipts and use-soon reconcile with stock | Not Started | Phase 3: meal shortfalls by servings and units, receipts add to stock and close list entries, depletion wording never claims stock |
| 13 | P1 | 09-013 | Send to Cook over WhatsApp | Not Started | Phase 4: an approved meal plan sent to a consenting helper through the official WhatsApp template; inert until the template is approved |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Commerce, Groceries & Pet Supplies as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 09-E01 — Demand, Shopping & Purchase Control:** stories 09-001 through 09-004.
- **Epic 09-E05 — Orders, Automation & Pet Supplies:** stories 09-005 through 09-007.
- **Epic 09-E08 — Commerce Optimization:** stories 09-008 through 09-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 09-001 — Consumable model
**Epic:** Demand, Shopping & Purchase Control
**Priority:** P0
**Goal:** Represent household consumables and expected depletion.

**Acceptance criteria**
- Given the household state described by the story, represent household consumables and expected depletion .
- Consumable predictions include an evidence basis such as purchase history, configured inventory or explicit user input before creating a shopping action.
- Suggested carts show why each item is needed, the requested quantity and expected timing, with easy remove/defer controls.
- Purchase execution checks household spending, product and merchant policies server-side and uses idempotency for retries.
- Order status changes can resolve or replan dependent household outcomes without generating duplicate notifications.
- Pet supplies use the same actionable depletion model but remain scoped to the relevant pet and household.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 09-002 — Suggested cart
**Epic:** Demand, Shopping & Purchase Control
**Priority:** P0
**Goal:** Generate actionable shopping suggestions.

**Acceptance criteria**
- Given the household state described by the story, generate actionable shopping suggestions .
- The action shows expected cost/quantity before any purchase side effect occurs.
- Consumable predictions include an evidence basis such as purchase history, configured inventory or explicit user input before creating a shopping action.
- Suggested carts show why each item is needed, the requested quantity and expected timing, with easy remove/defer controls.
- Purchase execution checks household spending, product and merchant policies server-side and uses idempotency for retries.
- Order status changes can resolve or replan dependent household outcomes without generating duplicate notifications.
- Pet supplies use the same actionable depletion model but remain scoped to the relevant pet and household.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 09-003 — Commerce adapter
**Epic:** Demand, Shopping & Purchase Control
**Priority:** P0
**Goal:** Abstract grocery, ecommerce and pet providers.

**Acceptance criteria**
- Given the household state described by the story, abstract grocery, ecommerce and pet providers .
- The action shows expected cost/quantity before any purchase side effect occurs.
- Consumable predictions include an evidence basis such as purchase history, configured inventory or explicit user input before creating a shopping action.
- Suggested carts show why each item is needed, the requested quantity and expected timing, with easy remove/defer controls.
- Purchase execution checks household spending, product and merchant policies server-side and uses idempotency for retries.
- Order status changes can resolve or replan dependent household outcomes without generating duplicate notifications.
- Pet supplies use the same actionable depletion model but remain scoped to the relevant pet and household.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 09-004 — Purchase approval
**Epic:** Demand, Shopping & Purchase Control
**Priority:** P0
**Goal:** Apply household approval thresholds.

**Acceptance criteria**
- Given the household state described by the story, apply household approval thresholds .
- Consumable predictions include an evidence basis such as purchase history, configured inventory or explicit user input before creating a shopping action.
- Suggested carts show why each item is needed, the requested quantity and expected timing, with easy remove/defer controls.
- Purchase execution checks household spending, product and merchant policies server-side and uses idempotency for retries.
- Order status changes can resolve or replan dependent household outcomes without generating duplicate notifications.
- Pet supplies use the same actionable depletion model but remain scoped to the relevant pet and household.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 09-005 — Auto recurring orders
**Epic:** Orders, Automation & Pet Supplies
**Priority:** P1
**Goal:** Allow low-risk purchases within policy.

**Acceptance criteria**
- Given the household state described by the story, allow low-risk purchases within policy .
- Policy evaluation returns a deterministic allow/deny/approval result that can be consumed by APIs and AI tools.
- Consumable predictions include an evidence basis such as purchase history, configured inventory or explicit user input before creating a shopping action.
- Suggested carts show why each item is needed, the requested quantity and expected timing, with easy remove/defer controls.
- Purchase execution checks household spending, product and merchant policies server-side and uses idempotency for retries.
- Order status changes can resolve or replan dependent household outcomes without generating duplicate notifications.
- Pet supplies use the same actionable depletion model but remain scoped to the relevant pet and household.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 09-006 — Order tracking
**Epic:** Orders, Automation & Pet Supplies
**Priority:** P1
**Goal:** Update household outcomes from order status.

**Acceptance criteria**
- Given the household state described by the story, update household outcomes from order status .
- The action shows expected cost/quantity before any purchase side effect occurs.
- Consumable predictions include an evidence basis such as purchase history, configured inventory or explicit user input before creating a shopping action.
- Suggested carts show why each item is needed, the requested quantity and expected timing, with easy remove/defer controls.
- Purchase execution checks household spending, product and merchant policies server-side and uses idempotency for retries.
- Order status changes can resolve or replan dependent household outcomes without generating duplicate notifications.
- Pet supplies use the same actionable depletion model but remain scoped to the relevant pet and household.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 09-007 — Pet supply prediction
**Epic:** Orders, Automation & Pet Supplies
**Priority:** P1
**Goal:** Predict food/litter depletion.

**Acceptance criteria**
- Given the household state described by the story, predict food/litter depletion .
- The feature creates an action only when a real household outcome is due, blocked or at risk.
- Consumable predictions include an evidence basis such as purchase history, configured inventory or explicit user input before creating a shopping action.
- Suggested carts show why each item is needed, the requested quantity and expected timing, with easy remove/defer controls.
- Purchase execution checks household spending, product and merchant policies server-side and uses idempotency for retries.
- Order status changes can resolve or replan dependent household outcomes without generating duplicate notifications.
- Pet supplies use the same actionable depletion model but remain scoped to the relevant pet and household.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 09-008 — Merchant optimization
**Epic:** Commerce Optimization
**Priority:** P2
**Goal:** Compare price, availability and delivery.

**Acceptance criteria**
- Given the household state described by the story, compare price, availability and delivery .
- Availability supports recurring windows plus date-specific exceptions and is queryable by the planner.
- Consumable predictions include an evidence basis such as purchase history, configured inventory or explicit user input before creating a shopping action.
- Suggested carts show why each item is needed, the requested quantity and expected timing, with easy remove/defer controls.
- Purchase execution checks household spending, product and merchant policies server-side and uses idempotency for retries.
- Order status changes can resolve or replan dependent household outcomes without generating duplicate notifications.
- Pet supplies use the same actionable depletion model but remain scoped to the relevant pet and household.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 09-009 — A receipt becomes purchase history
**Epic:** Commerce
**Priority:** P1
**Goal:** Turn a receipt a household sends in into recorded purchases, so depletion and "when do we run out" learn from real buying.

**Acceptance criteria**
- A receipt sent through HomeSend is read as purchases (items, quantities, amount, date, merchant), never as a bill to pay.
- Each purchase is confirmed by a person before it is written to `consumable_purchases`, and can be undone.
- A receipt item matching a tracked consumable updates that consumable's history; an unknown item is offered as a new one.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 09-010 — One Groceries list: what's at home and what to buy
**Epic:** Commerce
**Priority:** P0
**Goal:** A household sees, for every item it keeps, how much is at home and how much is to buy, side by side, and changes either on purpose.

**Acceptance criteria**
- In stock and to buy are separate amounts; the row's −/+ change only to buy, stock changes only on the item's page or by marking bought.
- Amounts carry their unit, convert within mass, volume and count, and never go below zero; a retried change never counts twice and a stale one is refused.
- An amount nobody gave is "not counted yet", never estimated.
- Search, category filter, add-item that finds existing and stopped items first, mark bought with the actual amount, use soon from entered dates and low levels.
- Adults change stock; the family changes the list; helpers read.

### Story 09-011 — HomeTalk manages groceries
**Epic:** Commerce
**Priority:** P0
**Goal:** Everything the Groceries list does can be said to HomeTalk, through the same service, with the conversation acceptance cases A–H passing.

### Story 09-012 — Meals, receipts and use-soon reconcile with stock
**Epic:** Commerce
**Priority:** P1
**Goal:** Meal shortfalls, receipts and use-soon work from real amounts at home rather than names and purchase dates.

### Story 09-013 — Send to Cook over WhatsApp
**Epic:** Commerce
**Priority:** P1
**Goal:** An approved meal plan reaches a consenting helper through WonderHome's official WhatsApp channel, with its real delivery state.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.