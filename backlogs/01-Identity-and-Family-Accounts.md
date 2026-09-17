# WonderHome — Identity & Family Accounts

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 01-001 | Create household and owner | Done | Tenant model + creation path; auth/onboarding UI added (spec gap) |
| 2 | P0 | 01-002 | Invite adult members | Done | Token digests only; expiry, revocation, single use, supersession |
| 3 | P0 | 01-003 | Roles and permissions | Done | Permission catalogue; deny by default for child and helper |
| 4 | P0 | 01-004 | Child profiles | Not Started | |
| 5 | P0 | 01-005 | Personalized views | Not Started | |
| 6 | P1 | 01-006 | Availability | Not Started | |
| 7 | P1 | 01-007 | Preferences | Not Started | |
| 8 | P2 | 01-008 | Helper/service identity | Not Started | |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Identity & Family Accounts as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 01-E01 — Family Identity & Membership:** stories 01-001 through 01-004.
- **Epic 01-E05 — Personalization, Availability & Delegated Access:** stories 01-005 through 01-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 01-001 — Create household and owner
**Epic:** Family Identity & Membership
**Priority:** P0
**Goal:** Create tenant and authenticated Head of Family.

**Acceptance criteria**
- Given the household state described by the story, create tenant and authenticated Head of Family .
- Creating a household establishes the authenticated creator as Head of Family and returns the new household context.
- A second ownership record cannot be created for the same household.
- Household ownership is unique: exactly one Head of Family is authoritative for a household, and ownership changes are audited.
- Every member record is linked to exactly one household and, when applicable, one authenticated profile; cross-household references are rejected.
- Role changes take effect server-side immediately and are covered by positive and negative authorization tests.
- Child and helper identities cannot inherit adult financial, private-conversation or privileged administration access by default.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 01-002 — Invite adult members
**Epic:** Family Identity & Membership
**Priority:** P0
**Goal:** Invite adults through expiring links.

**Acceptance criteria**
- Given the household state described by the story, invite adults through expiring links .
- Invitations expire and can be revoked; accepting an expired/revoked invitation does not create membership.
- Re-sending an invitation invalidates the previous acceptance token.
- Household ownership is unique: exactly one Head of Family is authoritative for a household, and ownership changes are audited.
- Every member record is linked to exactly one household and, when applicable, one authenticated profile; cross-household references are rejected.
- Role changes take effect server-side immediately and are covered by positive and negative authorization tests.
- Child and helper identities cannot inherit adult financial, private-conversation or privileged administration access by default.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 01-003 — Roles and permissions
**Epic:** Family Identity & Membership
**Priority:** P0
**Goal:** Implement Head, Administrator, Adult and Child roles.

**Acceptance criteria**
- Given the household state described by the story, implement Head, Administrator, Adult and Child roles .
- Household ownership is unique: exactly one Head of Family is authoritative for a household, and ownership changes are audited.
- Every member record is linked to exactly one household and, when applicable, one authenticated profile; cross-household references are rejected.
- Role changes take effect server-side immediately and are covered by positive and negative authorization tests.
- Child and helper identities cannot inherit adult financial, private-conversation or privileged administration access by default.
- Invitation, membership and permission changes create safe audit events and never expose invitation secrets in logs.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 01-004 — Child profiles
**Epic:** Family Identity & Membership
**Priority:** P0
**Goal:** Create guardian-controlled child profiles.

**Acceptance criteria**
- Given the household state described by the story, create guardian-controlled child profiles .
- A child can be linked to authorized guardians without requiring the child to become an adult account holder.
- Age changes trigger re-evaluation of age-based permissions.
- Household ownership is unique: exactly one Head of Family is authoritative for a household, and ownership changes are audited.
- Every member record is linked to exactly one household and, when applicable, one authenticated profile; cross-household references are rejected.
- Role changes take effect server-side immediately and are covered by positive and negative authorization tests.
- Child and helper identities cannot inherit adult financial, private-conversation or privileged administration access by default.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 01-005 — Personalized views
**Epic:** Personalization, Availability & Delegated Access
**Priority:** P0
**Goal:** Show each member only relevant authorized information/actions.

**Acceptance criteria**
- Given the household state described by the story, show each member only relevant authorized information/actions .
- The same household record set produces different views according to member role, responsibility and privacy scope.
- Household ownership is unique: exactly one Head of Family is authoritative for a household, and ownership changes are audited.
- Every member record is linked to exactly one household and, when applicable, one authenticated profile; cross-household references are rejected.
- Role changes take effect server-side immediately and are covered by positive and negative authorization tests.
- Child and helper identities cannot inherit adult financial, private-conversation or privileged administration access by default.
- Invitation, membership and permission changes create safe audit events and never expose invitation secrets in logs.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 01-006 — Availability
**Epic:** Personalization, Availability & Delegated Access
**Priority:** P1
**Goal:** Capture work, school, home and exception availability.

**Acceptance criteria**
- Given the household state described by the story, capture work, school, home and exception availability .
- Availability supports recurring windows plus date-specific exceptions and is queryable by the planner.
- Household ownership is unique: exactly one Head of Family is authoritative for a household, and ownership changes are audited.
- Every member record is linked to exactly one household and, when applicable, one authenticated profile; cross-household references are rejected.
- Role changes take effect server-side immediately and are covered by positive and negative authorization tests.
- Child and helper identities cannot inherit adult financial, private-conversation or privileged administration access by default.
- Invitation, membership and permission changes create safe audit events and never expose invitation secrets in logs.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 01-007 — Preferences
**Epic:** Personalization, Availability & Delegated Access
**Priority:** P1
**Goal:** Capture member and household preferences.

**Acceptance criteria**
- Given the household state described by the story, capture member and household preferences .
- Preferences retain source and scope so household preferences are not confused with an individual member preference.
- Household ownership is unique: exactly one Head of Family is authoritative for a household, and ownership changes are audited.
- Every member record is linked to exactly one household and, when applicable, one authenticated profile; cross-household references are rejected.
- Role changes take effect server-side immediately and are covered by positive and negative authorization tests.
- Child and helper identities cannot inherit adult financial, private-conversation or privileged administration access by default.
- Invitation, membership and permission changes create safe audit events and never expose invitation secrets in logs.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 01-008 — Helper/service identity
**Epic:** Personalization, Availability & Delegated Access
**Priority:** P2
**Goal:** Support limited helper accounts.

**Acceptance criteria**
- Given the household state described by the story, support limited helper accounts .
- Normal work does not create a completion notification or require app interaction from the helper.
- Household ownership is unique: exactly one Head of Family is authoritative for a household, and ownership changes are audited.
- Every member record is linked to exactly one household and, when applicable, one authenticated profile; cross-household references are rejected.
- Role changes take effect server-side immediately and are covered by positive and negative authorization tests.
- Child and helper identities cannot inherit adult financial, private-conversation or privileged administration access by default.
- Invitation, membership and permission changes create safe audit events and never expose invitation secrets in logs.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.