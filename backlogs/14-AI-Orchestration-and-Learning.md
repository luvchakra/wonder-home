# WonderHome — AI Orchestration & Learning

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 14-001 | Household orchestrator | Done | Authorization outside the model; approval binds to the exact action. 2026-09-20: the Household Brain (`conversation/brain.ts`, v4 §5) gathers every domain into one consented context, and a question is answered from all of it |
| 2 | P0 | 14-002 | Governed tools | Done | Authorization outside the model; approval binds to the exact action |
| 3 | P0 | 14-003 | Plan/execute/monitor loop | Done | Authorization outside the model; approval binds to the exact action. 2026-09-20: "understand" now reads the whole home (v4 §6 context assembly, cross-domain reasoning, result interpretation), not one domain's summary |
| 4 | P0 | 14-004 | Agent runs | Done | Authorization outside the model; approval binds to the exact action |
| 5 | P0 | 14-005 | Approval integration | Done | Authorization outside the model; approval binds to the exact action |
| 6 | P0 | 14-006 | Learning boundaries | Done | Authorization outside the model; approval binds to the exact action |
| 7 | P1 | 14-007 | Multi-agent coordination | Done | `specialists.ts`: named specialists (meals, pets, home, bills, groceries) each propose `PlannedStep`s from `HomeAssessment`s for the existing governed tool registry; a contract (`grocery_list`) is how a meal or pet need it cannot itself fulfil is handed to groceries, which consolidates every producer's list into one deduplicated set of steps. `coordinate()` runs them in order and returns one plan; `AgentRun` gained a `contracts` field and `agent_runs.contracts` column to record what was handed off, alongside the plan `authorizeToolCall` still gates step by step |
| 8 | P2 | 14-008 | Predictive intelligence | Not Started | |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement AI Orchestration & Learning as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 14-E01 — Governed AI Orchestration:** stories 14-001 through 14-005.
- **Epic 14-E06 — Learning, Multi-Agent Coordination & Prediction:** stories 14-006 through 14-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 14-001 — Household orchestrator
**Epic:** Governed AI Orchestration
**Priority:** P0
**Goal:** Coordinate domain agents around outcomes.

**Acceptance criteria**
- Given the household state described by the story, coordinate domain agents around outcomes .
- The agent execution record identifies the tools used and final outcome without storing unnecessary raw model context.
- The orchestrator decomposes household goals into governed domain actions and records the plan, selected tools and result state.
- Every AI tool invocation re-checks authorization, household scope, entitlement and autonomy policy outside the model.
- Agent failures are recoverable: partial work is recorded, completed side effects are not repeated, and the household is told only when intervention is needed.
- Confirmed household facts are never silently overwritten by model inference; learned patterns remain distinguishable and reviewable.
- AI evaluation fixtures cover realistic multi-domain household scenarios, including ambiguous requests, notification suppression and unsafe action attempts.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-002 — Governed tools
**Epic:** Governed AI Orchestration
**Priority:** P0
**Goal:** Expose authorized domain tools/APIs.

**Acceptance criteria**
- Given the household state described by the story, expose authorized domain tools/APIs .
- Contract tests validate the documented request/response behavior against the running route.
- The orchestrator decomposes household goals into governed domain actions and records the plan, selected tools and result state.
- Every AI tool invocation re-checks authorization, household scope, entitlement and autonomy policy outside the model.
- Agent failures are recoverable: partial work is recorded, completed side effects are not repeated, and the household is told only when intervention is needed.
- Confirmed household facts are never silently overwritten by model inference; learned patterns remain distinguishable and reviewable.
- AI evaluation fixtures cover realistic multi-domain household scenarios, including ambiguous requests, notification suppression and unsafe action attempts.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-003 — Plan/execute/monitor loop
**Epic:** Governed AI Orchestration
**Priority:** P0
**Goal:** Implement observe → understand → plan → act → monitor → learn.

**Acceptance criteria**
- Given the household state described by the story, implement observe → understand → plan → act → monitor → learn .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- The orchestrator decomposes household goals into governed domain actions and records the plan, selected tools and result state.
- Every AI tool invocation re-checks authorization, household scope, entitlement and autonomy policy outside the model.
- Agent failures are recoverable: partial work is recorded, completed side effects are not repeated, and the household is told only when intervention is needed.
- Confirmed household facts are never silently overwritten by model inference; learned patterns remain distinguishable and reviewable.
- AI evaluation fixtures cover realistic multi-domain household scenarios, including ambiguous requests, notification suppression and unsafe action attempts.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-004 — Agent runs
**Epic:** Governed AI Orchestration
**Priority:** P0
**Goal:** Record plans, tools and safe results.

