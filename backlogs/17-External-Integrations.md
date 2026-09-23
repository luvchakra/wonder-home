# WonderHome — External Integrations

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 17-001 | Connector framework | Done | connector contract, health, dedupe, fixtures; no live provider yet |
| 2 | P0 | 17-002 | Calendar | Done | canonical payload → family_events by provider identity; never protected/confirmed; private = time only; partial sync never cancels; POST integrations/calendar/sync (409 until a provider is live) |
| 3 | P0 | 17-003 | Email | Done | recognised bills → obligations by provider identity + content hash; status never touched by a sync; POST integrations/email/sync (409 until a provider is live) |
| 4 | P0 | 17-004 | School | Done | translate() extended with contentHash + provider-cancellation signal; reconciled onto school_items by identity; cancel never overrides done/submitted; POST integrations/school/sync (409 until a provider is live) |
| 5 | P0 | 17-005 | Commerce | Done | Merchant reports reconciled by identity + hash; lifecycle refuses a rewind, a reprice never overwrites the approved figure; POST integrations/commerce/sync (409 until a merchant is live) |
| 6 | P1 | 17-006 | WhatsApp | Done | WhatsApp Cloud API adapter behind the 06-008 channel shape (approved template, E.164 only, closed-word errors); new due notifications now go out on the member's live channels (`notifications/deliver.ts`) with `sent`/`delivery_failed` events; signed webhook records delivered/seen/failed by provider message id and honours STOP; inert until a deployment sets `WHATSAPP_*` |
| 7 | P1 | 17-007 | Weather | Done | Open-Meteo behind the 13-005 weather port; an Admin picks an area (coordinates rounded to ~1 km, `weather_locations`), the forecast is cached hourly on the household's row, entitlement `home.weather` decided on the server; laundry/drying plans around it; outages recorded on the connection only, last forecast serves ≤6 h; off unless the deployment sets `WONDERHOME_WEATHER_PROVIDER=open-meteo` |
| 8 | P2 | 17-008 | Smart home | Done | One canonical device payload behind the 17-001 contract; a device is linked to an appliance by an Admin (or ignored), never inferred; only fresh readings from linked devices become `home_device_signals`, once each, with provider confidence capped below certainty; outages change connection health only; `home_device_links` (sync-created, Admin decides asset/ignored), Devices section on Integrations; POST integrations/smart-home/sync (409 until a provider is live) |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement External Integrations as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 17-E01 — Connector Platform & Core Integrations:** stories 17-001 through 17-005.
- **Epic 17-E06 — Communication, Weather & Smart Home:** stories 17-006 through 17-008.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 17-001 — Connector framework
**Epic:** Connector Platform & Core Integrations
**Priority:** P0
**Goal:** Create provider-neutral integration contracts.

**Acceptance criteria**
- Given the household state described by the story, create provider-neutral integration contracts .
- Every provider integration implements a common contract for credentials/scopes, health, sync, error handling, revoke and provider identifiers.
- Canonical WonderHome models remain provider-independent so replacing a school, commerce or messaging provider does not change domain logic.
- External data is deduplicated and reconciled using provider identifiers plus household scope.
- Provider outages, rate limits and partial failures are observable and do not corrupt canonical household state.
- No connector is considered live until real credentials, consent, authentication and integration tests are configured.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 17-002 — Calendar
**Epic:** Connector Platform & Core Integrations
**Priority:** P0
**Goal:** Sync authorized calendars.

**Acceptance criteria**
- Given the household state described by the story, sync authorized calendars .
- Every provider integration implements a common contract for credentials/scopes, health, sync, error handling, revoke and provider identifiers.
- Canonical WonderHome models remain provider-independent so replacing a school, commerce or messaging provider does not change domain logic.
- External data is deduplicated and reconciled using provider identifiers plus household scope.
- Provider outages, rate limits and partial failures are observable and do not corrupt canonical household state.
- No connector is considered live until real credentials, consent, authentication and integration tests are configured.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 17-003 — Email
**Epic:** Connector Platform & Core Integrations
**Priority:** P0
**Goal:** Ingest household-relevant mail.

