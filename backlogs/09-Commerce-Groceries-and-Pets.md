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

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.