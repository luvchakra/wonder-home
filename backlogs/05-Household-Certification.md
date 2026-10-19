# WonderHome — Household Certification & Understanding

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 05-001 | Certification overview | Done | Source on every claim; coverage counted, never estimated |
| 2 | P0 | 05-002 | Source attribution | Done | Source on every claim; coverage counted, never estimated |
| 3 | P0 | 05-003 | Confirm | Done | Source on every claim; coverage counted, never estimated |
| 4 | P0 | 05-004 | Correct/remove | Done | Source on every claim; coverage counted, never estimated |
| 5 | P0 | 05-005 | Risk prioritization | Done | Source on every claim; coverage counted, never estimated |
| 6 | P0 | 05-006 | Actionable certification alerts | Done | Source on every claim; coverage counted, never estimated |
| 7 | P1 | 05-007 | Certification history | Done | Reads the append-only `certification_reviews` trail `reviewCertificationAction` already wrote; a new History tab shows who reviewed what, the decision and the before/after claim, each row scoped by the RLS the item itself carries |
| 8 | P2 | 05-008 | Certification health | Done | `certificationHealth` breaks `summarize()`'s single percentage down by risk level, so a household reading "90% understood" cannot be shown that number while the one high-risk belief driving the missing 10% sits unreviewed. Wired into `/certification`'s own summary card: the explanation line appears only when a high or critical item actually needs review, staying silent (rule: normal is silent) the rest of the time |
| 9 | P1 | 05-009 | Review many at once | Done | The owner, 2026-10-18 (PR #236): HomeBrain's list has Select; ticked items (or Select all) are confirmed, removed (after asking) or left for later together. Each goes through the same `reviewItem` path as one item's own buttons, so History, the memory HomeBrain reads and correction evidence are as if decided one by one; a correction stays one at a time. Checked at 360px: two confirmed, then the rest removed, and the review trail showed four decisions |
| 10 | P1 | 05-010 | What HomeBrain registers is registered by default | Done | The owner, 2026-10-19 (screenshot of 14 items under Needs review): whatever HomeBrain registers is registered from the start; an Admin removes or corrects it later. The owner, the same day (PR #251): "let's not have anything called confirmed" — HomeBrain Review, its notices, HomeTalk's replies and the help now say Registered and Register in all 8 languages; the stored status value stays `confirmed`, so nothing moved in the database. New memories and their HomeBrain items are written confirmed (`conversation/memory.ts`, `welcome.ts`, `remember()`); the column defaults are `confirmed` (migration `20261019150000`, live), and the 18 learned memories and items on record were brought in line. Only a statement contradicting something already confirmed (`needs_review`) still waits for a person. Replies no longer say "(you told me; not confirmed yet)". Help: HomeBrain ¶1 in 8 languages |
| 11 | P1 | 05-011 | Household understanding counts what the household keeps | Done | The owner's report, 2026-10-19 (screenshot: Family & roles, Education, Finance, Safety all 0/0 while the family was on record): the panel counted only beliefs said in HomeTalk. It now adds each category's own records, registered by definition: members, relationships and responsibilities; playbook items and policies; school enrolments; bills; food preferences and pets; allergies and medical food restrictions as Safety (`recordCountsFrom`, `withRecords`, `loadUnderstandingRecords` — one wave through the viewer's own RLS). The ring and the count line use the same arithmetic. PR #252 |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Household Certification & Understanding as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 05-E01 — Household Understanding & Evidence:** stories 05-001 through 05-003.
- **Epic 05-E04 — Correction, Risk & Actionable Certification:** stories 05-004 through 05-006.
- **Epic 05-E07 — History & Trust Analytics:** stories 05-007 through 05-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 05-001 — Certification overview
**Epic:** Household Understanding & Evidence
**Priority:** P0
**Goal:** Show what WonderHome currently understands.

**Acceptance criteria**
- Given the household state described by the story, show what WonderHome currently understands .
- The UI identifies the exact record or policy that will change before the user confirms.
- Each certification item has a claim, scope, source, status, risk level and review timestamp so the family can understand why WonderHome believes it.
- Confirmed facts are treated as canonical and cannot be silently replaced by inferred or stale information.
- Correcting a claim triggers re-evaluation of dependent routines, responsibilities, notifications or automations.
- High-risk unresolved items can block the related autonomous capability rather than relying on a passive warning.
- Certification changes are auditable and privacy-filtered according to the reviewer’s role.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 05-002 — Source attribution
**Epic:** Household Understanding & Evidence
**Priority:** P0
**Goal:** Show origin of each understanding.

**Acceptance criteria**
- Given the household state described by the story, show origin of each understanding .
- Each certification item has a claim, scope, source, status, risk level and review timestamp so the family can understand why WonderHome believes it.
- Confirmed facts are treated as canonical and cannot be silently replaced by inferred or stale information.
- Correcting a claim triggers re-evaluation of dependent routines, responsibilities, notifications or automations.
- High-risk unresolved items can block the related autonomous capability rather than relying on a passive warning.
- Certification changes are auditable and privacy-filtered according to the reviewer’s role.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 05-003 — Confirm
**Epic:** Household Understanding & Evidence
**Priority:** P0
**Goal:** Let authorized users certify learned facts.

**Acceptance criteria**
- Given the household state described by the story, let authorized users certify learned facts .
- The UI identifies the exact record or policy that will change before the user confirms.
- Each certification item has a claim, scope, source, status, risk level and review timestamp so the family can understand why WonderHome believes it.
- Confirmed facts are treated as canonical and cannot be silently replaced by inferred or stale information.
- Correcting a claim triggers re-evaluation of dependent routines, responsibilities, notifications or automations.
- High-risk unresolved items can block the related autonomous capability rather than relying on a passive warning.
- Certification changes are auditable and privacy-filtered according to the reviewer’s role.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 05-004 — Correct/remove
**Epic:** Correction, Risk & Actionable Certification
**Priority:** P0
**Goal:** Fix wrong assumptions.

**Acceptance criteria**
- Given the household state described by the story, fix wrong assumptions .
- The UI identifies the exact record or policy that will change before the user confirms.
- Each certification item has a claim, scope, source, status, risk level and review timestamp so the family can understand why WonderHome believes it.
- Confirmed facts are treated as canonical and cannot be silently replaced by inferred or stale information.
- Correcting a claim triggers re-evaluation of dependent routines, responsibilities, notifications or automations.
- High-risk unresolved items can block the related autonomous capability rather than relying on a passive warning.
- Certification changes are auditable and privacy-filtered according to the reviewer’s role.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 05-005 — Risk prioritization
**Epic:** Correction, Risk & Actionable Certification
**Priority:** P0
**Goal:** Prioritize payment, child, admin, helper and autonomy
assumptions.

**Acceptance criteria**
- Given the household state described by the story, prioritize payment, child, admin, helper and autonomy
assumptions .
- Autonomy modes are enforced at action execution time, not merely displayed in settings.
- Each certification item has a claim, scope, source, status, risk level and review timestamp so the family can understand why WonderHome believes it.
- Confirmed facts are treated as canonical and cannot be silently replaced by inferred or stale information.
- Correcting a claim triggers re-evaluation of dependent routines, responsibilities, notifications or automations.
- High-risk unresolved items can block the related autonomous capability rather than relying on a passive warning.
- Certification changes are auditable and privacy-filtered according to the reviewer’s role.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 05-006 — Actionable certification alerts
**Epic:** Correction, Risk & Actionable Certification
**Priority:** P0
**Goal:** Surface review items with Fix/Review actions.

**Acceptance criteria**
- Given the household state described by the story, surface review items with Fix/Review actions .
- The UI identifies the exact record or policy that will change before the user confirms.
- Each certification item has a claim, scope, source, status, risk level and review timestamp so the family can understand why WonderHome believes it.
- Confirmed facts are treated as canonical and cannot be silently replaced by inferred or stale information.
- Correcting a claim triggers re-evaluation of dependent routines, responsibilities, notifications or automations.
- High-risk unresolved items can block the related autonomous capability rather than relying on a passive warning.
- Certification changes are auditable and privacy-filtered according to the reviewer’s role.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 05-007 — Certification history
**Epic:** History & Trust Analytics
**Priority:** P1
**Goal:** Show who changed what and when.

**Acceptance criteria**
- Given the household state described by the story, show who changed what and when .
- The UI identifies the exact record or policy that will change before the user confirms.
- Each certification item has a claim, scope, source, status, risk level and review timestamp so the family can understand why WonderHome believes it.
- Confirmed facts are treated as canonical and cannot be silently replaced by inferred or stale information.
- Correcting a claim triggers re-evaluation of dependent routines, responsibilities, notifications or automations.
- High-risk unresolved items can block the related autonomous capability rather than relying on a passive warning.
- Certification changes are auditable and privacy-filtered according to the reviewer’s role.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 05-008 — Certification health
**Epic:** History & Trust Analytics
**Priority:** P2
**Goal:** Provide explainable coverage indicators.

**Acceptance criteria**
- Given the household state described by the story, provide explainable coverage indicators .
- The UI identifies the exact record or policy that will change before the user confirms.
- Each certification item has a claim, scope, source, status, risk level and review timestamp so the family can understand why WonderHome believes it.
- Confirmed facts are treated as canonical and cannot be silently replaced by inferred or stale information.
- Correcting a claim triggers re-evaluation of dependent routines, responsibilities, notifications or automations.
- High-risk unresolved items can block the related autonomous capability rather than relying on a passive warning.
- Certification changes are auditable and privacy-filtered according to the reviewer’s role.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.

### Story 05-010 — What HomeBrain registers is registered by default
**Epic:** Household Certification
**Priority:** P1
**Goal:** What a family member tells WonderHome is the household's word from the start; an Admin reviews by removing or correcting, not by confirming each item first.

**Acceptance criteria**
- A new memory and its HomeBrain item are recorded as confirmed, and the database defaults agree.
- What was already learned is confirmed; anything contradicting a confirmed fact still waits under Needs review.
- An Admin can still remove or correct any confirmed item, and HomeTalk's answers stop marking items as unconfirmed.

