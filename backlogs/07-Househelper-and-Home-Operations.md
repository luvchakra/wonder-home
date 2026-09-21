# WonderHome — Househelper & Home Operations

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 07-001 | Normal helper model | Done | Outcomes and windows, never per-chore status |
| 2 | P0 | 07-002 | Availability/leave | Done | Outcomes and windows, never per-chore status |
| 3 | P0 | 07-003 | Backup planning | Done | Outcomes and windows, never per-chore status |
| 4 | P0 | 07-004 | Exception handling | Done | Outcomes and windows, never per-chore status |
| 5 | P0 | 07-005 | Helper privacy | Done | Outcomes and windows, never per-chore status |
| 6 | P1 | 07-006 | Optional daily summary | Done | `buildDailySummary`: one digest of what was unusual, built only from exceptions `handleHelperException` already routed to `tell_household` and an absence left uncovered — a handled exception or a fully-covered absence stays silent, matching the module's own rule that normal work needs no update. Opt-in by construction: nothing depends on anyone reading it, and a quiet day says so in one line rather than nothing |
| 7 | P1 | 07-007 | Pattern learning | Not Started | |
| 8 | P2 | 07-008 | Service marketplace | Not Started | |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Househelper & Home Operations as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 07-E01 — Househelper Operating Model:** stories 07-001 through 07-004.
- **Epic 07-E05 — Helper Access, Summaries & Learning:** stories 07-005 through 07-007.
- **Epic 07-E08 — Service Continuity:** stories 07-008 through 07-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 07-001 — Normal helper model
**Epic:** Househelper Operating Model
**Priority:** P0
**Goal:** Record what the househelper normally handles.

**Acceptance criteria**
- Given the household state described by the story, record what the househelper normally handles .
- Normal work does not create a completion notification or require app interaction from the helper.
- Househelper responsibilities are modeled as expected household outcomes and normal operating windows, not employee productivity tasks.
- Routine helper work requires no per-chore status update; the system intervenes only when an absence, dependency or exception puts an outcome at risk.
- Helper access is explicitly scoped and cannot reveal adult-private, financial or unrelated child information.
- When helper availability changes, the planner identifies only the household outcomes that actually need backup coverage.
- Learning is based on outcome patterns and service continuity, never surveillance, GPS or productivity scoring.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 07-002 — Availability/leave
**Epic:** Househelper Operating Model
**Priority:** P0
**Goal:** Record absence and calculate household impact.

**Acceptance criteria**
- Given the household state described by the story, record absence and calculate household impact .
- Availability supports recurring windows plus date-specific exceptions and is queryable by the planner.
- Househelper responsibilities are modeled as expected household outcomes and normal operating windows, not employee productivity tasks.
- Routine helper work requires no per-chore status update; the system intervenes only when an absence, dependency or exception puts an outcome at risk.
- Helper access is explicitly scoped and cannot reveal adult-private, financial or unrelated child information.
- When helper availability changes, the planner identifies only the household outcomes that actually need backup coverage.
- Learning is based on outcome patterns and service continuity, never surveillance, GPS or productivity scoring.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 07-003 — Backup planning
**Epic:** Househelper Operating Model
**Priority:** P0
**Goal:** Find people/services for affected outcomes.

**Acceptance criteria**
- Given the household state described by the story, find people/services for affected outcomes .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Househelper responsibilities are modeled as expected household outcomes and normal operating windows, not employee productivity tasks.
- Routine helper work requires no per-chore status update; the system intervenes only when an absence, dependency or exception puts an outcome at risk.
- Helper access is explicitly scoped and cannot reveal adult-private, financial or unrelated child information.
- When helper availability changes, the planner identifies only the household outcomes that actually need backup coverage.
- Learning is based on outcome patterns and service continuity, never surveillance, GPS or productivity scoring.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 07-004 — Exception handling
**Epic:** Househelper Operating Model
**Priority:** P0
**Goal:** Handle blocked work, missing supplies and extra work.

**Acceptance criteria**
- Given the household state described by the story, handle blocked work, missing supplies and extra work .
- Househelper responsibilities are modeled as expected household outcomes and normal operating windows, not employee productivity tasks.
- Routine helper work requires no per-chore status update; the system intervenes only when an absence, dependency or exception puts an outcome at risk.
- Helper access is explicitly scoped and cannot reveal adult-private, financial or unrelated child information.
- When helper availability changes, the planner identifies only the household outcomes that actually need backup coverage.
- Learning is based on outcome patterns and service continuity, never surveillance, GPS or productivity scoring.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 07-005 — Helper privacy
**Epic:** Helper Access, Summaries & Learning
**Priority:** P0
**Goal:** Limit helper access if an account is provided.

**Acceptance criteria**
- Given the household state described by the story, limit helper access if an account is provided .
- Normal work does not create a completion notification or require app interaction from the helper.
- Househelper responsibilities are modeled as expected household outcomes and normal operating windows, not employee productivity tasks.
- Routine helper work requires no per-chore status update; the system intervenes only when an absence, dependency or exception puts an outcome at risk.
- Helper access is explicitly scoped and cannot reveal adult-private, financial or unrelated child information.
- When helper availability changes, the planner identifies only the household outcomes that actually need backup coverage.
- Learning is based on outcome patterns and service continuity, never surveillance, GPS or productivity scoring.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 07-006 — Optional daily summary
**Epic:** Helper Access, Summaries & Learning
**Priority:** P1
**Goal:** Provide one unusual-work summary.

**Acceptance criteria**
- Given the household state described by the story, provide one unusual-work summary .
- Househelper responsibilities are modeled as expected household outcomes and normal operating windows, not employee productivity tasks.
- Routine helper work requires no per-chore status update; the system intervenes only when an absence, dependency or exception puts an outcome at risk.
- Helper access is explicitly scoped and cannot reveal adult-private, financial or unrelated child information.
- When helper availability changes, the planner identifies only the household outcomes that actually need backup coverage.
- Learning is based on outcome patterns and service continuity, never surveillance, GPS or productivity scoring.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 07-007 — Pattern learning
**Epic:** Helper Access, Summaries & Learning
**Priority:** P1
**Goal:** Learn normal timing and missed patterns.

**Acceptance criteria**
- Given the household state described by the story, learn normal timing and missed patterns .
- A notification decision can be explained from stored decision factors for debugging and trust.
- Househelper responsibilities are modeled as expected household outcomes and normal operating windows, not employee productivity tasks.
- Routine helper work requires no per-chore status update; the system intervenes only when an absence, dependency or exception puts an outcome at risk.
- Helper access is explicitly scoped and cannot reveal adult-private, financial or unrelated child information.
- When helper availability changes, the planner identifies only the household outcomes that actually need backup coverage.
- Learning is based on outcome patterns and service continuity, never surveillance, GPS or productivity scoring.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 07-008 — Service marketplace
**Epic:** Service Continuity
**Priority:** P2
**Goal:** Coordinate backup services where available.

**Acceptance criteria**
- Given the household state described by the story, coordinate backup services where available .
- Househelper responsibilities are modeled as expected household outcomes and normal operating windows, not employee productivity tasks.
- Routine helper work requires no per-chore status update; the system intervenes only when an absence, dependency or exception puts an outcome at risk.
- Helper access is explicitly scoped and cannot reveal adult-private, financial or unrelated child information.
- When helper availability changes, the planner identifies only the household outcomes that actually need backup coverage.
- Learning is based on outcome patterns and service continuity, never surveillance, GPS or productivity scoring.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.