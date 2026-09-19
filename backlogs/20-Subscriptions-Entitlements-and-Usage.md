# WonderHome — Subscriptions, Entitlements & Usage

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 20-001 | Plan model | Done | free/pro/max seeded as data; changing a plan is a migration |
| 2 | P0 | 20-002 | Entitlements | Done | one server-side entitlement service; hiding a feature is never the control |
| 3 | P0 | 20-003 | Usage metering | Done | atomic counters proven against 20 concurrent sessions |
| 4 | P0 | 20-004 | Upgrade/downgrade | Done | A change writes one row and never a household record; consequences shown and re-derived before applying; audited |
| 5 | P1 | 20-005 | Usage UI | Done | Settings shows used/limit per metered feature, from the same counter `consume` enforces against |
| 6 | P1 | 20-006 | Billing abstraction | Not Started | |
| 7 | P2 | 20-007 | Quota automation | Not Started | |
| 8 | P2 | 20-008 | Plan experiments | Not Started | |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Subscriptions, Entitlements & Usage as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 20-E01 — Plans, Entitlements & Metering:** stories 20-001 through 20-004.
- **Epic 20-E05 — Billing, Quotas & Experiments:** stories 20-005 through 20-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 20-001 — Plan model
**Epic:** Plans, Entitlements & Metering
**Priority:** P0
**Goal:** Implement Free, Pro and Max as configurable plans.

**Acceptance criteria**
- Given the household state described by the story, implement Free, Pro and Max as configurable plans .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Plan features and limits are data-driven and checked server-side through one entitlement service.
- Downgrades never delete household data; unavailable capabilities fail gracefully and preserve existing records.
- Usage counters are atomic and scoped by household, feature and billing period so concurrent requests cannot bypass quotas.
- AI and premium feature usage can be measured without retaining raw private conversation content.
- Plan/entitlement changes are auditable and do not require hard-coded pricing logic in individual domain modules.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 20-002 — Entitlements
**Epic:** Plans, Entitlements & Metering
**Priority:** P0
**Goal:** Expose server-side feature checks.

**Acceptance criteria**
- Given the household state described by the story, expose server-side feature checks .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Plan features and limits are data-driven and checked server-side through one entitlement service.
- Downgrades never delete household data; unavailable capabilities fail gracefully and preserve existing records.
- Usage counters are atomic and scoped by household, feature and billing period so concurrent requests cannot bypass quotas.
- AI and premium feature usage can be measured without retaining raw private conversation content.
- Plan/entitlement changes are auditable and do not require hard-coded pricing logic in individual domain modules.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 20-003 — Usage metering
**Epic:** Plans, Entitlements & Metering
**Priority:** P0
**Goal:** Track AI/feature usage by period.

**Acceptance criteria**
- Given the household state described by the story, track AI/feature usage by period .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Plan features and limits are data-driven and checked server-side through one entitlement service.
- Downgrades never delete household data; unavailable capabilities fail gracefully and preserve existing records.
- Usage counters are atomic and scoped by household, feature and billing period so concurrent requests cannot bypass quotas.
- AI and premium feature usage can be measured without retaining raw private conversation content.
- Plan/entitlement changes are auditable and do not require hard-coded pricing logic in individual domain modules.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 20-004 — Upgrade/downgrade
**Epic:** Plans, Entitlements & Metering
**Priority:** P0
**Goal:** Change plans without data loss.

**Acceptance criteria**
- Given the household state described by the story, change plans without data loss .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Plan features and limits are data-driven and checked server-side through one entitlement service.
- Downgrades never delete household data; unavailable capabilities fail gracefully and preserve existing records.
- Usage counters are atomic and scoped by household, feature and billing period so concurrent requests cannot bypass quotas.
- AI and premium feature usage can be measured without retaining raw private conversation content.
- Plan/entitlement changes are auditable and do not require hard-coded pricing logic in individual domain modules.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 20-005 — Usage UI
**Epic:** Billing, Quotas & Experiments
**Priority:** P1
**Goal:** Show relevant usage and limits.

**Acceptance criteria**
- Given the household state described by the story, show relevant usage and limits .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Plan features and limits are data-driven and checked server-side through one entitlement service.
- Downgrades never delete household data; unavailable capabilities fail gracefully and preserve existing records.
- Usage counters are atomic and scoped by household, feature and billing period so concurrent requests cannot bypass quotas.
- AI and premium feature usage can be measured without retaining raw private conversation content.
- Plan/entitlement changes are auditable and do not require hard-coded pricing logic in individual domain modules.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 20-006 — Billing abstraction
**Epic:** Billing, Quotas & Experiments
**Priority:** P1
**Goal:** Provider-neutral subscription interfaces.

**Acceptance criteria**
- Given the household state described by the story, provider-neutral subscription interfaces .
- A payment retry cannot create a second provider transaction for the same approved intent.
- Plan features and limits are data-driven and checked server-side through one entitlement service.
- Downgrades never delete household data; unavailable capabilities fail gracefully and preserve existing records.
- Usage counters are atomic and scoped by household, feature and billing period so concurrent requests cannot bypass quotas.
- AI and premium feature usage can be measured without retaining raw private conversation content.
- Plan/entitlement changes are auditable and do not require hard-coded pricing logic in individual domain modules.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 20-007 — Quota automation
**Epic:** Billing, Quotas & Experiments
**Priority:** P2
**Goal:** Support configurable fair-use and burst policies.

**Acceptance criteria**
- Given the household state described by the story, support configurable fair-use and burst policies .
- Plan features and limits are data-driven and checked server-side through one entitlement service.
- Downgrades never delete household data; unavailable capabilities fail gracefully and preserve existing records.
- Usage counters are atomic and scoped by household, feature and billing period so concurrent requests cannot bypass quotas.
- AI and premium feature usage can be measured without retaining raw private conversation content.
- Plan/entitlement changes are auditable and do not require hard-coded pricing logic in individual domain modules.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 20-008 — Plan experiments
**Epic:** Billing, Quotas & Experiments
**Priority:** P2
**Goal:** Support controlled entitlement experiments.

**Acceptance criteria**
- Given the household state described by the story, support controlled entitlement experiments .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Plan features and limits are data-driven and checked server-side through one entitlement service.
- Downgrades never delete household data; unavailable capabilities fail gracefully and preserve existing records.
- Usage counters are atomic and scoped by household, feature and billing period so concurrent requests cannot bypass quotas.
- AI and premium feature usage can be measured without retaining raw private conversation content.
- Plan/entitlement changes are auditable and do not require hard-coded pricing logic in individual domain modules.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.