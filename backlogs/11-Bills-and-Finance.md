# WonderHome — Bills, Fees & Finance

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 11-001 | Obligation model | Done | an obligation may exist before its amount does, which is the normal case |
| 2 | P0 | 11-002 | Bill ingestion | Done | provider identity makes a re-import reconcile rather than duplicate |
| 3 | P0 | 11-003 | Due-date risk | Done | lead time by consequence, and silence once a payment is arranged |
| 4 | P0 | 11-004 | Approval | Done | approval is for one exact amount; a changed figure invalidates it |
| 5 | P0 | 11-005 | Payment safety | Done | step-up is separate from being signed in; one success per intent, enforced by index |
| 6 | P1 | 11-006 | Anomaly detection | Done | an anomaly carries its comparison and is a review, never a block |
| 7 | P1 | 11-007 | Budget planning | Done | a budget describes intent; it never stops the rent being paid |
| 8 | P2 | 11-008 | Autonomous recurring payments | Done | policy and idempotency in place; no payment provider is live |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Bills, Fees & Finance as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 11-E01 — Bills, Due Dates & Safe Payments:** stories 11-001 through 11-005.
- **Epic 11-E06 — Financial Intelligence:** stories 11-006 through 11-007.
- **Epic 11-E08 — Controlled Payment Automation:** stories 11-008 through 11-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 11-001 — Obligation model
**Epic:** Bills, Due Dates & Safe Payments
**Priority:** P0
**Goal:** Represent utilities, classes, subscriptions and fees.

**Acceptance criteria**
- Given the household state described by the story, represent utilities, classes, subscriptions and fees .
- Each obligation has source, amount/currency when known, due date, responsible member, status and payment/review requirement.
- Bill reminders are suppressed when the bill is already paid, delegated or otherwise no longer actionable.
- Payment operations require server-side authorization, idempotency and step-up authentication according to policy.
- Anomalies show the comparison basis and create a review decision rather than automatically blocking a legitimate payment.
- Financial audit records contain action metadata but never payment secrets, full credentials or unnecessary private transaction content.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 11-002 — Bill ingestion
**Epic:** Bills, Due Dates & Safe Payments
**Priority:** P0
**Goal:** Import configured bills and detect duplicates.

**Acceptance criteria**
- Given the household state described by the story, import configured bills and detect duplicates .
- A payment retry cannot create a second provider transaction for the same approved intent.
- Each obligation has source, amount/currency when known, due date, responsible member, status and payment/review requirement.
- Bill reminders are suppressed when the bill is already paid, delegated or otherwise no longer actionable.
- Payment operations require server-side authorization, idempotency and step-up authentication according to policy.
- Anomalies show the comparison basis and create a review decision rather than automatically blocking a legitimate payment.
- Financial audit records contain action metadata but never payment secrets, full credentials or unnecessary private transaction content.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 11-003 — Due-date risk
**Epic:** Bills, Due Dates & Safe Payments
**Priority:** P0
**Goal:** Notify responsible member only when action is needed.

**Acceptance criteria**
- Given the household state described by the story, notify responsible member only when action is needed .
- Each obligation has source, amount/currency when known, due date, responsible member, status and payment/review requirement.
- Bill reminders are suppressed when the bill is already paid, delegated or otherwise no longer actionable.
- Payment operations require server-side authorization, idempotency and step-up authentication according to policy.
- Anomalies show the comparison basis and create a review decision rather than automatically blocking a legitimate payment.
- Financial audit records contain action metadata but never payment secrets, full credentials or unnecessary private transaction content.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 11-004 — Approval
**Epic:** Bills, Due Dates & Safe Payments
**Priority:** P0
**Goal:** Prepare payments and enforce policy.

**Acceptance criteria**
- Given the household state described by the story, prepare payments and enforce policy .
- Policy evaluation returns a deterministic allow/deny/approval result that can be consumed by APIs and AI tools.
- Each obligation has source, amount/currency when known, due date, responsible member, status and payment/review requirement.
- Bill reminders are suppressed when the bill is already paid, delegated or otherwise no longer actionable.
- Payment operations require server-side authorization, idempotency and step-up authentication according to policy.
- Anomalies show the comparison basis and create a review decision rather than automatically blocking a legitimate payment.
- Financial audit records contain action metadata but never payment secrets, full credentials or unnecessary private transaction content.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 11-005 — Payment safety
**Epic:** Bills, Due Dates & Safe Payments
**Priority:** P0
**Goal:** Use step-up authentication for sensitive payment actions.

**Acceptance criteria**
- Given the household state described by the story, use step-up authentication for sensitive payment actions .
- A payment retry cannot create a second provider transaction for the same approved intent.
- Each obligation has source, amount/currency when known, due date, responsible member, status and payment/review requirement.
- Bill reminders are suppressed when the bill is already paid, delegated or otherwise no longer actionable.
- Payment operations require server-side authorization, idempotency and step-up authentication according to policy.
- Anomalies show the comparison basis and create a review decision rather than automatically blocking a legitimate payment.
- Financial audit records contain action metadata but never payment secrets, full credentials or unnecessary private transaction content.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 11-006 — Anomaly detection
**Epic:** Financial Intelligence
**Priority:** P1
**Goal:** Detect unusual amounts.

**Acceptance criteria**
- Given the household state described by the story, detect unusual amounts .
- Each obligation has source, amount/currency when known, due date, responsible member, status and payment/review requirement.
- Bill reminders are suppressed when the bill is already paid, delegated or otherwise no longer actionable.
- Payment operations require server-side authorization, idempotency and step-up authentication according to policy.
- Anomalies show the comparison basis and create a review decision rather than automatically blocking a legitimate payment.
- Financial audit records contain action metadata but never payment secrets, full credentials or unnecessary private transaction content.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 11-007 — Budget planning
**Epic:** Financial Intelligence
**Priority:** P1
**Goal:** Support authorized household financial planning.

**Acceptance criteria**
- Given the household state described by the story, support authorized household financial planning .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Each obligation has source, amount/currency when known, due date, responsible member, status and payment/review requirement.
- Bill reminders are suppressed when the bill is already paid, delegated or otherwise no longer actionable.
- Payment operations require server-side authorization, idempotency and step-up authentication according to policy.
- Anomalies show the comparison basis and create a review decision rather than automatically blocking a legitimate payment.
- Financial audit records contain action metadata but never payment secrets, full credentials or unnecessary private transaction content.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 11-008 — Autonomous recurring payments
**Epic:** Controlled Payment Automation
**Priority:** P2
**Goal:** Support only policy-approved low-risk payments.

**Acceptance criteria**
- Given the household state described by the story, support only policy-approved low-risk payments .
- Policy evaluation returns a deterministic allow/deny/approval result that can be consumed by APIs and AI tools.
- Each obligation has source, amount/currency when known, due date, responsible member, status and payment/review requirement.
- Bill reminders are suppressed when the bill is already paid, delegated or otherwise no longer actionable.
- Payment operations require server-side authorization, idempotency and step-up authentication according to policy.
- Anomalies show the comparison basis and create a review decision rather than automatically blocking a legitimate payment.
- Financial audit records contain action metadata but never payment secrets, full credentials or unnecessary private transaction content.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.