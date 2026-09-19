# WonderHome — Household Configuration & Playbook

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 02-001 | Setup wizard | Done | Five resumable steps reading real config; dependency cycles refused; every change audited |
| 2 | P0 | 02-002 | Responsibility matrix | Done | Canonical data; inactive and cross-household targets refused |
| 3 | P0 | 02-003 | Household playbook | Done | Outcome keys, cadence, verification, escalation, dependencies |
| 4 | P0 | 02-004 | Policies | Done | Versioned; one active version per policy name |
| 5 | P0 | 02-005 | AI autonomy | Done | decideAutonomy at execution time; unconfigured means observe |
| 6 | P0 | 02-006 | Configure by conversation | Done | Deterministic grammar → previewed proposal → the same validated, audited write |
| 7 | P1 | 02-007 | Conflict detection | Done | `detectConflicts` over the household's current responsibilities and active members; orphaned owner/backup, a backup who is the owner, a child now on an adult-only outcome — each names the outcome, the member(s) and one resolution |
| 8 | P2 | 02-008 | Advanced rule builder | Done | A policy can carry one condition (member type, or an hour window) narrowing it to a specific case; `selectApplicablePolicy` picks the most specific match, falling back to the household's unconditional default |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Household Configuration & Playbook as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 02-E01 — Household Setup & Operating Model:** stories 02-001 through 02-003.
- **Epic 02-E04 — Policies, Autonomy & Conversational Configuration:** stories 02-004 through 02-006.
- **Epic 02-E07 — Consistency & Advanced Rules:** stories 02-007 through 02-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 02-001 — Setup wizard
**Epic:** Household Setup & Operating Model
**Priority:** P0
**Goal:** Capture family, responsibilities, routines, policies and
integrations.

**Acceptance criteria**
- Given the household state described by the story, capture family, responsibilities, routines, policies and
integrations .
- The wizard can be resumed without losing completed sections and can be completed incrementally.
- Configuration is stored as canonical household data that can be consumed by planners, notifications and AI tools; it is not UI-only state.
- Each responsibility supports primary owner, backup owner and an AI action mode, with validation preventing invalid/self-contradictory assignments.
- Policies are versioned and evaluated server-side so a UI or LLM cannot bypass a spending, privacy, notification or approval rule.
- Household Playbook entries define an outcome, operating window, dependencies and escalation behavior sufficiently for automated planning.
- Configuration changes show the affected downstream behaviors and create an auditable version/change record.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 02-002 — Responsibility matrix
**Epic:** Household Setup & Operating Model
**Priority:** P0
**Goal:** Define primary, backup and AI behavior per outcome.

**Acceptance criteria**
- Given the household state described by the story, define primary, backup and AI behavior per outcome .
- The matrix prevents assignment to an inactive/non-member target and identifies outcomes with no owner or backup.
- Configuration is stored as canonical household data that can be consumed by planners, notifications and AI tools; it is not UI-only state.
- Each responsibility supports primary owner, backup owner and an AI action mode, with validation preventing invalid/self-contradictory assignments.
- Policies are versioned and evaluated server-side so a UI or LLM cannot bypass a spending, privacy, notification or approval rule.
- Household Playbook entries define an outcome, operating window, dependencies and escalation behavior sufficiently for automated planning.
- Configuration changes show the affected downstream behaviors and create an auditable version/change record.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 02-003 — Household playbook
**Epic:** Household Setup & Operating Model
**Priority:** P0
**Goal:** Define how normal household outcomes operate.

**Acceptance criteria**
- Given the household state described by the story, define how normal household outcomes operate .
- A playbook item can be instantiated into a routine/outcome without requiring a new custom UI workflow.
- Configuration is stored as canonical household data that can be consumed by planners, notifications and AI tools; it is not UI-only state.
- Each responsibility supports primary owner, backup owner and an AI action mode, with validation preventing invalid/self-contradictory assignments.
- Policies are versioned and evaluated server-side so a UI or LLM cannot bypass a spending, privacy, notification or approval rule.
- Household Playbook entries define an outcome, operating window, dependencies and escalation behavior sufficiently for automated planning.
- Configuration changes show the affected downstream behaviors and create an auditable version/change record.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 02-004 — Policies
**Epic:** Policies, Autonomy & Conversational Configuration
**Priority:** P0
**Goal:** Define spending, notifications, privacy, approvals and
protected time.

