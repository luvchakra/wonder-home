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
| 9 | P2 | 17-009 | Home's date card: the day's weather, a film in cinemas and a family pick to stream | Done | The owner, 2026-10-21 ("make this card longer and show more weather info on this card, any new movies released, any good family stuff to watch on ott. align this nicely and show something new on every load"). The date pill became a card (`_components/today-card.tsx`, streamed behind the greeting): the day and household; where Weather is on, now, the day's high and low (°F where the household measures in imperial) and rain still ahead today with its time (`home/today-weather.ts`, tested), else that the day is dry; and where `TMDB_API_KEY` is set, one film now playing and one family film or show on subscription streaming in the household's region (`home/screen-picks.ts`: TMDB adapter, adult titles dropped, per-server six-hour cache, last good lists kept on failure, a different pair each load; tested), each opening its TMDB page with where to watch, with TMDB's attribution. Without a key nothing about films is shown. CSP allows TMDB's image host. Today's plan stays one tap away on the card. Words and help (Today and Home ¶7) in all eight languages. Waits on: a person creating a TMDB account and setting `TMDB_API_KEY` in Vercel. Follow-up the same day: where Weather is on but no area has been chosen, an Admin sees "Show the weather here: pick your area" on the card, linking to Integrations → Weather (the owner's own households had none, so the card showed only the date). The home address is not used without that choice, because choosing the area is the consent for it to leave. |
| 10 | P1 | 17-010 | A public Careers section powered by WonderJobs | Done | The owner, 2026-10-21: open jobs and applications on WonderHome, with WonderJobs (jobs.wonderapps.biz) running everything behind it; this app only shows and forwards, and stores no applicant data. `packages/core/src/careers/`: `wonderjobs.ts` (the client: fixed host, an override only for an https *.wonderapps.biz host, Bearer key, 8 s timeout, a GET retried once on a network error or 5xx, a POST never, 401/404/409/429 in closed words, the job list kept 60 s in memory and nothing else, logs only endpoint, job id, status and time), `format.ts` (facts, salary, the description as text blocks, the consent line with WonderJobs' retention period or none, JobPosting JSON-LD with "<" escaped), `application.ts` (server checks: trim, lengths, https links, consent), `key-store.ts`. The key: Supabase Vault through `public.careers_key_set/clear/read/status` (service role only; `careers_settings` keeps the last four, `careers_key_events` is the append-only audit of who saved or cleared it and when, last four only); `WONDERJOBS_CAREERS_KEY` only when none is saved. Migration `20261021080000_careers_key.sql`, applied live in seven steps and verified (functions service-role only, RLS on, no session grant). Staff page `/platform-admin/careers` (capability `careers.manage`, owner and operator): paste, mask (wjcs_••••••••abcd), Test connection (Connected with the count, Wrong key, Unavailable), Clear, the change list. Public pages `/careers`, `/careers/[id]` (Share, the Apply form with a honeypot, rate limit `careers.apply` 10 an hour per hashed address, "Application sent" only after a 200), `/careers/status` (token in the request body only; noindex, `Referrer-Policy: no-referrer`, no-store; Withdraw asks first). Not set up, no positions and unavailable are their own states; the reason shows to platform admins only. Footer link on the landing page; robots allow the list and each job, never the status page; `check:bundle` fails if the client reaches a browser chunk. Tests: client 11, key/format/validation 13, pages and actions 16, admin actions 5, route and robots. Browser QA at 360px and 1280px (light and dark): not set up, the admin reason, save and mask, Test connection answered "Wrong key" by WonderJobs for a made-up key, clear, the status page headers. The job list and form with real jobs wait on a real key.

| 11 | P1 | 17-016 | Email forwarding with a per-household sender allowlist | Done | The owner, 2026-10-29: read mail, with the senders WonderHome may read limited to ones the household approved. Phase 1 (forwarding first). The privacy gate `homesend_email_allowlist` (per household; `address` or `domain` rows; member-readable, Admin-writable; set-form RLS; indexed by the unique `(household_id, kind, value)`; audited `homesend.allowlist_added`/`_removed`). `homesend/email-allowlist.ts`: `normalizeAllowlistEntry` (an exact address or a whole domain), `senderMatchesAllowlist` (pure; empty list matches no one; domain match is exact, never a subdomain or look-alike), `allowedHouseholdsForSender` (one query for the recipients, grouped and matched in memory). Enforced in the inbound webhook (`email-webhook.ts`): the sender is known only after the message is fetched, so the gate is there — a sender no recipient household approved is dropped, never stored as a HomeSend item, never fetched further, its text and attachments never kept, leaving only a non-personal `dropped_not_allowlisted` counter (`email-monitoring.ts`). Default empty = nothing read until an Admin adds a sender. Matched mail still runs the ordinary pipeline and waits for confirmation; bills/receipts/health always wait; all content untrusted (`injection.ts`). The `from` header can be forged, so the match is the gate, not verification — no SPF/DKIM claim (the provider schema does not expose it reliably); the confirmation step is the backstop. UI: an Admin-only **Email** section on Connections (`settings/connections/email-section.tsx` + `_components/email-connection.tsx`) — the household's private forwarding address (the existing `homesend_addresses`, reused) and the add/remove allowlist manager, with copy that WonderHome never signs in to the inbox and reads only approved senders. Off-screen copy when `WONDERHOME_HOMESEND_EMAIL_DOMAIN` is unset. Server actions `homesend-allowlist-actions.ts` (Admin-only). Words `connectionsPage.email.*` and help (HomeSend ¶7) in all eight languages. Tests: matching/normalization, the webhook drop (no item, no fetch, only the counter), exact vs domain, empty = nothing, allowlist unit + webhook HS-016; RLS at test:db. Decisions: Admins manage the list (privacy gate for the whole household, like the forwarding address); match the message `from`, which an auto-forward rule preserves. |
| 12 | P2 | 17-017 | Read approved senders by signing in (Gmail / Outlook OAuth, read-only) | Not Started | The owner, 2026-10-29 (queued behind 17-016): the second way in — the household connects a mailbox by OAuth (read-only scope) instead of forwarding, and WonderHome pulls mail. The SAME `homesend_email_allowlist` gate applies: only approved senders' mail is read, everything else dropped, empty = nothing. Build on the dormant connected-mailbox path (`finance/email-connector`, `finance/email-sync`, the `integrations/email/sync` route, which 409s until a connector is live); a provider goes live only with real OAuth credentials, consent flow and integration tests (external-providers rule). Reuse `allowedHouseholdsForSender` / `senderMatchesAllowlist` at the sync boundary so the gate is identical to forwarding. Not started. |

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

### Story 17-016 — Email forwarding with a per-household sender allowlist
**Epic:** Communication, Weather & Smart Home
**Priority:** P1
**Goal:** Let a household read mail via forwarding, while WonderHome reads only the senders the household has approved.

**Acceptance criteria**
- Approved senders are stored per household as an exact address or a whole domain, member-readable and Admin-writable, versioned by add/remove with an audit trail, and indexed.
- The inbound email webhook drops a message whose sender is not on the recipient household's allowlist before it is stored: no HomeSend item, no further fetch, nothing from the message kept, only a non-personal dropped counter.
- An empty allowlist reads nothing; reading begins only once an Admin approves a sender, and the UI says so.
- A matched sender's mail runs the ordinary HomeSend pipeline and still waits for confirmation; bills, receipts and health always wait; content is untrusted.
- The match is on the message's own sender; no SPF/DKIM verification is claimed that the provider does not supply.
- An Admin can see the forwarding address and manage the allowlist on Connections; copy makes clear WonderHome never signs in to the inbox.
- Words and help in all eight languages; tests cover matching, the drop, who may edit (RLS), and empty behaviour.

**Status:** Done.

### Story 17-017 — Read approved senders by signing in (Gmail / Outlook OAuth, read-only)
**Epic:** Communication, Weather & Smart Home
**Priority:** P2
**Goal:** Offer a second way in — a read-only OAuth mailbox connection — behind the same approved-sender gate as forwarding.

**Acceptance criteria**
- The household connects a mailbox by OAuth with a read-only scope; no credential or live claim until real credentials, consent flow and integration tests exist.
- The same `homesend_email_allowlist` gate applies at the sync boundary: only approved senders' mail is read, everything else dropped, empty = nothing.
- Canonical models and the HomeSend confirmation step are unchanged; the connection is observable and revocable.

**Status:** Not Started (queued behind 17-016).

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.