**Acceptance criteria**
- Given the household state described by the story, record plans, tools and safe results .
- The agent execution record identifies the tools used and final outcome without storing unnecessary raw model context.
- The orchestrator decomposes household goals into governed domain actions and records the plan, selected tools and result state.
- Every AI tool invocation re-checks authorization, household scope, entitlement and autonomy policy outside the model.
- Agent failures are recoverable: partial work is recorded, completed side effects are not repeated, and the household is told only when intervention is needed.
- Confirmed household facts are never silently overwritten by model inference; learned patterns remain distinguishable and reviewable.
- AI evaluation fixtures cover realistic multi-domain household scenarios, including ambiguous requests, notification suppression and unsafe action attempts.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-005 — Approval integration
**Epic:** Governed AI Orchestration
**Priority:** P0
**Goal:** Pause for human approval when required.

**Acceptance criteria**
- Given the household state described by the story, pause for human approval when required .
- The orchestrator decomposes household goals into governed domain actions and records the plan, selected tools and result state.
- Every AI tool invocation re-checks authorization, household scope, entitlement and autonomy policy outside the model.
- Agent failures are recoverable: partial work is recorded, completed side effects are not repeated, and the household is told only when intervention is needed.
- Confirmed household facts are never silently overwritten by model inference; learned patterns remain distinguishable and reviewable.
- AI evaluation fixtures cover realistic multi-domain household scenarios, including ambiguous requests, notification suppression and unsafe action attempts.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-006 — Learning boundaries
**Epic:** Learning, Multi-Agent Coordination & Prediction
**Priority:** P0
**Goal:** Separate confirmed facts from inferred patterns.

**Acceptance criteria**
- Given the household state described by the story, separate confirmed facts from inferred patterns .
- The UI identifies the exact record or policy that will change before the user confirms.
- The orchestrator decomposes household goals into governed domain actions and records the plan, selected tools and result state.
- Every AI tool invocation re-checks authorization, household scope, entitlement and autonomy policy outside the model.
- Agent failures are recoverable: partial work is recorded, completed side effects are not repeated, and the household is told only when intervention is needed.
- Confirmed household facts are never silently overwritten by model inference; learned patterns remain distinguishable and reviewable.
- AI evaluation fixtures cover realistic multi-domain household scenarios, including ambiguous requests, notification suppression and unsafe action attempts.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-007 — Multi-agent coordination
**Epic:** Learning, Multi-Agent Coordination & Prediction
**Priority:** P1
**Goal:** Allow specialist agents to collaborate through contracts.

**Acceptance criteria**
- Given the household state described by the story, allow specialist agents to collaborate through contracts .
- The agent execution record identifies the tools used and final outcome without storing unnecessary raw model context.
- The orchestrator decomposes household goals into governed domain actions and records the plan, selected tools and result state.
- Every AI tool invocation re-checks authorization, household scope, entitlement and autonomy policy outside the model.
- Agent failures are recoverable: partial work is recorded, completed side effects are not repeated, and the household is told only when intervention is needed.
- Confirmed household facts are never silently overwritten by model inference; learned patterns remain distinguishable and reviewable.
- AI evaluation fixtures cover realistic multi-domain household scenarios, including ambiguous requests, notification suppression and unsafe action attempts.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-008 — Predictive intelligence
**Epic:** Learning, Multi-Agent Coordination & Prediction
**Priority:** P2
**Goal:** Predict household risks/opportunities.

**Acceptance criteria**
- Given the household state described by the story, predict household risks/opportunities .
- The orchestrator decomposes household goals into governed domain actions and records the plan, selected tools and result state.
- Every AI tool invocation re-checks authorization, household scope, entitlement and autonomy policy outside the model.
- Agent failures are recoverable: partial work is recorded, completed side effects are not repeated, and the household is told only when intervention is needed.
- Confirmed household facts are never silently overwritten by model inference; learned patterns remain distinguishable and reviewable.
- AI evaluation fixtures cover realistic multi-domain household scenarios, including ambiguous requests, notification suppression and unsafe action attempts.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.