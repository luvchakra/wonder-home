# WonderHome — Project Bootstrap & Architecture

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 00-001 | Initialize WonderHome monorepo | Done | apps/web + packages/core; npm workspaces |
| 2 | P0 | 00-002 | Pin WonderArk-aligned stack | Done | Versions verified against founder-collab manifests |
| 3 | P0 | 00-003 | Create application shell | Done | Tokens + shell + 5 primary areas |
| 4 | P0 | 00-004 | Configure Supabase foundation | Done | Env contract + clients; migration 20260917003323 applied |
| 5 | P0 | 00-005 | Configure quality gates | Done | Playwright mobile + desktop smoke |
| 6 | P0 | 00-006 | Configure CI baseline | Done | GitHub Actions; lints are self-tested |
| 7 | P0 | 00-007 | Create API foundation | Done | defineRoute wrapper; /health and /me |
| 8 | P0 | 00-008 | Create security foundation | Done | Headers, middleware, route policy, redaction |
| 9 | P1 | 00-009 | Create observability foundation | Done | Redacting structured logs; reporter seam |
| 10 | P1 | 00-010 | Create feature configuration | Done | Flags + fail-fast startup validation |
| 11 | P1 | 00-011 | Offer to install the app on phones and tablets | Done | Install banner: one tap on Chromium, two steps on iOS; never on desktop or when installed |
| 12 | P1 | 00-012 | Bars step aside while reading on a phone | Done | `ScrollChrome` (`shell/scroll-chrome.tsx`): scrolling down hides the header first, then the tab bar with its raised button; any scroll up, the top and the end of the page bring both back. Phones only, reduced motion without the slide, HomeTalk's own scroller untouched. Browser-checked 2026-10-18 against the live project at 360px and 1280px with QA accounts (cleaned up afterwards): the header hides after about 40px, the tab bar only after 280px (raised from 120 so the two are visibly staged), and a 20px scroll up brings both back |
| 13 | P1 | 00-013 | UI simplification: one door per page, a smaller More menu, one Notifications page (M1, M7, M8) | In Progress | design/UI-SIMPLIFICATION-v1.md; Settings → Notifications holds the household choices and delivery |
| 14 | P1 | 00-014 | UI simplification: Family is the one people page; Today is the Calendar's Day view (M3, M4) | Not Started | design/UI-SIMPLIFICATION-v1.md |
| 15 | P1 | 00-015 | UI simplification: one Connections page under Settings (M2) | Not Started | design/UI-SIMPLIFICATION-v1.md |
| 16 | P1 | 00-016 | UI simplification: Settings with You and Household tabs; one setup wizard (M5, M6) | Not Started | design/UI-SIMPLIFICATION-v1.md |

## Purpose
This is the mandatory greenfield bootstrap for the WonderHome repository. The project is a new repository and will use the WonderArk/founder-collab technical stack as its baseline.

## Epics
- **Epic 00-E01 — Greenfield Repository & Stack:** stories 00-001 through 00-003, and 00-011 (installing the app).
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

### Story 00-011 — Offer to install the app on phones and tablets
**Epic:** Greenfield Repository & Stack
**Priority:** P1

**Goal:** Invite somebody on a phone or tablet to install WonderHome, in one tap where the browser allows it, only when the browser can really install it and it is not installed yet.

**Acceptance criteria**
- A banner at the very top of the page, above the header and in the flow (it pushes the page down), respecting the top safe area, on public pages and inside the signed-in app; never on desktop, never on the voice-assistant linking consent or the auth callback, never in print.
- Chromium on a phone or tablet shows it only after `beforeinstallprompt`, which is captured before any screen mounts; Install opens the browser's own prompt and awaits the answer.
- iOS and iPadOS (Safari, and the share-sheet iOS browsers from 16.4) get the two steps — Share, then "Add to Home Screen" — with the Share glyph drawn inline; "I've added it" is remembered because a Safari tab cannot detect an install.
- Firefox on Android, in-app browsers and desktops get nothing; running installed (any standalone-like display mode or iOS `navigator.standalone`) or reported installed by `getInstalledRelatedApps` hides it.
- Installed is remembered for good on that browser; "Not now" and a declined prompt snooze it for 14 days; blocked storage breaks nothing.
- The manifest is complete for installation (`id`, `scope`, `related_applications` naming itself), the Apple web-app meta is present, and no service worker is added.
- Every new string is in all eight catalogs; Arabic lays the banner out right to left; entrance motion is off under reduced motion; the region and every button have names and nothing takes focus.
- Eligibility is a pure function with unit tests per platform; an E2E emulates a phone, dispatches a synthetic `beforeinstallprompt`, installs through a stubbed prompt and proves a desktop sees nothing.

**Definition of Done**
- Code integrated; lint/typecheck/test/build pass; security baseline preserved; story marked Done with evidence.

### Stories 00-013 to 00-016 — UI simplification
**Epic:** Application shell
**Priority:** P1

**Goal:** Every job has one home (design/UI-SIMPLIFICATION-v1.md, approved by the owner on 2026-10-28). Other screens show the value and link there; every retired URL redirects permanently.

**Acceptance criteria**
- 00-013: the More menu has three domain groups; Notifications is reached by the bell, Settings by the profile card and account menu, HomeBrain from More only. Settings → Notifications holds the household's choices and the delivery report for Admins; `/household/notifications` and `/household/delivery` redirect.
- 00-014: invite, add, remove and relationships live on Family; `/household/members` redirects. Today's plan is the Calendar's Day view; `/today` and `/family/events/*` redirect.
- 00-015: one Connections page under Settings for WhatsApp, voice assistants, school, Instamart and every integration; the five old pages redirect.
- 00-016: Settings has You and Household tabs; Manage Household, the address and activity pages and `/settings/voice` redirect; `/onboarding` is the one setup wizard.
- Help words in all eight languages say where each thing now lives; route gates are unchanged.

**Definition of Done**
- Code integrated; lint/typecheck/test/build pass; checked in a browser at 360 px and desktop; story marked Done with evidence.
