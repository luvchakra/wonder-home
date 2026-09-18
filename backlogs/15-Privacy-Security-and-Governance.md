# WonderHome — Privacy, Security & Governance

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 15-001 | Threat model | Done | security/THREAT-MODEL.md; revised as surfaces are added |
| 2 | P0 | 15-002 | Tenant isolation | Done | Catalogue-driven coverage test; proven to detect violations |
| 3 | P0 | 15-003 | RBAC/privacy scopes | Done | Permission catalogue plus server-side view filtering |
| 4 | P0 | 15-004 | Encryption/secrets | Done | Secret lint; redaction; HSTS and secure cookies |
| 5 | P0 | 15-005 | AI privacy | Done | Consent gate before assembly; context minimised and pseudonymised; retry is idempotent |
| 6 | P0 | 15-006 | Audit | Done | Catalogue with a coverage test; nine unrecorded actions closed; household-facing trail |
| 7 | P0 | 15-007 | Privacy Center | Not Started | |
| 8 | P0 | 15-008 | Security testing | Not Started | |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Privacy, Security & Governance as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 15-E01 — Security Foundation & Data Protection:** stories 15-001 through 15-004.
- **Epic 15-E05 — AI Privacy, Audit, Privacy Center & Security Testing:** stories 15-005 through 15-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 15-001 — Threat model
**Epic:** Security Foundation & Data Protection
**Priority:** P0
**Goal:** Model web, API, mobile, integration and AI threats.

**Acceptance criteria**
- Given the household state described by the story, model web, API, mobile, integration and AI threats .
- Contract tests validate the documented request/response behavior against the running route.
- All household data access is protected by tenant isolation plus application authorization; RLS policies are treated as defense-in-depth.
- Authentication/session, MFA and step-up controls protect privileged, financial, export and deletion actions.
- AI context is minimized and provider routing checks the configured data-use/consent policy before sensitive information is transmitted.
- Security logs and telemetry exclude secrets, raw tokens and unnecessary private household content while preserving forensic usefulness.
- P0 security tests cover horizontal privilege escalation, child/helper boundaries, injection, SSRF, session abuse and prompt-injection tool misuse.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 15-002 — Tenant isolation
**Epic:** Security Foundation & Data Protection
**Priority:** P0
**Goal:** Enforce strict household data isolation.

**Acceptance criteria**
- Given the household state described by the story, enforce strict household data isolation .
- All household data access is protected by tenant isolation plus application authorization; RLS policies are treated as defense-in-depth.
- Authentication/session, MFA and step-up controls protect privileged, financial, export and deletion actions.
- AI context is minimized and provider routing checks the configured data-use/consent policy before sensitive information is transmitted.
- Security logs and telemetry exclude secrets, raw tokens and unnecessary private household content while preserving forensic usefulness.
- P0 security tests cover horizontal privilege escalation, child/helper boundaries, injection, SSRF, session abuse and prompt-injection tool misuse.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 15-003 — RBAC/privacy scopes
**Epic:** Security Foundation & Data Protection
**Priority:** P0
**Goal:** Protect adult-private, child and helper data.

**Acceptance criteria**
- Given the household state described by the story, protect adult-private, child and helper data .
- Normal work does not create a completion notification or require app interaction from the helper.
- All household data access is protected by tenant isolation plus application authorization; RLS policies are treated as defense-in-depth.
- Authentication/session, MFA and step-up controls protect privileged, financial, export and deletion actions.
- AI context is minimized and provider routing checks the configured data-use/consent policy before sensitive information is transmitted.
- Security logs and telemetry exclude secrets, raw tokens and unnecessary private household content while preserving forensic usefulness.
- P0 security tests cover horizontal privilege escalation, child/helper boundaries, injection, SSRF, session abuse and prompt-injection tool misuse.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 15-004 — Encryption/secrets
**Epic:** Security Foundation & Data Protection
**Priority:** P0
**Goal:** Use secure transport, encryption and managed secrets.