**Acceptance criteria**
- Given the household state described by the story, define spending, notifications, privacy, approvals and
protected time .
- A notification decision can be explained from stored decision factors for debugging and trust.
- Configuration is stored as canonical household data that can be consumed by planners, notifications and AI tools; it is not UI-only state.
- Each responsibility supports primary owner, backup owner and an AI action mode, with validation preventing invalid/self-contradictory assignments.
- Policies are versioned and evaluated server-side so a UI or LLM cannot bypass a spending, privacy, notification or approval rule.
- Household Playbook entries define an outcome, operating window, dependencies and escalation behavior sufficiently for automated planning.
- Configuration changes show the affected downstream behaviors and create an auditable version/change record.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 02-005 — AI autonomy
**Epic:** Policies, Autonomy & Conversational Configuration
**Priority:** P0
**Goal:** Configure observe/prepare/approve/execute levels.

**Acceptance criteria**
- Given the household state described by the story, configure observe/prepare/approve/execute levels .
- Autonomy modes are enforced at action execution time, not merely displayed in settings.
- Configuration is stored as canonical household data that can be consumed by planners, notifications and AI tools; it is not UI-only state.
- Each responsibility supports primary owner, backup owner and an AI action mode, with validation preventing invalid/self-contradictory assignments.
- Policies are versioned and evaluated server-side so a UI or LLM cannot bypass a spending, privacy, notification or approval rule.
- Household Playbook entries define an outcome, operating window, dependencies and escalation behavior sufficiently for automated planning.
- Configuration changes show the affected downstream behaviors and create an auditable version/change record.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 02-006 — Configure by conversation
**Epic:** Policies, Autonomy & Conversational Configuration
**Priority:** P0
**Goal:** Let Head/Admin teach the household naturally.

**Acceptance criteria**
- Given the household state described by the story, let Head/Admin teach the household naturally .
- Representative household utterances are included as deterministic regression fixtures.
- Configuration is stored as canonical household data that can be consumed by planners, notifications and AI tools; it is not UI-only state.
- Each responsibility supports primary owner, backup owner and an AI action mode, with validation preventing invalid/self-contradictory assignments.
- Policies are versioned and evaluated server-side so a UI or LLM cannot bypass a spending, privacy, notification or approval rule.
- Household Playbook entries define an outcome, operating window, dependencies and escalation behavior sufficiently for automated planning.
- Configuration changes show the affected downstream behaviors and create an auditable version/change record.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 02-007 — Conflict detection
**Epic:** Consistency & Advanced Rules
**Priority:** P1
**Goal:** Detect contradictory rules and responsibilities.

**Acceptance criteria**
- Given the household state described by the story, detect contradictory rules and responsibilities .
- Conflicts identify the two or more records/rules in conflict and provide a direct resolution action.
- Configuration is stored as canonical household data that can be consumed by planners, notifications and AI tools; it is not UI-only state.
- Each responsibility supports primary owner, backup owner and an AI action mode, with validation preventing invalid/self-contradictory assignments.
- Policies are versioned and evaluated server-side so a UI or LLM cannot bypass a spending, privacy, notification or approval rule.
- Household Playbook entries define an outcome, operating window, dependencies and escalation behavior sufficiently for automated planning.
- Configuration changes show the affected downstream behaviors and create an auditable version/change record.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 02-008 — Advanced rule builder
**Epic:** Consistency & Advanced Rules
**Priority:** P2
**Goal:** Support conditional household policies.

**Acceptance criteria**
- Given the household state described by the story, support conditional household policies .
- Configuration is stored as canonical household data that can be consumed by planners, notifications and AI tools; it is not UI-only state.
- Each responsibility supports primary owner, backup owner and an AI action mode, with validation preventing invalid/self-contradictory assignments.
- Policies are versioned and evaluated server-side so a UI or LLM cannot bypass a spending, privacy, notification or approval rule.
- Household Playbook entries define an outcome, operating window, dependencies and escalation behavior sufficiently for automated planning.
- Configuration changes show the affected downstream behaviors and create an auditable version/change record.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.