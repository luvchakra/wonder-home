# WonderHome — Platform Admin & Operations

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 16-001 | Separate admin boundary | Done | Separate boundary; household roles confer nothing here |
| 2 | P0 | 16-002 | Admin roles | Done | Platform capabilities per role, tested |
| 3 | P0 | 16-003 | Operations dashboard | Done | Aggregate counts behind the boundary |
| 4 | P0 | 16-004 | Support access | Done | Grants bounded to 24h; household can read them |
| 5 | P0 | 16-005 | Subscription administration | Done | operator/owner only; reason-coded, audited, reuses 20-004's changePlan |
| 6 | P0 | 16-006 | AI operations | Done | Failed-run + tool-call monitoring; reuses module 14's prompt-free schema |
| 7 | P1 | 16-007 | Privacy requests | Not Started | |
| 8 | P1 | 16-008 | Feature flags/audit | Done | `feature-flags.ts`: a reason-coded, audited `setHouseholdFeatureFlag` (operator/owner only, following 16-005's exact shape) turns a staged capability on or off for one household; a household reads its own flags via RLS, matching support-access grants' "the family this concerns can see it" precedent. `audit-log.ts`: `listPlatformAuditEvents` widens who may read the already-redacted `audit_events` rows fleet-wide, never what is safe to show |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Platform Admin & Operations as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 16-E01 — Privileged Platform Operations:** stories 16-001 through 16-004.
- **Epic 16-E05 — Plans, AI Operations, Privacy & Feature Controls:** stories 16-005 through 16-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 16-001 — Separate admin boundary
**Epic:** Privileged Platform Operations
**Priority:** P0
**Goal:** Build /platform-admin with server-side authorization.

**Acceptance criteria**
- Given the household state described by the story, build /platform-admin with server-side authorization .
- /platform-admin is a separate authorization boundary and every admin API verifies platform-admin role server-side.
- Administrative views default to privacy-minimized aggregate data; household content requires explicit, reason-coded and time-boxed support access.
- Admin actions such as plan changes, feature flags and support access are audited with actor, reason, target and timestamp.
- Platform roles are least-privilege and cannot be escalated through client-side parameters or hidden UI routes.
- Operational dashboards distinguish system health from household content and continue to work when individual integrations are unavailable.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 16-002 — Admin roles
**Epic:** Privileged Platform Operations
**Priority:** P0
**Goal:** Implement Super Admin, Support, Trust & Safety, Billing,
Operations, Auditor.

**Acceptance criteria**
- Given the household state described by the story, implement Super Admin, Support, Trust & Safety, Billing,
Operations, Auditor .
- A payment retry cannot create a second provider transaction for the same approved intent.
- /platform-admin is a separate authorization boundary and every admin API verifies platform-admin role server-side.
- Administrative views default to privacy-minimized aggregate data; household content requires explicit, reason-coded and time-boxed support access.
- Admin actions such as plan changes, feature flags and support access are audited with actor, reason, target and timestamp.
- Platform roles are least-privilege and cannot be escalated through client-side parameters or hidden UI routes.
- Operational dashboards distinguish system health from household content and continue to work when individual integrations are unavailable.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 16-003 — Operations dashboard
**Epic:** Privileged Platform Operations
**Priority:** P0
**Goal:** Show aggregate households, AI runs, jobs, integrations and
alerts.

**Acceptance criteria**
- Given the household state described by the story, show aggregate households, AI runs, jobs, integrations and
alerts .
- /platform-admin is a separate authorization boundary and every admin API verifies platform-admin role server-side.
- Administrative views default to privacy-minimized aggregate data; household content requires explicit, reason-coded and time-boxed support access.
- Admin actions such as plan changes, feature flags and support access are audited with actor, reason, target and timestamp.
- Platform roles are least-privilege and cannot be escalated through client-side parameters or hidden UI routes.
- Operational dashboards distinguish system health from household content and continue to work when individual integrations are unavailable.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 16-004 — Support access
**Epic:** Privileged Platform Operations
**Priority:** P0
**Goal:** Provide reason-coded, time-boxed household access.

**Acceptance criteria**
- Given the household state described by the story, provide reason-coded, time-boxed household access .
- /platform-admin is a separate authorization boundary and every admin API verifies platform-admin role server-side.
- Administrative views default to privacy-minimized aggregate data; household content requires explicit, reason-coded and time-boxed support access.
- Admin actions such as plan changes, feature flags and support access are audited with actor, reason, target and timestamp.
- Platform roles are least-privilege and cannot be escalated through client-side parameters or hidden UI routes.
- Operational dashboards distinguish system health from household content and continue to work when individual integrations are unavailable.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 16-005 — Subscription administration
**Epic:** Plans, AI Operations, Privacy & Feature Controls
**Priority:** P0
**Goal:** Manage plans and entitlements.

**Acceptance criteria**
- Given the household state described by the story, manage plans and entitlements .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- /platform-admin is a separate authorization boundary and every admin API verifies platform-admin role server-side.
- Administrative views default to privacy-minimized aggregate data; household content requires explicit, reason-coded and time-boxed support access.
- Admin actions such as plan changes, feature flags and support access are audited with actor, reason, target and timestamp.
- Platform roles are least-privilege and cannot be escalated through client-side parameters or hidden UI routes.
- Operational dashboards distinguish system health from household content and continue to work when individual integrations are unavailable.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 16-006 — AI operations
**Epic:** Plans, AI Operations, Privacy & Feature Controls
**Priority:** P0
**Goal:** Monitor agent failures without default raw prompts.

**Acceptance criteria**
- Given the household state described by the story, monitor agent failures without default raw prompts .
- The agent execution record identifies the tools used and final outcome without storing unnecessary raw model context.
- /platform-admin is a separate authorization boundary and every admin API verifies platform-admin role server-side.
- Administrative views default to privacy-minimized aggregate data; household content requires explicit, reason-coded and time-boxed support access.
- Admin actions such as plan changes, feature flags and support access are audited with actor, reason, target and timestamp.
- Platform roles are least-privilege and cannot be escalated through client-side parameters or hidden UI routes.
- Operational dashboards distinguish system health from household content and continue to work when individual integrations are unavailable.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 16-007 — Privacy requests
**Epic:** Plans, AI Operations, Privacy & Feature Controls
**Priority:** P1
**Goal:** Manage export/delete/consent workflows.

**Acceptance criteria**
- Given the household state described by the story, manage export/delete/consent workflows .
- /platform-admin is a separate authorization boundary and every admin API verifies platform-admin role server-side.
- Administrative views default to privacy-minimized aggregate data; household content requires explicit, reason-coded and time-boxed support access.
- Admin actions such as plan changes, feature flags and support access are audited with actor, reason, target and timestamp.
- Platform roles are least-privilege and cannot be escalated through client-side parameters or hidden UI routes.
- Operational dashboards distinguish system health from household content and continue to work when individual integrations are unavailable.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 16-008 — Feature flags/audit
**Epic:** Plans, AI Operations, Privacy & Feature Controls
**Priority:** P1
**Goal:** Manage flags and audit logs.

**Acceptance criteria**
- Given the household state described by the story, manage flags and audit logs .
- /platform-admin is a separate authorization boundary and every admin API verifies platform-admin role server-side.
- Administrative views default to privacy-minimized aggregate data; household content requires explicit, reason-coded and time-boxed support access.
- Admin actions such as plan changes, feature flags and support access are audited with actor, reason, target and timestamp.
- Platform roles are least-privilege and cannot be escalated through client-side parameters or hidden UI routes.
- Operational dashboards distinguish system health from household content and continue to work when individual integrations are unavailable.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.