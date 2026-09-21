# WonderHome — Outcome & Routine Engine

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 03-001 | Outcome model | Done | Desired state, owner, window, verification — not a checklist item |
| 2 | P0 | 03-002 | Routine model | Done | Routine separate from the outcomes it instantiates |
| 3 | P0 | 03-003 | Monitoring | Done | Pure evaluation; normal operation is silent |
| 4 | P0 | 03-004 | Exception detection | Done | Impact and recommended action are NOT NULL by design |
| 5 | P0 | 03-005 | Replanning | Done | Downstream reachability computed, unaffected plans preserved |
| 6 | P1 | 03-006 | Dependency graph | Done | `attachDependencies` turns the household's real dependency edges (the same ones `configuration.ts`'s `canDependOn` validates) into each outcome's own `dependencies`, carrying the upstream outcome's current status, feeding straight into the evaluation and replanning already built for 03-003/03-005 |
| 7 | P1 | 03-007 | Pattern learning | Done | `pattern-learning.ts`: `findTimingPattern` looks at an outcome key's actually-met history and calls a normal timing only when completions cluster tightly enough (consistency ≥0.6, at least 4 samples) — scattered history says nothing. `proposeTimingPattern` turns a found pattern into the same `LearningProposal` shape module 14 uses everywhere (observed, capped confidence, status "learned"), and refuses outright — returns `null`, proposing nothing — once the household has confirmed a fact about that outcome's timing, the goal's own words made a caller-supplied fact so it is testable rather than assumed |
| 8 | P2 | 03-008 | Optimization | Not Started | |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Outcome & Routine Engine as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 03-E01 — Outcome & Routine Execution:** stories 03-001 through 03-004.
- **Epic 03-E05 — Replanning, Dependencies & Learning:** stories 03-005 through 03-007.
- **Epic 03-E08 — Optimization:** stories 03-008 through 03-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 03-001 — Outcome model
**Epic:** Outcome & Routine Execution
**Priority:** P0
**Goal:** Represent desired household results instead of chore
checklists.

**Acceptance criteria**
- Given the household state described by the story, represent desired household results instead of chore
checklists .
- An outcome has a desired state, owner, due/window, dependencies, verification method and risk state; it is not merely a checklist item.
- Normal recurring outcomes can progress without requiring a human to mark every intermediate step.
- When an owner, dependency or deadline changes, only affected outcomes are replanned and protected commitments remain intact.
- Blocked or late outcomes produce an actionable exception only when the outcome is genuinely at risk.
- Outcome transitions are idempotent and testable so repeated events cannot create duplicate work or notifications.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 03-002 — Routine model
**Epic:** Outcome & Routine Execution
**Priority:** P0
**Goal:** Create recurring outcome definitions.

**Acceptance criteria**
- Given the household state described by the story, create recurring outcome definitions .
- An outcome has a desired state, owner, due/window, dependencies, verification method and risk state; it is not merely a checklist item.
- Normal recurring outcomes can progress without requiring a human to mark every intermediate step.
- When an owner, dependency or deadline changes, only affected outcomes are replanned and protected commitments remain intact.
- Blocked or late outcomes produce an actionable exception only when the outcome is genuinely at risk.
- Outcome transitions are idempotent and testable so repeated events cannot create duplicate work or notifications.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 03-003 — Monitoring
**Epic:** Outcome & Routine Execution
**Priority:** P0
**Goal:** Evaluate whether outcomes are on track.

**Acceptance criteria**
- Given the household state described by the story, evaluate whether outcomes are on track .
- An outcome has a desired state, owner, due/window, dependencies, verification method and risk state; it is not merely a checklist item.
- Normal recurring outcomes can progress without requiring a human to mark every intermediate step.
- When an owner, dependency or deadline changes, only affected outcomes are replanned and protected commitments remain intact.
- Blocked or late outcomes produce an actionable exception only when the outcome is genuinely at risk.
- Outcome transitions are idempotent and testable so repeated events cannot create duplicate work or notifications.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 03-004 — Exception detection
**Epic:** Outcome & Routine Execution
**Priority:** P0
**Goal:** Detect blocked, late or at-risk outcomes.

**Acceptance criteria**
- Given the household state described by the story, detect blocked, late or at-risk outcomes .
- An outcome has a desired state, owner, due/window, dependencies, verification method and risk state; it is not merely a checklist item.
- Normal recurring outcomes can progress without requiring a human to mark every intermediate step.
- When an owner, dependency or deadline changes, only affected outcomes are replanned and protected commitments remain intact.
- Blocked or late outcomes produce an actionable exception only when the outcome is genuinely at risk.
- Outcome transitions are idempotent and testable so repeated events cannot create duplicate work or notifications.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 03-005 — Replanning
**Epic:** Replanning, Dependencies & Learning
**Priority:** P0
**Goal:** Recalculate when dependencies or availability change.

**Acceptance criteria**
- Given the household state described by the story, recalculate when dependencies or availability change .
- Availability supports recurring windows plus date-specific exceptions and is queryable by the planner.
- An outcome has a desired state, owner, due/window, dependencies, verification method and risk state; it is not merely a checklist item.
- Normal recurring outcomes can progress without requiring a human to mark every intermediate step.
- When an owner, dependency or deadline changes, only affected outcomes are replanned and protected commitments remain intact.
- Blocked or late outcomes produce an actionable exception only when the outcome is genuinely at risk.
- Outcome transitions are idempotent and testable so repeated events cannot create duplicate work or notifications.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 03-006 — Dependency graph
**Epic:** Replanning, Dependencies & Learning
**Priority:** P1
**Goal:** Connect upstream and downstream outcomes.

**Acceptance criteria**
- Given the household state described by the story, connect upstream and downstream outcomes .
- An outcome has a desired state, owner, due/window, dependencies, verification method and risk state; it is not merely a checklist item.
- Normal recurring outcomes can progress without requiring a human to mark every intermediate step.
- When an owner, dependency or deadline changes, only affected outcomes are replanned and protected commitments remain intact.
- Blocked or late outcomes produce an actionable exception only when the outcome is genuinely at risk.
- Outcome transitions are idempotent and testable so repeated events cannot create duplicate work or notifications.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 03-007 — Pattern learning
**Epic:** Replanning, Dependencies & Learning
**Priority:** P1
**Goal:** Learn normal timing without overriding confirmed rules.

**Acceptance criteria**
- Given the household state described by the story, learn normal timing without overriding confirmed rules .
- The UI identifies the exact record or policy that will change before the user confirms.
- An outcome has a desired state, owner, due/window, dependencies, verification method and risk state; it is not merely a checklist item.
- Normal recurring outcomes can progress without requiring a human to mark every intermediate step.
- When an owner, dependency or deadline changes, only affected outcomes are replanned and protected commitments remain intact.
- Blocked or late outcomes produce an actionable exception only when the outcome is genuinely at risk.
- Outcome transitions are idempotent and testable so repeated events cannot create duplicate work or notifications.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 03-008 — Optimization
**Epic:** Optimization
**Priority:** P2
**Goal:** Optimize household schedules and workload.

**Acceptance criteria**
- Given the household state described by the story, optimize household schedules and workload .
- An outcome has a desired state, owner, due/window, dependencies, verification method and risk state; it is not merely a checklist item.
- Normal recurring outcomes can progress without requiring a human to mark every intermediate step.
- When an owner, dependency or deadline changes, only affected outcomes are replanned and protected commitments remain intact.
- Blocked or late outcomes produce an actionable exception only when the outcome is genuinely at risk.
- Outcome transitions are idempotent and testable so repeated events cannot create duplicate work or notifications.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.