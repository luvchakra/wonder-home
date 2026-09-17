# WonderHome — Maintenance, Laundry & Pet Care

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 13-001 | Asset registry | Done | home_assets + service history; agenda is action-only, never an inventory |
| 2 | P0 | 13-002 | Maintenance outcomes | Done | device wear brings a service forward, never pushes it back |
| 3 | P0 | 13-003 | Laundry readiness | Done | readiness from deadline and inferred state; no wash/dry/fold check-ins |
| 4 | P0 | 13-004 | Home exceptions | Done | cover surfaced at the moment of failure; silent when reorderable |
| 5 | P1 | 13-005 | Weather-aware planning | Done | provider port + fixtures + server-side entitlement; no live provider |
| 6 | P1 | 13-006 | Service coordination | Done | next_action_by makes an open request actionable, not informational |
| 7 | P1 | 13-007 | Pet care outcomes | Done | outcome-based; medication never looks like grooming |
| 8 | P2 | 13-008 | Smart-home signals | Done | optional signals, server-ingested only; members cannot write evidence |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Maintenance, Laundry & Pet Care as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 13-E01 — Home Health, Maintenance & Laundry:** stories 13-001 through 13-004.
- **Epic 13-E05 — Planning, Services & Pet Care:** stories 13-005 through 13-007.
- **Epic 13-E08 — Smart Home Signals:** stories 13-008 through 13-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 13-001 — Asset registry
**Epic:** Home Health, Maintenance & Laundry
**Priority:** P0
**Goal:** Track appliances, warranties and maintenance.

**Acceptance criteria**
- Given the household state described by the story, track appliances, warranties and maintenance .
- The feature creates an action only when a real household outcome is due, blocked or at risk.
- Maintenance assets store actionable information such as service interval, warranty/AMC status and responsible party rather than a static inventory list.
- Laundry is represented as readiness outcomes tied to actual family needs and deadlines; no wash/dry/fold check-ins are required.
- Weather and device signals are used only when they can change a household decision or outcome.
- Service requests track provider, status and next action so unresolved maintenance becomes actionable rather than informational.
- Pet care is outcome-based and shares the same exception/notification discipline as other household domains.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 13-002 — Maintenance outcomes
**Epic:** Home Health, Maintenance & Laundry
**Priority:** P0
**Goal:** Schedule service before failure where signals exist.

**Acceptance criteria**
- Given the household state described by the story, schedule service before failure where signals exist .
- The feature creates an action only when a real household outcome is due, blocked or at risk.
- Maintenance assets store actionable information such as service interval, warranty/AMC status and responsible party rather than a static inventory list.
- Laundry is represented as readiness outcomes tied to actual family needs and deadlines; no wash/dry/fold check-ins are required.
- Weather and device signals are used only when they can change a household decision or outcome.
- Service requests track provider, status and next action so unresolved maintenance becomes actionable rather than informational.
- Pet care is outcome-based and shares the same exception/notification discipline as other household domains.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 13-003 — Laundry readiness
**Epic:** Home Health, Maintenance & Laundry
**Priority:** P0
**Goal:** Manage clean/ready outcomes without wash/dry/fold clicks.

**Acceptance criteria**
- Given the household state described by the story, manage clean/ready outcomes without wash/dry/fold clicks .
- The feature creates an action only when a real household outcome is due, blocked or at risk.
- Maintenance assets store actionable information such as service interval, warranty/AMC status and responsible party rather than a static inventory list.
- Laundry is represented as readiness outcomes tied to actual family needs and deadlines; no wash/dry/fold check-ins are required.
- Weather and device signals are used only when they can change a household decision or outcome.
- Service requests track provider, status and next action so unresolved maintenance becomes actionable rather than informational.
- Pet care is outcome-based and shares the same exception/notification discipline as other household domains.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 13-004 — Home exceptions
**Epic:** Home Health, Maintenance & Laundry
**Priority:** P0
**Goal:** Handle appliance, supply and household issues.

**Acceptance criteria**
- Given the household state described by the story, handle appliance, supply and household issues .
- Maintenance assets store actionable information such as service interval, warranty/AMC status and responsible party rather than a static inventory list.
- Laundry is represented as readiness outcomes tied to actual family needs and deadlines; no wash/dry/fold check-ins are required.
- Weather and device signals are used only when they can change a household decision or outcome.
- Service requests track provider, status and next action so unresolved maintenance becomes actionable rather than informational.
- Pet care is outcome-based and shares the same exception/notification discipline as other household domains.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 13-005 — Weather-aware planning
**Epic:** Planning, Services & Pet Care
**Priority:** P1
**Goal:** Use weather for drying/outdoor work.

**Acceptance criteria**
- Given the household state described by the story, use weather for drying/outdoor work .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Maintenance assets store actionable information such as service interval, warranty/AMC status and responsible party rather than a static inventory list.
- Laundry is represented as readiness outcomes tied to actual family needs and deadlines; no wash/dry/fold check-ins are required.
- Weather and device signals are used only when they can change a household decision or outcome.
- Service requests track provider, status and next action so unresolved maintenance becomes actionable rather than informational.
- Pet care is outcome-based and shares the same exception/notification discipline as other household domains.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 13-006 — Service coordination
**Epic:** Planning, Services & Pet Care
**Priority:** P1
**Goal:** Create and track service requests.

**Acceptance criteria**
- Given the household state described by the story, create and track service requests .
- Maintenance assets store actionable information such as service interval, warranty/AMC status and responsible party rather than a static inventory list.
- Laundry is represented as readiness outcomes tied to actual family needs and deadlines; no wash/dry/fold check-ins are required.
- Weather and device signals are used only when they can change a household decision or outcome.
- Service requests track provider, status and next action so unresolved maintenance becomes actionable rather than informational.
- Pet care is outcome-based and shares the same exception/notification discipline as other household domains.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 13-007 — Pet care outcomes
**Epic:** Planning, Services & Pet Care
**Priority:** P1
**Goal:** Track food, litter, appointments and supplies.

**Acceptance criteria**
- Given the household state described by the story, track food, litter, appointments and supplies .
- The feature creates an action only when a real household outcome is due, blocked or at risk.
- Maintenance assets store actionable information such as service interval, warranty/AMC status and responsible party rather than a static inventory list.
- Laundry is represented as readiness outcomes tied to actual family needs and deadlines; no wash/dry/fold check-ins are required.
- Weather and device signals are used only when they can change a household decision or outcome.
- Service requests track provider, status and next action so unresolved maintenance becomes actionable rather than informational.
- Pet care is outcome-based and shares the same exception/notification discipline as other household domains.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 13-008 — Smart-home signals
**Epic:** Smart Home Signals
**Priority:** P2
**Goal:** Use optional devices for outcome verification.

**Acceptance criteria**
- Given the household state described by the story, use optional devices for outcome verification .
- Maintenance assets store actionable information such as service interval, warranty/AMC status and responsible party rather than a static inventory list.
- Laundry is represented as readiness outcomes tied to actual family needs and deadlines; no wash/dry/fold check-ins are required.
- Weather and device signals are used only when they can change a household decision or outcome.
- Service requests track provider, status and next action so unresolved maintenance becomes actionable rather than informational.
- Pet care is outcome-based and shares the same exception/notification discipline as other household domains.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.