# WonderHome — Project Bootstrap & Architecture

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 00-001 | Initialize WonderHome monorepo | Done | apps/web + packages/core; npm workspaces |
| 2 | P0 | 00-002 | Pin WonderArk-aligned stack | Done | Versions verified against founder-collab manifests |
| 3 | P0 | 00-003 | Create application shell | Done | Tokens + shell + 5 primary areas |
| 4 | P0 | 00-004 | Configure Supabase foundation | Done | Env contract + clients; migration 20260917003323 applied |
| 5 | P0 | 00-005 | Configure quality gates | Not Started | |
| 6 | P0 | 00-006 | Configure CI baseline | Not Started | |
| 7 | P0 | 00-007 | Create API foundation | Not Started | |
| 8 | P0 | 00-008 | Create security foundation | Not Started | |
| 9 | P1 | 00-009 | Create observability foundation | Not Started | |
| 10 | P1 | 00-010 | Create feature configuration | Not Started | |

## Purpose
This is the mandatory greenfield bootstrap for the WonderHome repository. The project is a new repository and will use the WonderArk/founder-collab technical stack as its baseline.

## Epics
- **Epic 00-E01 — Greenfield Repository & Stack:** stories 00-001 through 00-003.
- **Epic 00-E02 — Data, API & Security Foundation:** stories 00-004 through 00-008.
- **Epic 00-E03 — Quality, Observability & Configuration:** stories 00-009 through 00-010.

## Stories

### Story 00-001 — Initialize WonderHome monorepo
**Epic:** Greenfield Repository & Stack
**Priority:** P0

