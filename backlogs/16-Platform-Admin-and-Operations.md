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
| 7 | P1 | 16-007 | Privacy requests | Done | `fulfillMaturedDeletions` (the real deletion job 15-007 never built — scrubs a member's PII, keeps the row and its references readable); `privacy-requests.ts` gives staff list/refuse (operator/owner only), wired into `/platform/retention`'s existing sweep |
| 8 | P1 | 16-008 | Feature flags/audit | Done | `feature-flags.ts`: a reason-coded, audited `setHouseholdFeatureFlag` (operator/owner only, following 16-005's exact shape) turns a staged capability on or off for one household; a household reads its own flags via RLS, matching support-access grants' "the family this concerns can see it" precedent. `audit-log.ts`: `listPlatformAuditEvents` widens who may read the already-redacted `audit_events` rows fleet-wide, never what is safe to show |
| 9 | P1 | 16-009 | Platform admin landing and Performance | Done | `/platform-admin` landing with section nav (Overview, Performance, Careers); `/platform-admin/performance` shows database, advisor, budget and tip panels, aggregate only, read-only. Staff-only RPC `platform_performance_snapshot` (service role + in-function staff check); tips in `packages/core/src/platform/performance.ts` |
| 10 | P1 | 16-010 | Admin portal and settings out of Vercel | Done | Grouped sidebar (Run / Configure / Guard) after WonderWorks' admin; Overview, Households & people, Plans & billing, AI & providers, Integrations, Configuration, Secrets, Security. `platform_config` + Vault, registry in `platform/settings/registry.ts`, `runtimeEnv()` lays saved values over the environment (saved → env → default). PR "Admin portal" (2026-11-07). "Move all from Vercel" on Configuration (owner, password step-up): one transaction `platform_config_import`, never overwrites, read-back check, Copy list of Vercel variables to delete (2026-11-07) |
| 11 | P1 | 16-011 | Test connection for each provider key | Not Started | Follow-up of 16-010: a Test button per key (AI, SMTP, WhatsApp, Maps, TMDB, Resend, scanner), as Careers has |
| 12 | P1 | 16-012 | Editors in Plans & billing | Not Started | Follow-up of 16-010: plan feature policies and experiments are editable only through the API today; move the editors onto the page |
| 13 | P2 | 16-013 | Claude model choice without a deploy | Not Started | Follow-up of 16-010: `ai/model-client.ts` model constants become per-call reads so `WONDERHOME_AI_*_MODEL` can move into the registry |
| 14 | P1 | 16-014 | Actionable Overview | Done | Owner, 2026-11-07. `/platform-admin` opens with the state in a sentence, then Needs you (one action each, raised only from real signals: failing or stale background jobs, AI key alerts, HomeTalk/HomeSend/delivery failure spikes, billing differences, failed plan payments, advisor findings beyond baseline, open support grants, settings still from Vercel, Vercel variables to delete, quiet setups), Growth & use (7/30 days with deltas and sparklines, plans adding up to the total, HomeSend confirmed vs checking) and Health (jobs, HomeTalk p95, failures, advisor, migrations). One staff-only RPC `platform_overview`, kept per server for 60 s; `packages/core/src/platform/overview.ts`. Not watched yet: nightly E2E, deploy state (no GitHub/Vercel token in the portal), CSP reports (not stored) |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Platform Admin & Operations as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 16-E01 — Privileged Platform Operations:** stories 16-001 through 16-004.
- **Epic 16-E05 — Plans, AI Operations, Privacy & Feature Controls:** stories 16-005 through 16-009.

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

### Story 16-009 — Platform admin landing and Performance
**Epic:** Plans, AI Operations, Privacy & Feature Controls
**Priority:** P1
**Goal:** Give platform staff one landing page with a nav to its sections, and a read-only Performance section with plain-language statuses and tips (owner, 2026-10-29).

**Acceptance criteria**
- Staff only (404 for anyone else); aggregate numbers only, never household, member, email, SQL parameters or row contents.
- Every figure comes from a real source or the section says it is not measured and why.
- Tips are a deterministic rule table ordered by severity and impact, each linking a plan story.
- Action buttons on the tip cards (owner, 2026-10-29): a fixed allowlist of guarded database functions (refresh planner statistics; reset query statistics and end stuck connections, owner only with a password re-check), each audited and limited to one run per action and target per minute; schema fixes are copy-only SQL snippets, never run from the web.

**Evidence:** `packages/core/src/platform/performance.test.ts`, `scripts/test-platform-performance-rls.mjs`, `scripts/test-platform-performance-actions-rls.mjs`, `packages/core/src/platform/performance-actions.test.ts`, `apps/web/app/platform-admin/performance/actions.test.ts`, `docs/progress/2026-10-29-platform-admin-performance.md`, `docs/progress/2026-10-29-performance-actions.md`.

### Story 16-010 — Admin portal and settings out of Vercel
**Epic:** Plans, AI Operations, Privacy & Feature Controls
**Priority:** P1
**Goal:** One proper admin portal for running WonderHome, following WonderWorks' admin, with every setting that need not live in Vercel editable there (owner, 2026-11-07).

**Acceptance criteria**
- Sections grouped as WonderWorks groups its rail; phone drawer and desktop sidebar; every page checks its capability on the server (404 otherwise).
- A typed registry of every movable setting; a saved value wins over the variable, which wins over the reader's default; nothing saved means behaviour is unchanged.
- Secrets in Vault only, write-only in the UI (last four, when changed), owner only with a password step-up; never sent to a browser or logged.
- Every change audited (old → new for a setting, "changed" for a secret) and limited to 20 a minute per person.
- Bootstrap values (database keys, signing secrets, build-time values) stay in Vercel, each with its reason.

**Evidence:** `packages/core/src/platform/settings/{registry,runtime-env,store}.test.ts`, `apps/web/app/platform-admin/settings-actions.test.ts`, `apps/web/app/platform-admin/menu.test.ts`, `scripts/test-platform-settings-rls.mjs`, `scripts/check-client-bundle.mjs`, `docs/progress/2026-11-07-admin-portal.md`.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.