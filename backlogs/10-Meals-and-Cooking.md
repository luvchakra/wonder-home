# WonderHome — Meals & Cooking

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 10-001 | Meal outcome | Done | readiness for eating, with no preparation step anybody ticks |
| 2 | P0 | 10-002 | Meal planning | Done | plans against real time, preferences and what is actually in |
| 3 | P0 | 10-003 | Ingredient dependencies | Done | a shortage writes a shopping suggestion, never an informational note |
| 4 | P0 | 10-004 | Cooking responsibility | Done | the cook is a named responsibility; an absent cook is raised before the clock |
| 5 | P1 | 10-005 | Adaptive replanning | Done | replans on change but will not move protected family time on its own |
| 6 | P1 | 10-006 | Recipe intelligence | Done | every recommendation names a next action: cook, shop, substitute or defer |
| 7 | P2 | 10-007 | Advanced nutrition | Done | preference scope and source kept so a dislike never becomes a house rule |
| 8 | P2 | 10-008 | Cooking automation hooks | Done | readiness accepts an observed source, so an appliance signal has somewhere to land |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Meals & Cooking as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 10-E01 — Meal Outcomes & Planning:** stories 10-001 through 10-004.
- **Epic 10-E05 — Adaptive Meals & Recipe Intelligence:** stories 10-005 through 10-007.
- **Epic 10-E08 — Future Cooking Automation:** stories 10-008 through 10-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 10-001 — Meal outcome
**Epic:** Meal Outcomes & Planning
**Priority:** P0
**Goal:** Represent meal readiness, not completion clicks.

**Acceptance criteria**
- Given the household state described by the story, represent meal readiness, not completion clicks .
- Meal changes are reflected in the associated shopping dependencies before execution.
- Meal plans are generated against actual family schedule, preferences, ingredient availability and required readiness times.
- Meal outcomes represent readiness for eating rather than requiring cooks to record every preparation step.
- Missing ingredients create shopping dependencies and are not treated as a generic informational insight.
- Changes to schedule or availability replan affected meals while preserving explicit family preferences and protected time.
- Recipe and meal recommendations expose a clear next action such as cook, substitute, shop or defer.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 10-002 — Meal planning
**Epic:** Meal Outcomes & Planning
**Priority:** P0
**Goal:** Plan meals from schedule, preferences and ingredients.

**Acceptance criteria**
- Given the household state described by the story, plan meals from schedule, preferences and ingredients .
- Preferences retain source and scope so household preferences are not confused with an individual member preference.
- Meal plans are generated against actual family schedule, preferences, ingredient availability and required readiness times.
- Meal outcomes represent readiness for eating rather than requiring cooks to record every preparation step.
- Missing ingredients create shopping dependencies and are not treated as a generic informational insight.
- Changes to schedule or availability replan affected meals while preserving explicit family preferences and protected time.
- Recipe and meal recommendations expose a clear next action such as cook, substitute, shop or defer.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 10-003 — Ingredient dependencies
**Epic:** Meal Outcomes & Planning
**Priority:** P0
**Goal:** Connect meals to shopping needs.

**Acceptance criteria**
- Given the household state described by the story, connect meals to shopping needs .
- Meal changes are reflected in the associated shopping dependencies before execution.
- Meal plans are generated against actual family schedule, preferences, ingredient availability and required readiness times.
- Meal outcomes represent readiness for eating rather than requiring cooks to record every preparation step.
- Missing ingredients create shopping dependencies and are not treated as a generic informational insight.
- Changes to schedule or availability replan affected meals while preserving explicit family preferences and protected time.
- Recipe and meal recommendations expose a clear next action such as cook, substitute, shop or defer.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 10-004 — Cooking responsibility
**Epic:** Meal Outcomes & Planning
**Priority:** P0
**Goal:** Use household responsibility model.

**Acceptance criteria**
- Given the household state described by the story, use household responsibility model .
- Meal plans are generated against actual family schedule, preferences, ingredient availability and required readiness times.
- Meal outcomes represent readiness for eating rather than requiring cooks to record every preparation step.
- Missing ingredients create shopping dependencies and are not treated as a generic informational insight.
- Changes to schedule or availability replan affected meals while preserving explicit family preferences and protected time.
- Recipe and meal recommendations expose a clear next action such as cook, substitute, shop or defer.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 10-005 — Adaptive replanning
**Epic:** Adaptive Meals & Recipe Intelligence
**Priority:** P1
**Goal:** Replan for changes and shortages.

**Acceptance criteria**
- Given the household state described by the story, replan for changes and shortages .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Meal plans are generated against actual family schedule, preferences, ingredient availability and required readiness times.
- Meal outcomes represent readiness for eating rather than requiring cooks to record every preparation step.
- Missing ingredients create shopping dependencies and are not treated as a generic informational insight.
- Changes to schedule or availability replan affected meals while preserving explicit family preferences and protected time.
- Recipe and meal recommendations expose a clear next action such as cook, substitute, shop or defer.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 10-006 — Recipe intelligence
**Epic:** Adaptive Meals & Recipe Intelligence
**Priority:** P1
**Goal:** Recommend concise recipes using constraints.

**Acceptance criteria**
- Given the household state described by the story, recommend concise recipes using constraints .
- Meal changes are reflected in the associated shopping dependencies before execution.
- Meal plans are generated against actual family schedule, preferences, ingredient availability and required readiness times.
- Meal outcomes represent readiness for eating rather than requiring cooks to record every preparation step.
- Missing ingredients create shopping dependencies and are not treated as a generic informational insight.
- Changes to schedule or availability replan affected meals while preserving explicit family preferences and protected time.
- Recipe and meal recommendations expose a clear next action such as cook, substitute, shop or defer.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 10-007 — Advanced nutrition
**Epic:** Adaptive Meals & Recipe Intelligence
**Priority:** P2
**Goal:** Optional nutrition planning and analytics.

**Acceptance criteria**
- Given the household state described by the story, optional nutrition planning and analytics .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Meal plans are generated against actual family schedule, preferences, ingredient availability and required readiness times.
- Meal outcomes represent readiness for eating rather than requiring cooks to record every preparation step.
- Missing ingredients create shopping dependencies and are not treated as a generic informational insight.
- Changes to schedule or availability replan affected meals while preserving explicit family preferences and protected time.
- Recipe and meal recommendations expose a clear next action such as cook, substitute, shop or defer.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 10-008 — Cooking automation hooks
**Epic:** Future Cooking Automation
**Priority:** P2
**Goal:** Prepare interfaces for smart appliances.

**Acceptance criteria**
- Given the household state described by the story, prepare interfaces for smart appliances .
- Meal plans are generated against actual family schedule, preferences, ingredient availability and required readiness times.
- Meal outcomes represent readiness for eating rather than requiring cooks to record every preparation step.
- Missing ingredients create shopping dependencies and are not treated as a generic informational insight.
- Changes to schedule or availability replan affected meals while preserving explicit family preferences and protected time.
- Recipe and meal recommendations expose a clear next action such as cook, substitute, shop or defer.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.