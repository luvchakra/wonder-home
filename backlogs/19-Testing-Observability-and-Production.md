# WonderHome — Testing, Observability & Production

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 19-001 | Automated tests | Done | Unit, script, database and E2E suites in CI |
| 2 | P0 | 19-002 | Authorization tests | Done | Catalogue-driven coverage; proven to detect violations |
| 3 | P0 | 19-003 | AI evaluations | Done | Golden scenarios evaluated against deterministic policy |
| 4 | P0 | 19-004 | Health checks | Done | Liveness and readiness separated; probes time out |
| 5 | P0 | 19-005 | Safe logging | Done | Structured logs, redaction, correlation ids |
| 6 | P0 | 19-006 | Error monitoring | Done | Reporting seam; failures never silently dropped |
| 7 | P1 | 19-007 | Performance | Not Started | |
| 8 | P1 | 19-008 | Recovery/runbook | Not Started | |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Testing, Observability & Production as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 19-E01 — Automated Quality & Observability:** stories 19-001 through 19-006.
- **Epic 19-E07 — Performance & Recovery:** stories 19-007 through 19-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 19-001 — Automated tests
**Epic:** Automated Quality & Observability
**Priority:** P0
**Goal:** Unit/integration/E2E coverage for P0 flows.

**Acceptance criteria**
- Given the household state described by the story, unit/integration/E2E coverage for P0 flows .
- The test/health result is suitable for CI or operational automation and has a deterministic pass/fail signal.
- Critical P0 flows have deterministic automated coverage across unit, integration and end-to-end layers as appropriate.
- Authorization tests explicitly attempt forbidden cross-household, adult-private, child and helper access.
- AI evaluation tests assert tool selection, policy adherence, clarification behavior and notification suppression for golden scenarios.
- Observability uses correlation IDs and structured events so a failed household action can be traced without logging private content.
- Production readiness includes performance, backup/restore and dependency-failure tests against the targets in the NFR document.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 19-002 — Authorization tests
**Epic:** Automated Quality & Observability
**Priority:** P0
**Goal:** Systematically test every role/privacy boundary.

**Acceptance criteria**
- Given the household state described by the story, systematically test every role/privacy boundary .
- The test/health result is suitable for CI or operational automation and has a deterministic pass/fail signal.
- Critical P0 flows have deterministic automated coverage across unit, integration and end-to-end layers as appropriate.
- Authorization tests explicitly attempt forbidden cross-household, adult-private, child and helper access.
- AI evaluation tests assert tool selection, policy adherence, clarification behavior and notification suppression for golden scenarios.
- Observability uses correlation IDs and structured events so a failed household action can be traced without logging private content.
- Production readiness includes performance, backup/restore and dependency-failure tests against the targets in the NFR document.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 19-003 — AI evaluations
**Epic:** Automated Quality & Observability
**Priority:** P0
**Goal:** Test intent, tool choice, policy and escalation.

**Acceptance criteria**
- Given the household state described by the story, test intent, tool choice, policy and escalation .
- Policy evaluation returns a deterministic allow/deny/approval result that can be consumed by APIs and AI tools.
- Critical P0 flows have deterministic automated coverage across unit, integration and end-to-end layers as appropriate.
- Authorization tests explicitly attempt forbidden cross-household, adult-private, child and helper access.
- AI evaluation tests assert tool selection, policy adherence, clarification behavior and notification suppression for golden scenarios.
- Observability uses correlation IDs and structured events so a failed household action can be traced without logging private content.
- Production readiness includes performance, backup/restore and dependency-failure tests against the targets in the NFR document.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 19-004 — Health checks
**Epic:** Automated Quality & Observability
**Priority:** P0
**Goal:** Monitor app, DB, queues and integrations.

**Acceptance criteria**
- Given the household state described by the story, monitor app, DB, queues and integrations .
- The test/health result is suitable for CI or operational automation and has a deterministic pass/fail signal.
- Critical P0 flows have deterministic automated coverage across unit, integration and end-to-end layers as appropriate.
- Authorization tests explicitly attempt forbidden cross-household, adult-private, child and helper access.
- AI evaluation tests assert tool selection, policy adherence, clarification behavior and notification suppression for golden scenarios.
- Observability uses correlation IDs and structured events so a failed household action can be traced without logging private content.
- Production readiness includes performance, backup/restore and dependency-failure tests against the targets in the NFR document.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 19-005 — Safe logging
**Epic:** Automated Quality & Observability
**Priority:** P0
**Goal:** Use structured logs and correlation IDs.

**Acceptance criteria**
- Given the household state described by the story, use structured logs and correlation IDs .
- Critical P0 flows have deterministic automated coverage across unit, integration and end-to-end layers as appropriate.
- Authorization tests explicitly attempt forbidden cross-household, adult-private, child and helper access.
- AI evaluation tests assert tool selection, policy adherence, clarification behavior and notification suppression for golden scenarios.
- Observability uses correlation IDs and structured events so a failed household action can be traced without logging private content.
- Production readiness includes performance, backup/restore and dependency-failure tests against the targets in the NFR document.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 19-006 — Error monitoring
**Epic:** Automated Quality & Observability
**Priority:** P0
**Goal:** Capture actionable failures.

**Acceptance criteria**
- Given the household state described by the story, capture actionable failures .
- Critical P0 flows have deterministic automated coverage across unit, integration and end-to-end layers as appropriate.
- Authorization tests explicitly attempt forbidden cross-household, adult-private, child and helper access.
- AI evaluation tests assert tool selection, policy adherence, clarification behavior and notification suppression for golden scenarios.
- Observability uses correlation IDs and structured events so a failed household action can be traced without logging private content.
- Production readiness includes performance, backup/restore and dependency-failure tests against the targets in the NFR document.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 19-007 — Performance
**Epic:** Performance & Recovery
**Priority:** P1
**Goal:** Test representative load.

**Acceptance criteria**
- Given the household state described by the story, test representative load .
- The test/health result is suitable for CI or operational automation and has a deterministic pass/fail signal.
- Critical P0 flows have deterministic automated coverage across unit, integration and end-to-end layers as appropriate.
- Authorization tests explicitly attempt forbidden cross-household, adult-private, child and helper access.
- AI evaluation tests assert tool selection, policy adherence, clarification behavior and notification suppression for golden scenarios.
- Observability uses correlation IDs and structured events so a failed household action can be traced without logging private content.
- Production readiness includes performance, backup/restore and dependency-failure tests against the targets in the NFR document.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 19-008 — Recovery/runbook
**Epic:** Performance & Recovery
**Priority:** P1
**Goal:** Validate backup/restore and operational runbooks.

**Acceptance criteria**
- Given the household state described by the story, validate backup/restore and operational runbooks .
- Critical P0 flows have deterministic automated coverage across unit, integration and end-to-end layers as appropriate.
- Authorization tests explicitly attempt forbidden cross-household, adult-private, child and helper access.
- AI evaluation tests assert tool selection, policy adherence, clarification behavior and notification suppression for golden scenarios.
- Observability uses correlation IDs and structured events so a failed household action can be traced without logging private content.
- Production readiness includes performance, backup/restore and dependency-failure tests against the targets in the NFR document.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.