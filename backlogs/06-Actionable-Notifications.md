# WonderHome — Actionable Notification Engine

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 06-001 | Decision engine | Done | One recipient, a reason, and something they can do |
| 2 | P0 | 06-002 | Actionable types | Done | One recipient, a reason, and something they can do |
| 3 | P0 | 06-003 | Recipient routing | Done | One recipient, a reason, and something they can do |
| 4 | P0 | 06-004 | Timing | Done | One recipient, a reason, and something they can do |
| 5 | P0 | 06-005 | Escalation | Done | One recipient, a reason, and something they can do |
| 6 | P0 | 06-006 | Lifecycle | Done | One recipient, a reason, and something they can do |
| 7 | P0 | 06-007 | Threading/grouping | Done | One recipient, a reason, and something they can do |
| 8 | P1 | 06-008 | Channels | Done | in_app is live; push/email/whatsapp are fixture adapters + real per-channel preferences UI, honest that they are not connected yet — module 06 complete |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Actionable Notification Engine as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 06-E01 — Notification Intelligence & Routing:** stories 06-001 through 06-003.
- **Epic 06-E04 — Timing, Escalation & Lifecycle:** stories 06-004 through 06-007.
- **Epic 06-E08 — Delivery Channels:** stories 06-008 through 06-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 06-001 — Decision engine
**Epic:** Notification Intelligence & Routing
**Priority:** P0
**Goal:** Decide whether an event deserves an interruption.

**Acceptance criteria**
- Given the household state described by the story, decide whether an event deserves an interruption .
- No notification is emitted solely because an event occurred; the engine must establish that a specific recipient needs information or action.
- Every actionable notification includes a concise reason, current state/deadline and an action that is valid for the recipient.
- Notifications are deduplicated by underlying issue/thread and are automatically resolved or withdrawn when the household state changes.
- Escalation follows responsibility, availability, quiet-hour and urgency policies and never broadcasts routine work to the whole family.
- Notification decisions and delivery outcomes are measurable without storing unnecessary message content or secrets.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 06-002 — Actionable types
**Epic:** Notification Intelligence & Routing
**Priority:** P0
**Goal:** Support action, decision, risk and completion messages.

**Acceptance criteria**
- Given the household state described by the story, support action, decision, risk and completion messages .
- No notification is emitted solely because an event occurred; the engine must establish that a specific recipient needs information or action.
- Every actionable notification includes a concise reason, current state/deadline and an action that is valid for the recipient.
- Notifications are deduplicated by underlying issue/thread and are automatically resolved or withdrawn when the household state changes.
- Escalation follows responsibility, availability, quiet-hour and urgency policies and never broadcasts routine work to the whole family.
- Notification decisions and delivery outcomes are measurable without storing unnecessary message content or secrets.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 06-003 — Recipient routing
**Epic:** Notification Intelligence & Routing
**Priority:** P0
**Goal:** Notify responsible member or authorized backup.

**Acceptance criteria**
- Given the household state described by the story, notify responsible member or authorized backup .
- No notification is emitted solely because an event occurred; the engine must establish that a specific recipient needs information or action.
- Every actionable notification includes a concise reason, current state/deadline and an action that is valid for the recipient.
- Notifications are deduplicated by underlying issue/thread and are automatically resolved or withdrawn when the household state changes.
- Escalation follows responsibility, availability, quiet-hour and urgency policies and never broadcasts routine work to the whole family.
- Notification decisions and delivery outcomes are measurable without storing unnecessary message content or secrets.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 06-004 — Timing
**Epic:** Timing, Escalation & Lifecycle
**Priority:** P0
**Goal:** Choose useful delivery time using deadline, availability and
quiet hours.

**Acceptance criteria**
- Given the household state described by the story, choose useful delivery time using deadline, availability and
quiet hours .
- Availability supports recurring windows plus date-specific exceptions and is queryable by the planner.
- No notification is emitted solely because an event occurred; the engine must establish that a specific recipient needs information or action.
- Every actionable notification includes a concise reason, current state/deadline and an action that is valid for the recipient.
- Notifications are deduplicated by underlying issue/thread and are automatically resolved or withdrawn when the household state changes.
- Escalation follows responsibility, availability, quiet-hour and urgency policies and never broadcasts routine work to the whole family.
- Notification decisions and delivery outcomes are measurable without storing unnecessary message content or secrets.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 06-005 — Escalation
**Epic:** Timing, Escalation & Lifecycle
**Priority:** P0
**Goal:** Escalate only when still unresolved and at risk.

**Acceptance criteria**
- Given the household state described by the story, escalate only when still unresolved and at risk .
- A notification decision can be explained from stored decision factors for debugging and trust.
- No notification is emitted solely because an event occurred; the engine must establish that a specific recipient needs information or action.
- Every actionable notification includes a concise reason, current state/deadline and an action that is valid for the recipient.
- Notifications are deduplicated by underlying issue/thread and are automatically resolved or withdrawn when the household state changes.
- Escalation follows responsibility, availability, quiet-hour and urgency policies and never broadcasts routine work to the whole family.
- Notification decisions and delivery outcomes are measurable without storing unnecessary message content or secrets.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 06-006 — Lifecycle
**Epic:** Timing, Escalation & Lifecycle
**Priority:** P0
**Goal:** Track generated, delivered, seen, acted, resolved and expired.

**Acceptance criteria**
- Given the household state described by the story, track generated, delivered, seen, acted, resolved and expired .
- No notification is emitted solely because an event occurred; the engine must establish that a specific recipient needs information or action.
- Every actionable notification includes a concise reason, current state/deadline and an action that is valid for the recipient.
- Notifications are deduplicated by underlying issue/thread and are automatically resolved or withdrawn when the household state changes.
- Escalation follows responsibility, availability, quiet-hour and urgency policies and never broadcasts routine work to the whole family.
- Notification decisions and delivery outcomes are measurable without storing unnecessary message content or secrets.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 06-007 — Threading/grouping
**Epic:** Timing, Escalation & Lifecycle
**Priority:** P0
**Goal:** Evolve one notification and group related events.

**Acceptance criteria**
- Given the household state described by the story, evolve one notification and group related events .
- A notification decision can be explained from stored decision factors for debugging and trust.
- No notification is emitted solely because an event occurred; the engine must establish that a specific recipient needs information or action.
- Every actionable notification includes a concise reason, current state/deadline and an action that is valid for the recipient.
- Notifications are deduplicated by underlying issue/thread and are automatically resolved or withdrawn when the household state changes.
- Escalation follows responsibility, availability, quiet-hour and urgency policies and never broadcasts routine work to the whole family.
- Notification decisions and delivery outcomes are measurable without storing unnecessary message content or secrets.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 06-008 — Channels
**Epic:** Delivery Channels
**Priority:** P1
**Goal:** Support in-app, push, email and WhatsApp adapter.

**Acceptance criteria**
- Given the household state described by the story, support in-app, push, email and WhatsApp adapter .
- No notification is emitted solely because an event occurred; the engine must establish that a specific recipient needs information or action.
- Every actionable notification includes a concise reason, current state/deadline and an action that is valid for the recipient.
- Notifications are deduplicated by underlying issue/thread and are automatically resolved or withdrawn when the household state changes.
- Escalation follows responsibility, availability, quiet-hour and urgency policies and never broadcasts routine work to the whole family.
- Notification decisions and delivery outcomes are measurable without storing unnecessary message content or secrets.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.