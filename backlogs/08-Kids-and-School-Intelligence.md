# WonderHome — Kids & School Intelligence

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 08-001 | Child responsibility | Done | age-appropriate effort, sitting length and a child's own view |
| 2 | P0 | 08-002 | School connector | Done | school connector on the shared contract; broken never looks like empty |
| 3 | P0 | 08-003 | Assignment ingestion | Done | canonical items keyed by provider identity; a portal cannot mark work done |
| 4 | P0 | 08-004 | Study planning | Done | work split into sittings that fit the time; what will not fit is reported |
| 5 | P0 | 08-005 | Deadline risk | Done | risk is time against remaining effort, not the calendar |
| 6 | P1 | 08-006 | Document workspace | Done | documents by reference, guardian-gated in the API and in RLS |
| 7 | P1 | 08-007 | School summaries | Done | only messages that ask something surface; a newsletter is filed |
| 8 | P2 | 08-008 | Deep portal automation | Done | adapter seam and scopes in place; no portal is live (CLAUDE.md) |
| 9 | P2 | 08-009 | Add a child from a school notice | Done | Found in the test-spec live run (23 Sep 2026): a household with no child on record cannot confirm a school notice — offer to add the child inline. Done: the resolver names an untitled unknown child (`unknown`), never assumes the household's only child; the review offers "Add <name> as a child" to Admins (guardian = the Admin, as on Family) and confirms the notice for them in the same step; golden case HS-15 |
| 10 | P0 | 08-010 | Each child's school details: class, class teacher, subject teachers | Done | The owner, 2026-10-18 (PR #234). Each child has a card on Kids & School: the school (Google Maps, 24-010) with its class and section and its start and end times, which are the same record the child's details in Family edit (`setSchoolHours`); the class teacher and each subject teacher (subject picked from a list with its own add, rule 20), each changed or removed with icons (`school_teachers`, migration `20261018260000`, run by the owner 2026-10-18; verify:live 287/287). Child, guardians and Admins read; guardians and Admins write (`wh.may_change_child`), `scripts/test-child-activities-rls.mjs` 7/7. Browser-checked at 360px and 1280px on the live project |
| 11 | P0 | 08-011 | Activities and classes outside school, folded | Done | PR #234. Folded rows (`ExpandableRow`) show the class, a short description and its days and times ("Every day" for all seven); opened: teacher, where (Google Maps, re-read on the server), from–until, notes, competitions coming up and medals, awards and notes, each addable and removable; a class is changed or stopped (`child_activities`, `child_activity_notes`, `school/activities.ts`). Nothing hard-deleted: a removed award was kept with `active = false`. Browser-checked: Piano, every day 5–6 pm, at TheMusicsCool picked from Maps, a December festival and a Grade 1 distinction |
| 12 | P0 | 08-012 | Today's classes on the calendar by default | Done | PR #234. A new `activity` source in `calendarRange` (`activityEntries`, `sessionDates`): each class's sessions on the days it meets, at its times on the household's clock, for that child, opening on Kids & School; stopping a class takes it off. Checked: the Calendar's day view showed "Piano · 5:00 pm – 6:00 pm · Anya QA" today with nothing added by hand |
| 13 | P0 | 08-013 | A child's classes in their details in Family too | Done | The owner, 2026-10-18 (PR #235): the classes outside school appear in the child's opened details in Family, folded with days and times and opening onto every detail, added and changed there (`_components/child-classes.tsx`, one component for Family and Kids & School, rendered outside the details form so its sheets keep their own forms). Browser-checked at 360px: a class changed from Family (Sunday dropped) read back everywhere |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Kids & School Intelligence as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 08-E01 — School Data & Child Planning:** stories 08-001 through 08-005.
- **Epic 08-E06 — Documents, Communication & Deep Integrations:** stories 08-006 through 08-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 08-001 — Child responsibility
**Epic:** School Data & Child Planning
**Priority:** P0
**Goal:** Define age-appropriate responsibilities.

**Acceptance criteria**
- Given the household state described by the story, define age-appropriate responsibilities .
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-002 — School connector
**Epic:** School Data & Child Planning
**Priority:** P0
**Goal:** Create provider-neutral school/LMS interface.

**Acceptance criteria**
- Given the household state described by the story, create provider-neutral school/LMS interface .
- Every imported school item retains its source/provider identity and child association.
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-003 — Assignment ingestion
**Epic:** School Data & Child Planning
**Priority:** P0
**Goal:** Import homework, worksheets, exams and events.

**Acceptance criteria**
- Given the household state described by the story, import homework, worksheets, exams and events .
- Every imported school item retains its source/provider identity and child association.
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-004 — Study planning
**Epic:** School Data & Child Planning
**Priority:** P0
**Goal:** Estimate effort and schedule child-friendly work.

**Acceptance criteria**
- Given the household state described by the story, estimate effort and schedule child-friendly work .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-005 — Deadline risk
**Epic:** School Data & Child Planning
**Priority:** P0
**Goal:** Detect likely missed school deadlines.

**Acceptance criteria**
- Given the household state described by the story, detect likely missed school deadlines .
- Every imported school item retains its source/provider identity and child association.
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-006 — Document workspace
**Epic:** Documents, Communication & Deep Integrations
**Priority:** P1
**Goal:** Store/link authorized worksheets and school documents.

**Acceptance criteria**
- Given the household state described by the story, store/link authorized worksheets and school documents .
- Every imported school item retains its source/provider identity and child association.
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-007 — School summaries
**Epic:** Documents, Communication & Deep Integrations
**Priority:** P1
**Goal:** Turn school communications into actions.

**Acceptance criteria**
- Given the household state described by the story, turn school communications into actions .
- Every imported school item retains its source/provider identity and child association.
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-008 — Deep portal automation
**Epic:** Documents, Communication & Deep Integrations
**Priority:** P2
**Goal:** Implement richer provider-specific integrations.

**Acceptance criteria**
- Given the household state described by the story, implement richer provider-specific integrations .
- School data is normalized to a canonical child/assignment/event model with source provider and external identifiers for deduplication.
- Imported homework and exams become actionable child plans with due date, estimated effort, available time and current state.
- Child views show age-appropriate work and parents receive escalation only when defined risk thresholds are crossed.
- Guardian authorization controls access to school documents, communications and child data at both API and database layers.
- Connector failures are visible as integration health issues and never fabricate school data or silently mark work complete.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 08-010 — Each child's school details
**Epic:** Kids & School
**Priority:** P0
**Goal:** A parent keeps a child's class, class teacher and subject teachers beside the school, on Kids & School.

### Story 08-011 — Activities and classes outside school
**Epic:** Kids & School
**Priority:** P0
**Goal:** Every class a child goes to outside school is one folded row (class, short description, timings); opened, it holds the teacher, the schedule, notes, upcoming competitions and medals.

### Story 08-012 — Today's classes on the calendar
**Epic:** Kids & School
**Priority:** P0
**Goal:** A class that meets today is on the Calendar by default, from its schedule, with nothing to add by hand.

### Story 08-009 — Add a child from a school notice
**Epic:** Kids & School
**Priority:** P2
**Goal:** When a school notice names a child the household has not added yet, let the reviewer add them right there.

**Acceptance criteria**
- The school review offers "add this child" when no child matches, with the name prefilled.
- Adding follows the same guardian rules as the Family screen; the notice is then confirmed for that child.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.