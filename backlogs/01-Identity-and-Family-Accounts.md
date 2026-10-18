# WonderHome — Identity & Family Accounts

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 01-001 | Create household and owner | Done | Tenant model + creation path; auth/onboarding UI added (spec gap) |
| 2 | P0 | 01-002 | Invite adult members | Done | Token digests only; expiry, revocation, single use, supersession |
| 3 | P0 | 01-003 | Roles and permissions | Done | Permission catalogue; deny by default for child and helper |
| 4 | P0 | 01-004 | Child profiles | Done | No account needed; guardianship links; age bands derived on read |
| 5 | P0 | 01-005 | Personalized views | Done | Permission-filtered on the server, not hidden in the client |
| 6 | P1 | 01-006 | Availability | Done | Pattern plus exceptions; an absence never rewrites a schedule |
| 7 | P1 | 01-007 | Preferences | Done | Already built as 04-007/04-008: `memories` (scope, source_type, confidence, status), captured via conversation, corrected via Certification |
| 8 | P2 | 01-008 | Helper/service identity | Done | Limited helper accounts already existed end-to-end (invitations, `ROLE_DEFAULTS.helper: []`, `/househelper` UI); the real gap was no RLS-level proof of the limits. New `scripts/test-helper-identity-rls.mjs` asserts a `member_type='helper'` row is refused `obligations` (finance) and another member's private conversation, cannot grant a role or create an invitation, but can read/write its own `member_availability` and read (not write) `household_roles` |
| 9 | P1 | 01-009 | Settings & Profile consolidation | Done | One editor per setting: `/settings` holds the profile and opens each setting's own page, grouped Personal / AI & privacy / Connected services / Plan & usage / Account. The AI key and data-use policy moved to `/settings/ai`, and the plan and usage to `/settings/plan` (the payment return lands there). Your own profile on Family/Househelper links to Settings; an Admin still edits other people there. The unbuilt 2FA row, the Export/Delete rows (Privacy has them) and Help (avatar menu and More) are gone from Settings |
| 10 | P0 | 01-010 | Every member signs in as themselves | Done | An Admin records a member's sign-in email in their details (`household_member_emails`, Admin write, Admin/self read). A verified sign-in with that email, by password, Google or any provider, links the account to the member with the role they already have (`wh.claim_members_by_email`, run at sign-in, in the OAuth callback and whenever a signed-in person has no household). Invite on a member without an account makes a single-use, 7-day link (child invitations allowed only for the child on record; never creates a child), passed on by Send email (the Admin's own mail app), Share (the phone's share sheet) or Copy. Migration applied live; DB-tested (`scripts/test-member-sign-in-rls.mjs`). Browser-checked 2026-10-18 against the live project at 360px and 1280px with QA accounts (cleaned up afterwards): an Admin set a child's sign-in email in Family; that child then signed in by password and landed straight in the household on the child Home, with Bills refused and Members and Plan read-only; Invite made a link (Send email opened a filled-in mail, Copy worked; Share appears only where the browser has a share sheet); a helper opened her link signed out, signed in, accepted and became the helper already on record, with no second member |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Identity & Family Accounts as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 01-E01 — Family Identity & Membership:** stories 01-001 through 01-004.
- **Epic 01-E05 — Personalization, Availability & Delegated Access:** stories 01-005 through 01-009.

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

**Where this actually lives.** Module 04 built the mechanism this story asks
for, under its own story numbers: `memories` (`packages/core/src/conversation/memory.ts`,
`conversation/repository.ts`) holds every preference with a `scope`
(`household` | `member`), a `source_type` (`setup` | `conversation` |
`integration` | `observed`) and a `status` that keeps an inference from
overwriting something a person confirmed — exactly the "source and scope"
distinction below. A member states a preference to the assistant (the
product's one conversation engine, not a form); Certification (module 05)
is where the household reads and corrects what was captured. Tested at both
the pure-function level (`memory.test.ts`, 14 cases covering scope and
reconciliation) and against real Postgres (`scripts/test-conversation-rls.mjs`).
This row was closed to reflect that, not to duplicate it.

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

### Story 01-009 — Settings & Profile consolidation
**Epic:** 01-E05
**Priority:** P1
**Goal:** Every setting has exactly one canonical editor and one source of truth, reached from one Settings & Profile page.

**Acceptance criteria**
- `/settings` shows the profile (editable, with the photo) and groups every other setting into Personal, AI & privacy, Connected services, Plan & usage and Account, each row a chevron that opens the setting's own page, direction-aware for right-to-left.
- Only rows this person can use appear; nothing unbuilt is presented as available.
- The household AI key and the AI data-use policy are edited only on `/settings/ai`; the plan only on `/settings/plan`. Privacy links to the AI page rather than keeping a second editor.
- A person's own profile is edited only in Settings; other screens show it and link there. An Admin editing someone else stays in Family/Househelper.
- Existing server-side authorization is unchanged.

### Story 01-010 — Every member signs in as themselves
**Epic:** 01-E05
**Priority:** P0
**Goal:** Each family member — adult, child or househelper — signs in with their own account and lands in the household with the role the family gave them.

**Acceptance criteria**
- An Admin records a member's sign-in email in their details; only Admins and that member can read it.
- A sign-in whose verified email matches — password, Google or any provider — links the account to that member, keeping their role; an unverified email links nothing, a removed member is not brought back.
- An Admin can Invite a member without an account: a single-use link that expires, shared by email, the share sheet or a copy. It links to that member with their own role and never creates a child.
- What a member sees and may do is decided by their role, as for every other member.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.