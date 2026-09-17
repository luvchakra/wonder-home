# WonderHome — API & Developer Platform

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 18-001 | Versioned API | Done | Established in 00-007; /api/v1 with correlation ids |
| 2 | P0 | 18-002 | Schemas/errors | Done | Zod validation and one error envelope |
| 3 | P0 | 18-003 | Auth/authorization | Done | requireUser plus household scope; RLS behind it; authentication settled before the body is read |
| 4 | P0 | 18-004 | Idempotency | Done | Idempotency-Key replay with request fingerprinting |
| 5 | P0 | 18-005 | OpenAPI | Done | Generated from the route schemas, served at /api/v1/openapi; E2E derives the endpoint list from disk so it cannot go stale |
| 6 | P0 | 18-006 | Audit hooks | Done | recordAuditEvent with redaction; never fails the request |
| 7 | P1 | 18-007 | Webhooks/events | Not Started | |
| 8 | P2 | 18-008 | Developer platform | Not Started | |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement API & Developer Platform as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 18-E01 — API Contract & Security:** stories 18-001 through 18-006.
- **Epic 18-E07 — Events & Developer Access:** stories 18-007 through 18-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 18-001 — Versioned API
**Epic:** API Contract & Security
**Priority:** P0
**Goal:** Expose /api/v1 for all capabilities.

**Acceptance criteria**
- Given the household state described by the story, expose /api/v1 for all capabilities .
- Contract tests validate the documented request/response behavior against the running route.
- Every API route declares actor, household scope, permission, validation schema and response contract.
- Business rules are implemented in reusable services that can be called by both UI handlers and governed AI tools.
- Side-effect endpoints support idempotency and safe retries, with deterministic behavior under concurrent requests.
- OpenAPI stays synchronized with implementation and CI flags undocumented or breaking contract changes.
- API performance and error behavior are measured against the NFR targets without exposing internal stack traces.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 18-002 — Schemas/errors
**Epic:** API Contract & Security
**Priority:** P0
**Goal:** Standardize validation, response and error envelopes.

**Acceptance criteria**
- Given the household state described by the story, standardize validation, response and error envelopes .
- Every API route declares actor, household scope, permission, validation schema and response contract.
- Business rules are implemented in reusable services that can be called by both UI handlers and governed AI tools.
- Side-effect endpoints support idempotency and safe retries, with deterministic behavior under concurrent requests.
- OpenAPI stays synchronized with implementation and CI flags undocumented or breaking contract changes.
- API performance and error behavior are measured against the NFR targets without exposing internal stack traces.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 18-003 — Auth/authorization
**Epic:** API Contract & Security
**Priority:** P0
**Goal:** Protect every endpoint with identity and scope checks.

**Acceptance criteria**
- Given the household state described by the story, protect every endpoint with identity and scope checks .
- Every API route declares actor, household scope, permission, validation schema and response contract.
- Business rules are implemented in reusable services that can be called by both UI handlers and governed AI tools.
- Side-effect endpoints support idempotency and safe retries, with deterministic behavior under concurrent requests.
- OpenAPI stays synchronized with implementation and CI flags undocumented or breaking contract changes.
- API performance and error behavior are measured against the NFR targets without exposing internal stack traces.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 18-004 — Idempotency
**Epic:** API Contract & Security
**Priority:** P0
**Goal:** Support safe retries for side effects.

**Acceptance criteria**
- Given the household state described by the story, support safe retries for side effects .
- Contract tests validate the documented request/response behavior against the running route.
- Every API route declares actor, household scope, permission, validation schema and response contract.
- Business rules are implemented in reusable services that can be called by both UI handlers and governed AI tools.
- Side-effect endpoints support idempotency and safe retries, with deterministic behavior under concurrent requests.
- OpenAPI stays synchronized with implementation and CI flags undocumented or breaking contract changes.
- API performance and error behavior are measured against the NFR targets without exposing internal stack traces.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 18-005 — OpenAPI
**Epic:** API Contract & Security
**Priority:** P0
**Goal:** Maintain generated/checked OpenAPI.

**Acceptance criteria**
- Given the household state described by the story, maintain generated/checked OpenAPI .
- Contract tests validate the documented request/response behavior against the running route.
- Every API route declares actor, household scope, permission, validation schema and response contract.
- Business rules are implemented in reusable services that can be called by both UI handlers and governed AI tools.
- Side-effect endpoints support idempotency and safe retries, with deterministic behavior under concurrent requests.
- OpenAPI stays synchronized with implementation and CI flags undocumented or breaking contract changes.
- API performance and error behavior are measured against the NFR targets without exposing internal stack traces.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 18-006 — Audit hooks
**Epic:** API Contract & Security
**Priority:** P0
**Goal:** Emit relevant audit events.

**Acceptance criteria**
- Given the household state described by the story, emit relevant audit events .
- The event remains linked to participants and affected household schedule constraints.
- Every API route declares actor, household scope, permission, validation schema and response contract.
- Business rules are implemented in reusable services that can be called by both UI handlers and governed AI tools.
- Side-effect endpoints support idempotency and safe retries, with deterministic behavior under concurrent requests.
- OpenAPI stays synchronized with implementation and CI flags undocumented or breaking contract changes.
- API performance and error behavior are measured against the NFR targets without exposing internal stack traces.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 18-007 — Webhooks/events
**Epic:** Events & Developer Access
**Priority:** P1
**Goal:** Provide signed versioned outbound events.

**Acceptance criteria**
- Given the household state described by the story, provide signed versioned outbound events .
- The event remains linked to participants and affected household schedule constraints.
- Every API route declares actor, household scope, permission, validation schema and response contract.
- Business rules are implemented in reusable services that can be called by both UI handlers and governed AI tools.
- Side-effect endpoints support idempotency and safe retries, with deterministic behavior under concurrent requests.
- OpenAPI stays synchronized with implementation and CI flags undocumented or breaking contract changes.
- API performance and error behavior are measured against the NFR targets without exposing internal stack traces.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 18-008 — Developer platform
**Epic:** Events & Developer Access
**Priority:** P2
**Goal:** Provide scoped partner keys and sandbox.

**Acceptance criteria**
- Given the household state described by the story, provide scoped partner keys and sandbox .
- Every API route declares actor, household scope, permission, validation schema and response contract.
- Business rules are implemented in reusable services that can be called by both UI handlers and governed AI tools.
- Side-effect endpoints support idempotency and safe retries, with deterministic behavior under concurrent requests.
- OpenAPI stays synchronized with implementation and CI flags undocumented or breaking contract changes.
- API performance and error behavior are measured against the NFR targets without exposing internal stack traces.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.