# WonderHome — Kids & School Intelligence

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 08-001 | Child responsibility | Not Started | |
| 2 | P0 | 08-002 | School connector | Not Started | |
| 3 | P0 | 08-003 | Assignment ingestion | Not Started | |
| 4 | P0 | 08-004 | Study planning | Not Started | |
| 5 | P0 | 08-005 | Deadline risk | Not Started | |
| 6 | P1 | 08-006 | Document workspace | Not Started | |
| 7 | P1 | 08-007 | School summaries | Not Started | |
| 8 | P2 | 08-008 | Deep portal automation | Not Started | |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Kids & School Intelligence as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 08-E01 — School Data & Child Planning:** stories 08-001 through 08-005.
- **Epic 08-E06 — Documents, Communication & Deep Integrations:** stories 08-006 through 08-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 08-001 — Child responsibility
**Epic:** School Data & Child Planning
**Priority:** P0
**Goal:** Define age-appropriate responsibilities.

**Acceptance criteria**
- Given the household state described by the story, define age-appropriate responsibilities .
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-002 — School connector
**Epic:** School Data & Child Planning
**Priority:** P0
**Goal:** Create provider-neutral school/LMS interface.

**Acceptance criteria**
- Given the household state described by the story, create provider-neutral school/LMS interface .
- Every imported school item retains its source/provider identity and child association.
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-003 — Assignment ingestion
**Epic:** School Data & Child Planning
**Priority:** P0
**Goal:** Import homework, worksheets, exams and events.

**Acceptance criteria**
- Given the household state described by the story, import homework, worksheets, exams and events .
- Every imported school item retains its source/provider identity and child association.
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-004 — Study planning
**Epic:** School Data & Child Planning
**Priority:** P0
**Goal:** Estimate effort and schedule child-friendly work.

**Acceptance criteria**
- Given the household state described by the story, estimate effort and schedule child-friendly work .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-005 — Deadline risk
**Epic:** School Data & Child Planning
**Priority:** P0
**Goal:** Detect likely missed school deadlines.

**Acceptance criteria**
- Given the household state described by the story, detect likely missed school deadlines .
- Every imported school item retains its source/provider identity and child association.
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-006 — Document workspace
**Epic:** Documents, Communication & Deep Integrations
**Priority:** P1
**Goal:** Store/link authorized worksheets and school documents.

**Acceptance criteria**
- Given the household state described by the story, store/link authorized worksheets and school documents .
- Every imported school item retains its source/provider identity and child association.
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-007 — School summaries
**Epic:** Documents, Communication & Deep Integrations
**Priority:** P1
**Goal:** Turn school communications into actions.

**Acceptance criteria**
- Given the household state described by the story, turn school communications into actions .
- Every imported school item retains its source/provider identity and child association.
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-008 — Deep portal automation
**Epic:** Documents, Communication & Deep Integrations
**Priority:** P2
**Goal:** Implement richer provider-specific integrations.

**Acceptance criteria**
- Given the household state described by the story, implement richer provider-specific integrations .
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.