**Acceptance criteria**
- Given the household state described by the story, ingest household-relevant mail .
- Every provider integration implements a common contract for credentials/scopes, health, sync, error handling, revoke and provider identifiers.
- Canonical WonderHome models remain provider-independent so replacing a school, commerce or messaging provider does not change domain logic.
- External data is deduplicated and reconciled using provider identifiers plus household scope.
- Provider outages, rate limits and partial failures are observable and do not corrupt canonical household state.
- No connector is considered live until real credentials, consent, authentication and integration tests are configured.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 17-004 — School
**Epic:** Connector Platform & Core Integrations
**Priority:** P0
**Goal:** Implement school/LMS connector contract.

**Acceptance criteria**
- Given the household state described by the story, implement school/LMS connector contract .
- Every imported school item retains its source/provider identity and child association.
- Every provider integration implements a common contract for credentials/scopes, health, sync, error handling, revoke and provider identifiers.
- Canonical WonderHome models remain provider-independent so replacing a school, commerce or messaging provider does not change domain logic.
- External data is deduplicated and reconciled using provider identifiers plus household scope.
- Provider outages, rate limits and partial failures are observable and do not corrupt canonical household state.
- No connector is considered live until real credentials, consent, authentication and integration tests are configured.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 17-005 — Commerce
**Epic:** Connector Platform & Core Integrations
**Priority:** P0
**Goal:** Implement grocery/ecommerce/pet order contracts.

**Acceptance criteria**
- Given the household state described by the story, implement grocery/ecommerce/pet order contracts .
- The action shows expected cost/quantity before any purchase side effect occurs.
- Every provider integration implements a common contract for credentials/scopes, health, sync, error handling, revoke and provider identifiers.
- Canonical WonderHome models remain provider-independent so replacing a school, commerce or messaging provider does not change domain logic.
- External data is deduplicated and reconciled using provider identifiers plus household scope.
- Provider outages, rate limits and partial failures are observable and do not corrupt canonical household state.
- No connector is considered live until real credentials, consent, authentication and integration tests are configured.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 17-006 — WhatsApp
**Epic:** Communication, Weather & Smart Home
**Priority:** P1
**Goal:** Implement notification/action channel adapter.

**Acceptance criteria**
- Given the household state described by the story, implement notification/action channel adapter .
- A notification decision can be explained from stored decision factors for debugging and trust.
- Every provider integration implements a common contract for credentials/scopes, health, sync, error handling, revoke and provider identifiers.
- Canonical WonderHome models remain provider-independent so replacing a school, commerce or messaging provider does not change domain logic.
- External data is deduplicated and reconciled using provider identifiers plus household scope.
- Provider outages, rate limits and partial failures are observable and do not corrupt canonical household state.
- No connector is considered live until real credentials, consent, authentication and integration tests are configured.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 17-007 — Weather
**Epic:** Communication, Weather & Smart Home
**Priority:** P1
**Goal:** Use weather as a planning signal.

**Acceptance criteria**
- Given the household state described by the story, use weather as a planning signal .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- Every provider integration implements a common contract for credentials/scopes, health, sync, error handling, revoke and provider identifiers.
- Canonical WonderHome models remain provider-independent so replacing a school, commerce or messaging provider does not change domain logic.
- External data is deduplicated and reconciled using provider identifiers plus household scope.
- Provider outages, rate limits and partial failures are observable and do not corrupt canonical household state.
- No connector is considered live until real credentials, consent, authentication and integration tests are configured.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 17-008 — Smart home
**Epic:** Communication, Weather & Smart Home
**Priority:** P2
**Goal:** Add optional device connectors.

**Acceptance criteria**
- Given the household state described by the story, add optional device connectors .
- Every provider integration implements a common contract for credentials/scopes, health, sync, error handling, revoke and provider identifiers.
- Canonical WonderHome models remain provider-independent so replacing a school, commerce or messaging provider does not change domain logic.
- External data is deduplicated and reconciled using provider identifiers plus household scope.
- Provider outages, rate limits and partial failures are observable and do not corrupt canonical household state.
- No connector is considered live until real credentials, consent, authentication and integration tests are configured.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.