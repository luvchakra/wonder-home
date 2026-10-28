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
| 7 | P0 | 15-007 | Privacy Center | Done | Step-up that actually verifies; export, deletion with a grace window, retention applied by a nightly sweep |
| 8 | P0 | 15-008 | Security testing | Done | Nine-area suite with a deterministic signal; SSRF guard, prompt-injection and session-abuse coverage |
| 9 | P0 | 15-009 | Hardening against AI-assisted reverse engineering | Done | The owner, 2026-10-21 (a hardening prompt). Audit and fixes in `docs/progress/2026-10-21-reverse-engineering-hardening.md`. Fixed: an open redirect after sign-in (`/\evil.com` passed the `?next=` check; one `security/same-site-path.ts` check now backs all five places); the full API description (`/api/v1/openapi`) is for signed-in members in production; the sign-in gate is deny-by-default (`/health`, `/home-send` and `/onboarding` were reachable to their pages signed out); `robots.txt` refuses AI crawlers and lets search engines read only the landing and legal pages; signed-in pages carry noindex and every page `X-Robots-Tag: noai, noimageai`; sign-in, sign-up, password reset and phone codes are throttled per hashed address (`auth.attempt`); a 429 carries `Retry-After`; every rate-limit refusal is logged; HomeBrain's answer prompt treats facts as data and never reveals its instructions, and a fact can no longer start a line of its own; `check:bundle` fails if a prompt reaches client JavaScript; a proprietary `LICENSE`; a canary record in the partner sandbox; draft terms for legal review (`docs/legal/TERMS-DRAFT.md`). Owner actions listed in the note. |
| 10 | P1 | 15-010 | Data retention: periodic cleanup framework (phase 1) | Done | The owner, 2026-10-28. Soft-delete→grace→purge framework; Admin retention window (default 90d, Privacy Centre, 8 languages); nightly cleanup engine on `/platform/retention`; counts-only audit (`retention_cleanup_runs`); soft-delete enabled for `availability_exceptions` and `family_event_changes`; hard purge gated off (G7). Design + open questions in `docs/data-retention.md`; `docs/progress/2026-10-28-data-retention-cleanup.md`. |
| 11 | P1 | 15-011 | Data retention phase 2: passed calendar events + HomeSend, enable purge | Not Started | Awaiting owner Q1 (events: ephemera vs keepsake) and Q4 (when hard purge may run on live). Adds `soft_deleted_at` + reader filters (incl. a resurrection test) to `family_events` and `home_send_items` (+ Storage objects); enables the gated purge behind a confirmed policy, optionally dry-run first. `docs/data-retention.md` §10. |
| 12 | P2 | 15-012 | Data retention phase 3: child-conservative school items + "recently cleaned" view | Not Started | Awaiting owner Q3. Handled `school_items` on a longer, child-conservative window; a member-facing "recently cleaned / restore" view; per-category windows if wanted. `docs/data-retention.md` §10. |

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

### Story 15-010 — Data retention: periodic cleanup framework (phase 1)
**Epic:** AI Privacy, Audit, Privacy Center & Security Testing
**Priority:** P1 — the owner, 2026-10-28
**Goal:** Clean up passed household ephemera periodically, reducing stored
personal information, under a soft-delete → grace → purge lifecycle that is
reversible before any irreversible step and never touches health, money,
safety or a child's records. Full design and the open questions for the owner
are in `docs/data-retention.md`.

**Acceptance criteria**
- An Admin sets the household's retention window (default 90 days, or off) in the Privacy Centre, stored as a versioned `policies` row; the words exist in all eight languages.
- A nightly job (on `/platform/retention`) soft-deletes passed, handled rows older than the window, bounded and idempotent, failing to the safe side (keep) when the setting cannot be read.
- Phase 1 enables `availability_exceptions` and `family_event_changes` only; health, financial and child records are exempt by omission.
- A counts-only audit row (`retention_cleanup_runs`) records each run without re-storing any removed content; it is admin-read and server-write only.
- The irreversible hard purge is gated off and does not run against live data (guardrail G7).

**Definition of Done**
- Implemented, typechecked, linted; unit tests (cleanup engine, window repository) and the new RLS test pass; build and `check:bundle` pass.
- Migration is additive and safe in either order; applied live after deploy is READY.
- Marked `Done` here and in `tracking/PROGRESS.md` only after evidence exists (`docs/progress/2026-10-28-data-retention-cleanup.md`).

### Story 15-011 — Data retention phase 2: passed calendar events + HomeSend, enable purge
**Epic:** AI Privacy, Audit, Privacy Center & Security Testing
**Priority:** P1 — blocked on owner Q1 and Q4 (`docs/data-retention.md` §9)
**Goal:** Extend cleanup to passed one-off `family_events` and handled
`home_send_items` (including their Storage objects), with `soft_deleted_at`
reader filters and a test proving no reminder resurrects; and enable the gated
hard purge for soft-deleted rows past their grace window once the owner
confirms the policy, optionally with a dry-run report first.

### Story 15-012 — Data retention phase 3: child-conservative school items + "recently cleaned" view
**Epic:** AI Privacy, Audit, Privacy Center & Security Testing
**Priority:** P2 — blocked on owner Q3 (`docs/data-retention.md` §9)
**Goal:** Clean handled `school_items` on a longer, child-conservative window,
and give members a "recently cleaned / restore" view over soft-deleted rows in
the grace window; add per-category windows if the household wants them.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.