**Goal:** Create the greenfield repository using the WonderArk-aligned workspace structure: apps/web and packages/* with Next.js App Router.

**Acceptance criteria**
- Repository contains a runnable web app, workspace scripts and a clean TypeScript baseline.
- The implementation uses the documented WonderArk-aligned stack and does not introduce an alternative framework without a recorded architecture decision.
- The change is runnable from a clean checkout using the documented commands.
- Tests cover the setup path and the most likely configuration failure.
- Progress is updated in both this module and tracking/PROGRESS.md.

**Definition of Done**
- Code integrated; lint/typecheck/test/build pass; security baseline preserved; story marked Done with evidence.

### Story 00-002 — Pin WonderArk-aligned stack
**Epic:** Greenfield Repository & Stack
**Priority:** P0

**Goal:** Install and pin the baseline framework, UI, data, validation, AI and test dependencies.

**Acceptance criteria**
- Stack versions are documented and lockfile is committed.
- The implementation uses the documented WonderArk-aligned stack and does not introduce an alternative framework without a recorded architecture decision.
- The change is runnable from a clean checkout using the documented commands.
- Tests cover the setup path and the most likely configuration failure.
- Progress is updated in both this module and tracking/PROGRESS.md.

**Definition of Done**
- Code integrated; lint/typecheck/test/build pass; security baseline preserved; story marked Done with evidence.

### Story 00-003 — Create application shell
**Epic:** Greenfield Repository & Stack
**Priority:** P0

**Goal:** Implement the WonderHome visual shell, responsive layout, navigation and design tokens without domain features.

**Acceptance criteria**
- Mobile-first and desktop-responsive shell matches the approved UI direction and has accessible navigation.
- The implementation uses the documented WonderArk-aligned stack and does not introduce an alternative framework without a recorded architecture decision.
- The change is runnable from a clean checkout using the documented commands.
- Tests cover the setup path and the most likely configuration failure.
- Progress is updated in both this module and tracking/PROGRESS.md.

**Definition of Done**
- Code integrated; lint/typecheck/test/build pass; security baseline preserved; story marked Done with evidence.

### Story 00-004 — Configure Supabase foundation
**Epic:** Data, API & Security Foundation
**Priority:** P0

**Goal:** Create local/dev Supabase configuration, environment contract and first migration pipeline.

**Acceptance criteria**
- App can connect using publishable credentials; service-role secrets remain server-only.
- The implementation uses the documented WonderArk-aligned stack and does not introduce an alternative framework without a recorded architecture decision.
- The change is runnable from a clean checkout using the documented commands.
- Tests cover the setup path and the most likely configuration failure.
- Progress is updated in both this module and tracking/PROGRESS.md.

**Definition of Done**
- Code integrated; lint/typecheck/test/build pass; security baseline preserved; story marked Done with evidence.

### Story 00-005 — Configure quality gates
**Epic:** Data, API & Security Foundation
**Priority:** P0

**Goal:** Set up ESLint, TypeScript, Vitest and Playwright scripts matching WonderArk conventions.

**Acceptance criteria**
- A fresh checkout can run lint, typecheck, unit tests and E2E smoke tests.
- The implementation uses the documented WonderArk-aligned stack and does not introduce an alternative framework without a recorded architecture decision.
- The change is runnable from a clean checkout using the documented commands.
- Tests cover the setup path and the most likely configuration failure.
- Progress is updated in both this module and tracking/PROGRESS.md.

**Definition of Done**
- Code integrated; lint/typecheck/test/build pass; security baseline preserved; story marked Done with evidence.

### Story 00-006 — Configure CI baseline
**Epic:** Data, API & Security Foundation
**Priority:** P0

**Goal:** Add CI checks for install, lint, typecheck, tests and build.

**Acceptance criteria**
- Pull requests fail when a quality gate fails.
- The implementation uses the documented WonderArk-aligned stack and does not introduce an alternative framework without a recorded architecture decision.
- The change is runnable from a clean checkout using the documented commands.
- Tests cover the setup path and the most likely configuration failure.
- Progress is updated in both this module and tracking/PROGRESS.md.

**Definition of Done**
- Code integrated; lint/typecheck/test/build pass; security baseline preserved; story marked Done with evidence.

### Story 00-007 — Create API foundation
**Epic:** Data, API & Security Foundation
**Priority:** P0

**Goal:** Create /api/v1 routing, request validation, error envelope and request correlation IDs.

**Acceptance criteria**
- A health endpoint and one authenticated example endpoint prove the contract.
- The implementation uses the documented WonderArk-aligned stack and does not introduce an alternative framework without a recorded architecture decision.
- The change is runnable from a clean checkout using the documented commands.
- Tests cover the setup path and the most likely configuration failure.
- Progress is updated in both this module and tracking/PROGRESS.md.

**Definition of Done**
- Code integrated; lint/typecheck/test/build pass; security baseline preserved; story marked Done with evidence.

### Story 00-008 — Create security foundation
**Epic:** Data, API & Security Foundation
**Priority:** P0

**Goal:** Implement baseline headers, secure cookies/session handling, authorization middleware hooks and secret handling.

**Acceptance criteria**
- Security smoke tests pass before domain development begins.
- The implementation uses the documented WonderArk-aligned stack and does not introduce an alternative framework without a recorded architecture decision.
- The change is runnable from a clean checkout using the documented commands.
- Tests cover the setup path and the most likely configuration failure.
- Progress is updated in both this module and tracking/PROGRESS.md.

**Definition of Done**
- Code integrated; lint/typecheck/test/build pass; security baseline preserved; story marked Done with evidence.

### Story 00-009 — Create observability foundation
**Epic:** Quality, Observability & Configuration
**Priority:** P1

**Goal:** Add structured logging, safe error monitoring hooks and correlation IDs.

**Acceptance criteria**
- Sensitive household content is excluded from default logs.
- The implementation uses the documented WonderArk-aligned stack and does not introduce an alternative framework without a recorded architecture decision.
- The change is runnable from a clean checkout using the documented commands.
- Tests cover the setup path and the most likely configuration failure.
- Progress is updated in both this module and tracking/PROGRESS.md.

**Definition of Done**
- Code integrated; lint/typecheck/test/build pass; security baseline preserved; story marked Done with evidence.

### Story 00-010 — Create feature configuration
**Epic:** Quality, Observability & Configuration
**Priority:** P1

**Goal:** Add environment/config validation and safe feature flags.

**Acceptance criteria**
- Missing required configuration fails fast with actionable startup errors.
- The implementation uses the documented WonderArk-aligned stack and does not introduce an alternative framework without a recorded architecture decision.
- The change is runnable from a clean checkout using the documented commands.
- Tests cover the setup path and the most likely configuration failure.
- Progress is updated in both this module and tracking/PROGRESS.md.

**Definition of Done**
- Code integrated; lint/typecheck/test/build pass; security baseline preserved; story marked Done with evidence.

