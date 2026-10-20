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
| 9 | P0 | 10-009 | A meal card that does what it says: change in place, ingredients without a recipe, the right time | Done | The owner, 2026-10-18 (PR #227). **Change meal** opened HomeTalk with a sentence to retype (rule 13), and a meal could not be changed or removed at all (rule 12): it is now a sheet on the card (name, recipe, slot, day, ready by, cook; `updateMeal`, with a new recipe's ingredients replacing only those still waiting) with **Remove from the plan** (`removeMeal`, a meal still to come; what it put on the list stays). **Ingredients** on a meal with no recipe said "pick a recipe" with nowhere to pick one: it now takes the ingredients written one per line (`addMealIngredients`, amounts read as HomeTalk reads them, none said is "not measured") or one of the household's recipes. The card said "Missing … on the shopping list" for things nobody added: it now says "Still to get" for those. And a meal planned on the Meals screen was timed on the server's clock (an 8 pm dinner saved as 1:30 am): times are on the household's clock (`atLocal`). Browser-checked at 360px and 1280px |
| 10 | P1 | 10-010 | An ingredient pick you can see: the list in view, the item's picture and details | Done | The owner, 2026-10-20. The suggestion list stays clear of the keyboard without flicker: on a phone it sits in the flow, and `useKeepListInView` (`ui/keep-in-view.tsx`) scrolls just enough, in one frame, and caps the list to the space left; the place search uses it too, and a sheet no longer re-centres a field whose list is open. A picked item shows its picture in the field and a line under the row: brand, pack, what is at home (only when counted) and energy and protein per 100 g or ml when the catalog records them, IFCT credited. Checked at 360×430 as a touch phone |
| 11 | P1 | 10-011 | Plan the week: every day's breakfast, lunch and dinner, Repeat last week, and Veg / Non-veg on WonderHome's ideas | Done | The owner, 2026-10-20 (PR #273). Meals → Plan is the week, Monday to Sunday on the household's clock (`meals/week.ts`, tested): ‹ › move a week, This week comes back, and the count is the everyday slots planned out of those still to come. Each day shows Breakfast, Lunch and Dinner (a snack only when one is planned); an empty slot is a quiet "+ Lunch" that opens Plan a meal on that day and slot with its usual time. A past day shows only what was planned on it. Repeat last week plans last week's meals a week on, into empty slots not yet past, through the same `createMeal` and meal ingredients (`copyLastWeekAction`); nothing planned is moved or replaced. On Recipes, a Veg / Non-veg toggle beside Ideas from WonderHome filters the dishes (an egg dish shows with non-veg), keeping the course picked. Words and help in all eight languages. |

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

### Story 10-009 — A meal card that does what it says
**Epic:** Meals & Cooking
**Priority:** P0
**Goal:** Every control on a meal's card works on that card: change or remove the meal, give it ingredients without a recipe, and read its time on the household's clock.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.