**Acceptance criteria**
- Given the household state described by the story, use secure transport, encryption and managed secrets .
- All household data access is protected by tenant isolation plus application authorization; RLS policies are treated as defense-in-depth.
- Authentication/session, MFA and step-up controls protect privileged, financial, export and deletion actions.
- AI context is minimized and provider routing checks the configured data-use/consent policy before sensitive information is transmitted.
- Security logs and telemetry exclude secrets, raw tokens and unnecessary private household content while preserving forensic usefulness.
- P0 security tests cover horizontal privilege escalation, child/helper boundaries, injection, SSRF, session abuse and prompt-injection tool misuse.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 15-005 — AI privacy
**Epic:** AI Privacy, Audit, Privacy Center & Security Testing
**Priority:** P0
**Goal:** Minimize AI context and control provider data use.

**Acceptance criteria**
- Given the household state described by the story, minimize AI context and control provider data use .
- The composer supports retry without duplicating the underlying action.
- All household data access is protected by tenant isolation plus application authorization; RLS policies are treated as defense-in-depth.
- Authentication/session, MFA and step-up controls protect privileged, financial, export and deletion actions.
- AI context is minimized and provider routing checks the configured data-use/consent policy before sensitive information is transmitted.
- Security logs and telemetry exclude secrets, raw tokens and unnecessary private household content while preserving forensic usefulness.
- P0 security tests cover horizontal privilege escalation, child/helper boundaries, injection, SSRF, session abuse and prompt-injection tool misuse.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 15-006 — Audit
**Epic:** AI Privacy, Audit, Privacy Center & Security Testing
**Priority:** P0
**Goal:** Record sensitive actions without secrets/raw private content.

**Acceptance criteria**
- Given the household state described by the story, record sensitive actions without secrets/raw private content .
- All household data access is protected by tenant isolation plus application authorization; RLS policies are treated as defense-in-depth.
- Authentication/session, MFA and step-up controls protect privileged, financial, export and deletion actions.
- AI context is minimized and provider routing checks the configured data-use/consent policy before sensitive information is transmitted.
- Security logs and telemetry exclude secrets, raw tokens and unnecessary private household content while preserving forensic usefulness.
- P0 security tests cover horizontal privilege escalation, child/helper boundaries, injection, SSRF, session abuse and prompt-injection tool misuse.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 15-007 — Privacy Center
**Epic:** AI Privacy, Audit, Privacy Center & Security Testing
**Priority:** P0
**Goal:** Support export, deletion, consent and retention.

**Acceptance criteria**
- Given the household state described by the story, support export, deletion, consent and retention .
- All household data access is protected by tenant isolation plus application authorization; RLS policies are treated as defense-in-depth.
- Authentication/session, MFA and step-up controls protect privileged, financial, export and deletion actions.
- AI context is minimized and provider routing checks the configured data-use/consent policy before sensitive information is transmitted.
- Security logs and telemetry exclude secrets, raw tokens and unnecessary private household content while preserving forensic usefulness.
- P0 security tests cover horizontal privilege escalation, child/helper boundaries, injection, SSRF, session abuse and prompt-injection tool misuse.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 15-008 — Security testing
**Epic:** AI Privacy, Audit, Privacy Center & Security Testing
**Priority:** P0
**Goal:** Test auth, injection, SSRF, sessions, uploads and prompt
injection.

**Acceptance criteria**
- Given the household state described by the story, test auth, injection, SSRF, sessions, uploads and prompt
injection .
- The test/health result is suitable for CI or operational automation and has a deterministic pass/fail signal.
- All household data access is protected by tenant isolation plus application authorization; RLS policies are treated as defense-in-depth.
- Authentication/session, MFA and step-up controls protect privileged, financial, export and deletion actions.
- AI context is minimized and provider routing checks the configured data-use/consent policy before sensitive information is transmitted.
- Security logs and telemetry exclude secrets, raw tokens and unnecessary private household content while preserving forensic usefulness.
- P0 security tests cover horizontal privilege escalation, child/helper boundaries, injection, SSRF, session abuse and prompt-injection tool misuse.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.