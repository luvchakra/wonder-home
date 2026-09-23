# WonderHome — where the whole application stands

> Generated from `backlogs/*.md` by `npm run tracker`. **Do not edit by hand** —
> edit the backlog the story lives in and regenerate. `npm run tracker -- --check`
> fails when this file is out of date.

The backlogs are the source of truth for a story's status. This is a projection
of all twenty-two of them, so that "what is left" is one page rather than a
morning's reading. For what a given piece of work actually *was*, see the notes
in `docs/progress/`; for the running log of what changed when, `tracking/PROGRESS.md`.

## The whole picture

**185 of 195 stories done — 94.9%**

| Status | Stories |
|---|---:|
| Done | 185 |
| In Progress | 1 |
| Blocked | 0 |
| Not Started | 9 |

## By module

| Module | Progress | Done | Total | Left |
|---|---|---:|---:|---|
| 00 Project Bootstrap & Architecture | `██████████` | 10 | 10 | — |
| 01 Identity & Family Accounts | `██████████` | 8 | 8 | — |
| 02 Household Configuration & Playbook | `██████████` | 8 | 8 | — |
| 03 Outcome & Routine Engine | `████████░░` | 7 | 8 | 1 not started |
| 04 Conversation, Voice & Text | `█████████░` | 16 | 17 | 1 in progress |
| 05 Household Certification & Understanding | `██████████` | 8 | 8 | — |
| 06 Actionable Notification Engine | `██████████` | 8 | 8 | — |
| 07 Househelper & Home Operations | `████████░░` | 7 | 8 | 1 not started |
| 08 Kids & School Intelligence | `████████░░` | 8 | 9 | 1 not started |
| 09 Commerce, Groceries & Pet Supplies | `██████████` | 9 | 9 | — |
| 10 Meals & Cooking | `██████████` | 8 | 8 | — |
| 11 Bills, Fees & Finance | `██████████` | 8 | 8 | — |
| 12 Family Time & Social Activities | `██████████` | 8 | 8 | — |
| 13 Maintenance, Laundry & Pet Care | `██████████` | 8 | 8 | — |
| 14 AI Orchestration & Learning | `█████████░` | 13 | 14 | 1 not started |
| 15 Privacy, Security & Governance | `██████████` | 8 | 8 | — |
| 16 Platform Admin & Operations | `██████████` | 8 | 8 | — |
| 17 External Integrations | `███████░░░` | 6 | 8 | 2 not started |
| 18 API & Developer Platform | `████████░░` | 7 | 8 | 1 not started |
| 19 Testing, Observability & Production | `██████████` | 8 | 8 | — |
| 20 Subscriptions, Entitlements & Usage | `███████░░░` | 6 | 8 | 2 not started |
| 21 Health and Fitness | `██████████` | 8 | 8 | — |

## What is left

| Story | Module | Priority | Status |
|---|---|---|---|
| `03-008` Optimization | 03 Outcome & Routine Engine | P2 | Not Started |
| `04-017` Voice evaluation, metrics and release gates | 04 Conversation, Voice & Text | P0 | In Progress |
| `07-008` Service marketplace | 07 Househelper & Home Operations | P2 | Not Started |
| `08-009` Add a child from a school notice | 08 Kids & School Intelligence | P2 | Not Started |
| `14-008` Predictive intelligence | 14 AI Orchestration & Learning | P2 | Not Started |
| `17-006` WhatsApp | 17 External Integrations | P1 | Not Started |
| `17-008` Smart home | 17 External Integrations | P2 | Not Started |
| `18-008` Developer platform | 18 API & Developer Platform | P2 | Not Started |
| `20-007` Quota automation | 20 Subscriptions, Entitlements & Usage | P2 | Not Started |
| `20-008` Plan experiments | 20 Subscriptions, Entitlements & Usage | P2 | Not Started |

## Every story

### 00 — Project Bootstrap & Architecture

10 of 10 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `00-001` Initialize WonderHome monorepo | P0 | Done | apps/web + packages/core; npm workspaces |
| `00-002` Pin WonderArk-aligned stack | P0 | Done | Versions verified against founder-collab manifests |
| `00-003` Create application shell | P0 | Done | Tokens + shell + 5 primary areas |
| `00-004` Configure Supabase foundation | P0 | Done | Env contract + clients; migration 20260917003323 applied |
| `00-005` Configure quality gates | P0 | Done | Playwright mobile + desktop smoke |
| `00-006` Configure CI baseline | P0 | Done | GitHub Actions; lints are self-tested |
| `00-007` Create API foundation | P0 | Done | defineRoute wrapper; /health and /me |
| `00-008` Create security foundation | P0 | Done | Headers, middleware, route policy, redaction |
| `00-009` Create observability foundation | P1 | Done | Redacting structured logs; reporter seam |
| `00-010` Create feature configuration | P1 | Done | Flags + fail-fast startup validation |

### 01 — Identity & Family Accounts

8 of 8 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `01-001` Create household and owner | P0 | Done | Tenant model + creation path; auth/onboarding UI added (spec gap) |
| `01-002` Invite adult members | P0 | Done | Token digests only; expiry, revocation, single use, supersession |
| `01-003` Roles and permissions | P0 | Done | Permission catalogue; deny by default for child and helper |
| `01-004` Child profiles | P0 | Done | No account needed; guardianship links; age bands derived on read |
| `01-005` Personalized views | P0 | Done | Permission-filtered on the server, not hidden in the client |
| `01-006` Availability | P1 | Done | Pattern plus exceptions; an absence never rewrites a schedule |
| `01-007` Preferences | P1 | Done | Already built as 04-007/04-008: `memories` (scope, source_type, confidence, status), captured via conversation, corrected via Certification |
| `01-008` Helper/service identity | P2 | Done | Limited helper accounts already existed end-to-end (invitations, `ROLE_DEFAULTS.helper: []`, `/househelper` UI); the real gap was no RLS-level proof of the limits. New `scripts/test-helper-identity-rls.mjs` asserts a `member_type='helper'` row is refused `obligations` (finance) and another member's private conversation, cannot grant a role or create an invitation, but can read/write its own `member_availability` and read (not write) `household_roles` |

### 02 — Household Configuration & Playbook

8 of 8 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `02-001` Setup wizard | P0 | Done | Five resumable steps reading real config; dependency cycles refused; every change audited |
| `02-002` Responsibility matrix | P0 | Done | Canonical data; inactive and cross-household targets refused |
| `02-003` Household playbook | P0 | Done | Outcome keys, cadence, verification, escalation, dependencies |
| `02-004` Policies | P0 | Done | Versioned; one active version per policy name |
| `02-005` AI autonomy | P0 | Done | decideAutonomy at execution time; unconfigured means observe |
| `02-006` Configure by conversation | P0 | Done | Deterministic grammar → previewed proposal → the same validated, audited write |
| `02-007` Conflict detection | P1 | Done | `detectConflicts` over the household's current responsibilities and active members; orphaned owner/backup, a backup who is the owner, a child now on an adult-only outcome — each names the outcome, the member(s) and one resolution |
| `02-008` Advanced rule builder | P2 | Done | A policy can carry one condition (member type, or an hour window) narrowing it to a specific case; `selectApplicablePolicy` picks the most specific match, falling back to the household's unconditional default |

### 03 — Outcome & Routine Engine

7 of 8 done `████████░░`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `03-001` Outcome model | P0 | Done | Desired state, owner, window, verification — not a checklist item |
| `03-002` Routine model | P0 | Done | Routine separate from the outcomes it instantiates |
| `03-003` Monitoring | P0 | Done | Pure evaluation; normal operation is silent |
| `03-004` Exception detection | P0 | Done | Impact and recommended action are NOT NULL by design |
| `03-005` Replanning | P0 | Done | Downstream reachability computed, unaffected plans preserved |
| `03-006` Dependency graph | P1 | Done | `attachDependencies` turns the household's real dependency edges (the same ones `configuration.ts`'s `canDependOn` validates) into each outcome's own `dependencies`, carrying the upstream outcome's current status, feeding straight into the evaluation and replanning already built for 03-003/03-005 |
| `03-007` Pattern learning | P1 | Done | `pattern-learning.ts`: `findTimingPattern` looks at an outcome key's actually-met history and calls a normal timing only when completions cluster tightly enough (consistency ≥0.6, at least 4 samples) — scattered history says nothing. `proposeTimingPattern` turns a found pattern into the same `LearningProposal` shape module 14 uses everywhere (observed, capped confidence, status "learned"), and refuses outright — returns `null`, proposing nothing — once the household has confirmed a fact about that outcome's timing, the goal's own words made a caller-supplied fact so it is testable rather than assumed |
| `03-008` Optimization | P2 | Not Started | — |

### 04 — Conversation, Voice & Text

16 of 17 done `█████████░`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `04-001` Unified conversation engine | P0 | Done | Typed intent shared by both channels |
| `04-002` Natural commands | P0 | Done | Fixture-backed; unknown rather than a guess |
| `04-003` Contextual replies | P0 | Done | Resolved against the pending proposal, with expiry |
| `04-004` Action preview | P0 | Done | Summary, changes, reason, reversibility |
| `04-005` Voice | P0 | Done | Same engine; transcript confidence kept |
| `04-006` Text | P0 | Done | Same engine as voice |
| `04-007` Memory extraction | P0 | Done | Source, confidence and status on every belief |
| `04-008` Conversation corrections | P1 | Done | Reconciliation built and tested; corrections flow through the assistant and are written server-side |
| `04-009` A voice the household chooses | P1 | Done | Google Cloud Speech behind a provider contract, on the deployment's own key; every voice and recognition control, with the browser as the free fallback |
| `04-010` One composer, four states | P0 | Done | Speak-to-text and live conversation as separate, adjacent controls; explicit state machine with its own test |
| `04-011` Never ask the same question twice | P0 | Done | A clarifying question is answered by the next turn, and never repeated verbatim |
| `04-012` One HomeTalk gateway for every channel | P0 | Done | Voice phase 1 (`design/voice-integration/01…`): `hometalk/contract.ts` + `hometalk/gateway.ts` — one canonical request/response for web, Gemini Voice and Alexa; "completed" only from the executor's own record; idempotent per delivery (PR #131) |
| `04-013` Linked voice assistants: identity, OAuth, scopes | P0 | Done | Voice phase 2: `external_voice_identities` + `voice_oauth_grants` (hashed), S256 PKCE, scopes only narrow, payments/orders never by voice, turns under the member's own RLS session, `/settings/voice-assistants` to revoke (PR #131) |
| `04-014` Gemini Voice: Gemini Live as a HomeTalk channel | P0 | Done | Voice phase 3: `voicelink/gemini-live.ts` (12 allowlisted tools, each only words a member could say to HomeTalk), single-use Live tokens locked to that config, `/voice/gemini/session` + `/voice/gemini/tool`, facts narrowed to the content classes the household lets reach Google, `useGeminiLive` behind the one live control, `live_engine` voice setting. Live-verified token → Gemini Live → tool → HomeTalk → spoken answer; in-browser mic audio not exercisable in the sandbox (its proxy has no WebSocket upgrades) |
| `04-015` Alexa as a HomeTalk channel | P1 | Done | Voice phase 4: `/api/v1/voice/alexa` verified as Amazon documents (cert chain, signature, timestamp, skill id), carrier-word interaction model; inert until a person creates the skill and sets `ALEXA_*` (`integrations/alexa/README.md`) |
| `04-016` Unified voice experience and capability matrix | P0 | Done | Voice phase 5: `voicelink/capabilities.ts` — the spec's matrix as data, every HomeTalk action placed once, every cell held to the real gates by `capabilities.test.ts`, shown to households on `/settings/voice-assistants`; payments/orders stay app-only by voice (stricter than the spec, on purpose). Conversations belong to their surface (`conversation_sessions.surface`: app / alexa, migration `20260926100000`, applied live) — a question the app asked is never answered by Alexa. Everyday domain questions ("what's for dinner?", "do we need milk?", "do the kids have homework?") now read by the rules |
| `04-017` Voice evaluation, metrics and release gates | P0 | In Progress | Voice phase 6 built: golden voice scenarios and a blocking `voice` gate in `npm run eval` (`voicelink/readiness.ts`); per-channel telemetry `hometalk_channel_events` (migration `20260926110000`, applied live) with the spec's metrics at `GET /platform-admin/voice-metrics`; Gemini tool calls capped per session; structured Gemini tool sentences read by the rules first. Left, and needing a person: a real Alexa end-to-end run (the skill must be created), a device-level Gemini Live audio run, and a rendered dashboard with alert delivery |

### 05 — Household Certification & Understanding

8 of 8 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `05-001` Certification overview | P0 | Done | Source on every claim; coverage counted, never estimated |
| `05-002` Source attribution | P0 | Done | Source on every claim; coverage counted, never estimated |
| `05-003` Confirm | P0 | Done | Source on every claim; coverage counted, never estimated |
| `05-004` Correct/remove | P0 | Done | Source on every claim; coverage counted, never estimated |
| `05-005` Risk prioritization | P0 | Done | Source on every claim; coverage counted, never estimated |
| `05-006` Actionable certification alerts | P0 | Done | Source on every claim; coverage counted, never estimated |
| `05-007` Certification history | P1 | Done | Reads the append-only `certification_reviews` trail `reviewCertificationAction` already wrote; a new History tab shows who reviewed what, the decision and the before/after claim, each row scoped by the RLS the item itself carries |
| `05-008` Certification health | P2 | Done | `certificationHealth` breaks `summarize()`'s single percentage down by risk level, so a household reading "90% understood" cannot be shown that number while the one high-risk belief driving the missing 10% sits unreviewed. Wired into `/certification`'s own summary card: the explanation line appears only when a high or critical item actually needs review, staying silent (rule: normal is silent) the rest of the time |

### 06 — Actionable Notification Engine

8 of 8 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `06-001` Decision engine | P0 | Done | One recipient, a reason, and something they can do |
| `06-002` Actionable types | P0 | Done | One recipient, a reason, and something they can do |
| `06-003` Recipient routing | P0 | Done | One recipient, a reason, and something they can do |
| `06-004` Timing | P0 | Done | One recipient, a reason, and something they can do |
| `06-005` Escalation | P0 | Done | One recipient, a reason, and something they can do |
| `06-006` Lifecycle | P0 | Done | One recipient, a reason, and something they can do |
| `06-007` Threading/grouping | P0 | Done | One recipient, a reason, and something they can do |
| `06-008` Channels | P1 | Done | in_app is live; push/email/whatsapp are fixture adapters + real per-channel preferences UI, honest that they are not connected yet — module 06 complete |

### 07 — Househelper & Home Operations

7 of 8 done `████████░░`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `07-001` Normal helper model | P0 | Done | Outcomes and windows, never per-chore status |
| `07-002` Availability/leave | P0 | Done | Outcomes and windows, never per-chore status |
| `07-003` Backup planning | P0 | Done | Outcomes and windows, never per-chore status |
| `07-004` Exception handling | P0 | Done | Outcomes and windows, never per-chore status |
| `07-005` Helper privacy | P0 | Done | Outcomes and windows, never per-chore status |
| `07-006` Optional daily summary | P1 | Done | `buildDailySummary`: one digest of what was unusual, built only from exceptions `handleHelperException` already routed to `tell_household` and an absence left uncovered — a handled exception or a fully-covered absence stays silent, matching the module's own rule that normal work needs no update. Opt-in by construction: nothing depends on anyone reading it, and a quiet day says so in one line rather than nothing |
| `07-007` Pattern learning | P1 | Done | Normal timing is already covered by reusing 03-007's `findTimingPattern` directly — it operates on any `Outcome[]`, helper-owned outcomes included. New: `findMissPattern`/`proposeMissPattern` call a recurring miss only when the same exception kind keeps recurring for one outcome (≥3 occurrences, ≥0.6 concentration), and never propose anything once the household has confirmed a fact about it — the same confirmed-rule gate 03-007 uses |
| `07-008` Service marketplace | P2 | Not Started | — |

### 08 — Kids & School Intelligence

8 of 9 done `████████░░`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `08-001` Child responsibility | P0 | Done | age-appropriate effort, sitting length and a child's own view |
| `08-002` School connector | P0 | Done | school connector on the shared contract; broken never looks like empty |
| `08-003` Assignment ingestion | P0 | Done | canonical items keyed by provider identity; a portal cannot mark work done |
| `08-004` Study planning | P0 | Done | work split into sittings that fit the time; what will not fit is reported |
| `08-005` Deadline risk | P0 | Done | risk is time against remaining effort, not the calendar |
| `08-006` Document workspace | P1 | Done | documents by reference, guardian-gated in the API and in RLS |
| `08-007` School summaries | P1 | Done | only messages that ask something surface; a newsletter is filed |
| `08-008` Deep portal automation | P2 | Done | adapter seam and scopes in place; no portal is live (CLAUDE.md) |
| `08-009` Add a child from a school notice | P2 | Not Started | Found in the test-spec live run (23 Sep 2026): a household with no child on record cannot confirm a school notice — offer to add the child inline |

### 09 — Commerce, Groceries & Pet Supplies

9 of 9 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `09-001` Consumable model | P0 | Done | a rate and its evidence, never an inventory somebody must keep accurate |
| `09-002` Suggested cart | P0 | Done | every suggestion carries why, how much and by when |
| `09-003` Commerce adapter | P0 | Done | commerce adapter on the shared connector contract; nothing live |
| `09-004` Purchase approval | P0 | Done | one deterministic allow/approve/refuse used by both the API and the tool gate |
| `09-005` Auto recurring orders | P1 | Done | idempotency keyed on the basket, so a retry cannot buy twice |
| `09-006` Order tracking | P1 | Done | only a real transition moves an outcome, so a poll cannot duplicate a notification |
| `09-007` Pet supply prediction | P1 | Done | pet supplies use the same depletion model, scoped to the animal |
| `09-008` Merchant optimization | P2 | Done | cheapest that can actually deliver in time; stale prices are excluded |
| `09-009` A receipt becomes purchase history | P1 | Done | Found by the test spec's live E2E-002 (23 Sep 2026): a paid receipt sent through HomeSend is now correctly not a bill, but nothing records the purchase — `consumable_purchases` is modelled and never written |

### 10 — Meals & Cooking

8 of 8 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `10-001` Meal outcome | P0 | Done | readiness for eating, with no preparation step anybody ticks |
| `10-002` Meal planning | P0 | Done | plans against real time, preferences and what is actually in |
| `10-003` Ingredient dependencies | P0 | Done | a shortage writes a shopping suggestion, never an informational note |
| `10-004` Cooking responsibility | P0 | Done | the cook is a named responsibility; an absent cook is raised before the clock |
| `10-005` Adaptive replanning | P1 | Done | replans on change but will not move protected family time on its own |
| `10-006` Recipe intelligence | P1 | Done | every recommendation names a next action: cook, shop, substitute or defer |
| `10-007` Advanced nutrition | P2 | Done | preference scope and source kept so a dislike never becomes a house rule |
| `10-008` Cooking automation hooks | P2 | Done | readiness accepts an observed source, so an appliance signal has somewhere to land |

### 11 — Bills, Fees & Finance

8 of 8 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `11-001` Obligation model | P0 | Done | an obligation may exist before its amount does, which is the normal case |
| `11-002` Bill ingestion | P0 | Done | provider identity makes a re-import reconcile rather than duplicate |
| `11-003` Due-date risk | P0 | Done | lead time by consequence, and silence once a payment is arranged |
| `11-004` Approval | P0 | Done | approval is for one exact amount; a changed figure invalidates it |
| `11-005` Payment safety | P0 | Done | step-up is separate from being signed in; one success per intent, enforced by index |
| `11-006` Anomaly detection | P1 | Done | an anomaly carries its comparison and is a review, never a block |
| `11-007` Budget planning | P1 | Done | a budget describes intent; it never stops the rent being paid |
| `11-008` Autonomous recurring payments | P2 | Done | policy and idempotency in place; no payment provider is live |

### 12 — Family Time & Social Activities

8 of 8 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `12-001` Family events | P0 | Done | events keep their participants, so a commitment constrains the right people |
| `12-002` Protected family time | P0 | Done | protected is a column; automation can ask about it and cannot spend it |
| `12-003` Common availability | P0 | Done | free/busy only — wh.busy_windows returns times, never what anybody is doing |
| `12-004` Family activity planning | P1 | Done | at most three options, filtered by free time, budget, travel and age |
| `12-005` Social events | P1 | Done | every social event has an owner and an explicit action state |
| `12-006` Gift planning | P1 | Done | gifts planned against an explicit occasion, never guessed from a date |
| `12-007` Conflict detection | P1 | Done | both sides named and a proposal made; never a silent move |
| `12-008` End-to-end outing | P2 | Done | outing planning composes availability, conflicts and gifts already built |

### 13 — Maintenance, Laundry & Pet Care

8 of 8 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `13-001` Asset registry | P0 | Done | home_assets + service history; agenda is action-only, never an inventory |
| `13-002` Maintenance outcomes | P0 | Done | device wear brings a service forward, never pushes it back |
| `13-003` Laundry readiness | P0 | Done | readiness from deadline and inferred state; no wash/dry/fold check-ins |
| `13-004` Home exceptions | P0 | Done | cover surfaced at the moment of failure; silent when reorderable |
| `13-005` Weather-aware planning | P1 | Done | provider port + fixtures + server-side entitlement; no live provider |
| `13-006` Service coordination | P1 | Done | next_action_by makes an open request actionable, not informational |
| `13-007` Pet care outcomes | P1 | Done | outcome-based; medication never looks like grooming |
| `13-008` Smart-home signals | P2 | Done | optional signals, server-ingested only; members cannot write evidence |

### 14 — AI Orchestration & Learning

13 of 14 done `█████████░`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `14-001` Household orchestrator | P0 | Done | Authorization outside the model; approval binds to the exact action. 2026-09-20: the Household Brain (`conversation/brain.ts`, v4 §5) gathers every domain into one consented context, and a question is answered from all of it |
| `14-002` Governed tools | P0 | Done | Authorization outside the model; approval binds to the exact action |
| `14-003` Plan/execute/monitor loop | P0 | Done | Authorization outside the model; approval binds to the exact action. 2026-09-20: "understand" now reads the whole home (v4 §6 context assembly, cross-domain reasoning, result interpretation), not one domain's summary |
| `14-004` Agent runs | P0 | Done | Authorization outside the model; approval binds to the exact action |
| `14-005` Approval integration | P0 | Done | Authorization outside the model; approval binds to the exact action |
| `14-006` Learning boundaries | P0 | Done | Authorization outside the model; approval binds to the exact action |
| `14-007` Multi-agent coordination | P1 | Done | `specialists.ts`: named specialists (meals, pets, home, bills, groceries) each propose `PlannedStep`s from `HomeAssessment`s for the existing governed tool registry; a contract (`grocery_list`) is how a meal or pet need it cannot itself fulfil is handed to groceries, which consolidates every producer's list into one deduplicated set of steps. `coordinate()` runs them in order and returns one plan; `AgentRun` gained a `contracts` field and `agent_runs.contracts` column to record what was handed off, alongside the plan `authorizeToolCall` still gates step by step |
| `14-008` Predictive intelligence | P2 | Not Started | — |
| `14-009` Household context & grounding engine (Wave 1) | P0 | Done | `packages/core/src/context/`: a derived, rebuildable layer over the domain repositories, read only through the member's own RLS client (never the service role, never `.rpc`). One canonical `HouseholdContextItem` per fact with provenance, freshness (current/stale/historical/superseded/unknown), tier 1–4 and privacy class; health's private/selected_family/household_operational scopes preserved with no admin shortcut. Retrieval API (`resolvePerson`, `resolveEntity`, `resolveReference`, `findRelevantFacts`, `findPotentialMatches`, `findPotentialConflicts`, `getCurrentState`, `getRecentChanges`, `getSupportingEvidence`); resolution never silently picks a low-confidence consequential target — it resolves, clarifies or asks. HomeBrain's context and question relevance, HomeTalk's person/grocery/health-issue resolution and HomeSend's duplicate reconciliation all go through it; every successful write invalidates it. 14 golden scenarios + 18 engine tests; live count-only check: an impersonated member sees 0 rows from 12 other households across all 29 tables the engine reads |
| `14-010` HomeBrain 2.0 — grounded household reasoning (Wave 2) | P0 | Done | Spec: `design/HOMEBRAIN-2.0-WAVE-2.md`. Part 1 (grounded reasoning core): `packages/core/src/homebrain/` — question reading (intent/entity/time/domain hints, cross-domain connection, follow-ups, ambiguity → one focused question), the `GroundedFact` contract (opaque `F`-ids, sources, confidence, privacy class), the §14 prompt contract with cited `usedFacts`, post-generation validation (unsupported names/dates/amounts/events/health/integration/"done" claims) with one tighter regeneration then a deterministic answer then an honest "not on record", deterministic "why?" answers from recorded evidence, and the five modes (done only after an executor confirms). Part 2 (current truth): preferences keyed by subject and object (`parsePreference`), so "Actually Asmi is okay with mushrooms now" supersedes "Asmi doesn't like mushrooms" with history kept; every learned preference is written to HomeBrain Review (`certification_items.memory_id`, backfilled live by `20260923120000_homebrain_review_links_memories.sql`) with its correction recorded; Review decisions (confirm, correct, remove) update what HomeBrain reads; beliefs added in Review are read by HomeBrain with their provenance; the screen is renamed HomeBrain Review and shows source, when learned, confidence and confirmation. Fixed: adding a belief in Review was always refused by RLS |
| `14-011` HomeSend 2.0 — multimodal intake & reconciliation (Wave 3) | P0 | Done | Spec: `design/HOMESEND-2.0-WAVE-3.md`. Part 1 (one pipeline, every input): `packages/core/src/homesend/ingest.ts` — every entry point (upload, paste, composer paperclip, share target, share handoff, email webhook) goes secure intake → normalize → understand → the canonical `IntakeUnderstanding` (`understanding.ts`: summary, entities, facts, candidate actions from a fixed list, references, change signal, safety, provenance). New inputs: PDF (read by the model as a document, so scanned PDFs too), TXT/CSV, links (`link-fetch.ts`: SSRF-safe — public addresses only, DNS checked and pinned, redirects re-checked, size/time limits, no cookies), voice notes (`audio.ts`: transcript confidence gate, uncertain or consequential transcripts shown and confirmed, never acted on). Types decided from bytes (`normalize.ts`), prompt-injection defense (`injection.ts`: fenced untrusted content, flagged instructions ignored and said so), content-hash idempotency, "Failed safely" inbox state with reasons, HTML-only emails read instead of dropped. Migration `20260924090000_homesend_multimodal_intake.sql` (applied live). Part 2: entity resolution through the Wave 1 resolver (`resolve.ts`, one question when ambiguous — "Who is this for — Asmi or Manan?"), reconciliation (`reconcile.ts`: duplicate / update / cancellation / conflict against the record on file, the spec's own "Update the existing event?"), updates and cancellations through the domain services with exact undo (`homesend_changes.change_type` + `previous`, migration `20260924100000_homesend_reconciliation_changes.sql`, applied live), several needs per notice each separately confirmed and undone, review UI (What I found / Update existing / Keep existing / Add as new), email 2.0 (every recipient, HTML bodies, attachments as their own items via Resend's attachment API, idempotent retries). Part 3: confirmation strategy (`confirmation.ts`, §12 — a new grocery or school item applies on its own only when read clearly, sent in by a member, matching nothing on record, with no question open, and only where the household set that outcome to "execute"; bills and health documents always wait for a person; medium confidence prepares, low confidence asks one question), review outcomes kept on each item in closed words (migration `20260924110000_homesend_review_outcomes.sql`, applied live), HomeSend metrics (`metrics.ts`, §19, each a count out of a count, `GET /api/v1/platform-admin/homesend-metrics`), and the §20 acceptance matrix, one test per row (`acceptance-matrix.test.ts`). Live email still waits on a Resend account and receiving domain (§18) and is not labelled connected |
| `14-012` HomeTalk 2.0 — contextual conversational operations (Wave 4) | P0 | Done | Spec: `design/HOMETALK-2.0-WAVE-4.md`. Part 1 (grounding): `conversation/temporal.ts` — one deterministic resolver for today/tomorrow/tonight/this and next Friday/this weekend/next week/after school/before dinner/explicit dates, in the household's timezone (the model names the phrase, code decides the day); `conversation/grounding.ts` — every action intent is grounded before a proposal exists: person mentions through the Wave 1 resolver (one focused question when two fit, "I do not know anyone called…" when none do), dates to local days, "that/it/them/him/the other one" through `conversation/references.ts` in the spec's priority order (pending question → pending proposal → recent conversation and recent HomeSend by recency → context), with "Do you mean the white T-shirt from the school notice or the printer paper?" when two things are in play; each turn persists its focus (what it acted on, proposed or mentioned) on its reply for the next turn's "that". Part 2 (operations): corrections (`conversation/corrections.ts`) amend a waiting proposal or undo-then-redo an executed write through its own domain service; multi-part sentences split (`conversation/decompose.ts`) into independently gated parts with the premise rule; several items per add; real reminders (`set_reminder`, a notification held until due); meals (`plan_meal` via `createMeal`/`attachIngredients`) and "make sure we have everything" from the recipe's ingredients; "Nothing to change" instead of "Done" when nothing was written Part 3 (contract): the model sees a runtime context (role, local date/time, what is waiting, what the conversation is about — minimised like the utterance) and returns named, nullable parameters with no id field, and anything server-only is stripped from its output; "I think you mean …" at medium confidence and "I found two possibilities …" at low; every §21 example handled through its own domain service (school done/move, remove from list, service request, protected family time); §22 matrix in `conversation/evaluation.test.ts` |
| `14-013` Unified AI evaluation, reliability & production hardening (Wave 5) | P0 | Done | Spec: `design/AI-EVALUATION-WAVE-5.md`. One evaluation framework for HomeTalk, HomeSend and HomeBrain; synthetic golden households; §8 metrics and the §10 error taxonomy; corrections as structured evaluation evidence; provider/model/prompt/context versions recorded per run; release artifact and gates; rate and payload limits; failure semantics; idempotency; email-forwarding monitoring |
| `14-014` HomeSend reads the time of day | P1 | Done | Local start and end read deterministically from the notice's own date words (`timeFromDateText`); `school_items.due_time_known` + `ends_at` (migration `20260927090000`, applied live); all-day items never show a time |

### 15 — Privacy, Security & Governance

8 of 8 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `15-001` Threat model | P0 | Done | security/THREAT-MODEL.md; revised as surfaces are added |
| `15-002` Tenant isolation | P0 | Done | Catalogue-driven coverage test; proven to detect violations |
| `15-003` RBAC/privacy scopes | P0 | Done | Permission catalogue plus server-side view filtering |
| `15-004` Encryption/secrets | P0 | Done | Secret lint; redaction; HSTS and secure cookies |
| `15-005` AI privacy | P0 | Done | Consent gate before assembly; context minimised and pseudonymised; retry is idempotent |
| `15-006` Audit | P0 | Done | Catalogue with a coverage test; nine unrecorded actions closed; household-facing trail |
| `15-007` Privacy Center | P0 | Done | Step-up that actually verifies; export, deletion with a grace window, retention applied by a nightly sweep |
| `15-008` Security testing | P0 | Done | Nine-area suite with a deterministic signal; SSRF guard, prompt-injection and session-abuse coverage |

### 16 — Platform Admin & Operations

8 of 8 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `16-001` Separate admin boundary | P0 | Done | Separate boundary; household roles confer nothing here |
| `16-002` Admin roles | P0 | Done | Platform capabilities per role, tested |
| `16-003` Operations dashboard | P0 | Done | Aggregate counts behind the boundary |
| `16-004` Support access | P0 | Done | Grants bounded to 24h; household can read them |
| `16-005` Subscription administration | P0 | Done | operator/owner only; reason-coded, audited, reuses 20-004's changePlan |
| `16-006` AI operations | P0 | Done | Failed-run + tool-call monitoring; reuses module 14's prompt-free schema |
| `16-007` Privacy requests | P1 | Done | `fulfillMaturedDeletions` (the real deletion job 15-007 never built — scrubs a member's PII, keeps the row and its references readable); `privacy-requests.ts` gives staff list/refuse (operator/owner only), wired into `/platform/retention`'s existing sweep |
| `16-008` Feature flags/audit | P1 | Done | `feature-flags.ts`: a reason-coded, audited `setHouseholdFeatureFlag` (operator/owner only, following 16-005's exact shape) turns a staged capability on or off for one household; a household reads its own flags via RLS, matching support-access grants' "the family this concerns can see it" precedent. `audit-log.ts`: `listPlatformAuditEvents` widens who may read the already-redacted `audit_events` rows fleet-wide, never what is safe to show |

### 17 — External Integrations

6 of 8 done `███████░░░`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `17-001` Connector framework | P0 | Done | connector contract, health, dedupe, fixtures; no live provider yet |
| `17-002` Calendar | P0 | Done | canonical payload → family_events by provider identity; never protected/confirmed; private = time only; partial sync never cancels; POST integrations/calendar/sync (409 until a provider is live) |
| `17-003` Email | P0 | Done | recognised bills → obligations by provider identity + content hash; status never touched by a sync; POST integrations/email/sync (409 until a provider is live) |
| `17-004` School | P0 | Done | translate() extended with contentHash + provider-cancellation signal; reconciled onto school_items by identity; cancel never overrides done/submitted; POST integrations/school/sync (409 until a provider is live) |
| `17-005` Commerce | P0 | Done | Merchant reports reconciled by identity + hash; lifecycle refuses a rewind, a reprice never overwrites the approved figure; POST integrations/commerce/sync (409 until a merchant is live) |
| `17-006` WhatsApp | P1 | Not Started | — |
| `17-007` Weather | P1 | Done | Open-Meteo behind the 13-005 weather port; an Admin picks an area (coordinates rounded to ~1 km, `weather_locations`), the forecast is cached hourly on the household's row, entitlement `home.weather` decided on the server; laundry/drying plans around it; outages recorded on the connection only, last forecast serves ≤6 h; off unless the deployment sets `WONDERHOME_WEATHER_PROVIDER=open-meteo` |
| `17-008` Smart home | P2 | Not Started | — |

### 18 — API & Developer Platform

7 of 8 done `████████░░`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `18-001` Versioned API | P0 | Done | Established in 00-007; /api/v1 with correlation ids |
| `18-002` Schemas/errors | P0 | Done | Zod validation and one error envelope |
| `18-003` Auth/authorization | P0 | Done | requireUser plus household scope; RLS behind it; authentication settled before the body is read |
| `18-004` Idempotency | P0 | Done | Idempotency-Key replay with request fingerprinting |
| `18-005` OpenAPI | P0 | Done | Generated from the route schemas, served at /api/v1/openapi; E2E derives the endpoint list from disk so it cannot go stale |
| `18-006` Audit hooks | P0 | Done | recordAuditEvent with redaction; never fails the request |
| `18-007` Webhooks/events | P1 | Done | `household_webhooks`/`webhook_deliveries`: a household subscribes an HTTPS URL to 5 real events (member.added/removed, subscription.changed, privacy.deletion_fulfilled, homesend.applied), gets a Svix-style-signed (`t=<ts>,v1=<sig>`) versioned payload with retry/backoff over ~1 day; both tables unreachable from any client session, admin included, since every write already goes through the admin client and a WHERE-conditioned write on a no-SELECT-policy table silently no-ops for every session (found empirically while building this); `deliver.ts` drains the queue via a new `CRON_SECRET`-gated route/cron; live-verified end to end against webhook.site with an independently-recomputed HMAC match |
| `18-008` Developer platform | P2 | Not Started | — |

### 19 — Testing, Observability & Production

8 of 8 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `19-001` Automated tests | P0 | Done | Unit, script, database and E2E suites in CI |
| `19-002` Authorization tests | P0 | Done | Catalogue-driven coverage; proven to detect violations |
| `19-003` AI evaluations | P0 | Done | Golden scenarios evaluated against deterministic policy |
| `19-004` Health checks | P0 | Done | Liveness and readiness separated; probes time out |
| `19-005` Safe logging | P0 | Done | Structured logs, redaction, correlation ids |
| `19-006` Error monitoring | P0 | Done | Reporting seam; failures never silently dropped |
| `19-007` Performance | P1 | Done | Region co-location, local JWT verification, request-scoped dedup, prefetching, streaming; live p95 measured against production (see docs/progress) |
| `19-008` Recovery/runbook | P1 | Done | `docs/RECOVERY-RUNBOOK.md`: RPO/RTO targets, the PITR restore path, the full-rebuild-from-migrations path (already continuously proven by every `test:db` CI run, not a path only exercised in an emergency), and a post-restore verification sequence (`test:db` → `verify:live` → `/health`/`health/ready` → `get_advisors`). This pass also read the live project's real security/performance advisories and found a genuine gap — an `rls_auto_enable()` event trigger live on production with no corresponding migration file — recorded rather than fixed, since closing it is a live production change and this pass could not confirm how migrations actually reach production |

### 20 — Subscriptions, Entitlements & Usage

6 of 8 done `███████░░░`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `20-001` Plan model | P0 | Done | free/pro/max seeded as data; changing a plan is a migration |
| `20-002` Entitlements | P0 | Done | one server-side entitlement service; hiding a feature is never the control |
| `20-003` Usage metering | P0 | Done | atomic counters proven against 20 concurrent sessions |
| `20-004` Upgrade/downgrade | P0 | Done | A change writes one row and never a household record; consequences shown and re-derived before applying; audited |
| `20-005` Usage UI | P1 | Done | Settings shows used/limit per metered feature, from the same counter `consume` enforces against |
| `20-006` Billing abstraction | P1 | Done | Provider-neutral `BillingProvider` port + pure `applyBillingEvent` (out-of-order and other-subscription events ignored, cancellation falls back to free, never deletes); Stripe adapter code-complete and inert (intent id as Idempotency-Key, HMAC-verified webhooks); `billing_intents` (one open per household+plan) and `billing_events` (unique per provider event) with RLS; `plans.requires_payment` keeps paid plans out of reach of any household session |
| `20-007` Quota automation | P2 | Not Started | — |
| `20-008` Plan experiments | P2 | Not Started | — |

### 21 — Health and Fitness

8 of 8 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `21-001` Health foundation & privacy | P0 | Done | Schema (`health_profiles`/`health_provenance`/`health_consents`), `wh.may_see_health` (no admin bypass), Overview + Privacy screens at `/health`, live-verified 2026-09-22 |
| `21-002` Appointments | P0 | Done | Progressive booking wizard, confirm/complete/cancel, reschedule (new row + old marked rescheduled), deterministic conflict/duplicate detection, day-granularity reminder sweep folded into `/platform/retention`, live-verified 2026-09-22 |
| `21-003` Health issues | P0 | Done | `health_issues` (status `mentioned→active→monitoring→resolved→closed`, `resolved_at` DB-enforced), deterministic `assessForMedicalAttention` (never a diagnosis), provenance row carries no health content, Overview groups active/mentioned into Needs attention, monitoring into its own section, resolved/closed into Recent, record/edit/status-change UI, live-verified 2026-09-22 |
| `21-004` Checkups & preventive care | P0 | Done | `health_checkups` (source enum, `cadence_days`, `next_due_on`/`last_completed_on`), linked bidirectionally to `health_appointments.checkup_id`; completing/cancelling the linked appointment syncs the checkup automatically; overdue → Needs attention, due soon → Coming up, silent otherwise; add/edit(+reschedule)/complete/remove/bring-back UI, live-verified 2026-09-22 |
| `21-005` Health records & HomeSend intake | P0 | Done | `health_records` (member, `record_type`, `document_date`, `file_path`, `status` active/archived), own privacy-scoped `health-records` storage bucket (object read requires `wh.may_see_health`, not just membership); HomeSend gains a `health_document` intake kind with its own extraction fields (`healthRecordType`/`documentDate`/`subjectMemberName` — a name hint only, never trusted to pick an identity) and its own confirm-form section; `home_send_items` narrowed to sender-only visibility for `health_document` items until routed (every other kind stays shared-inbox); routing copies the file from HomeSend's bucket into the privacy-scoped one; Overview's Recent shows both active and archived records so "bring back" stays reachable, live-verified 2026-09-22 |
| `21-006` HomeBrain & HomeTalk health context | P0 | Done | New `health.manage` permission (head/administrator/adult only); 5 new HomeTalk rules recognizing the spec's own example utterances (record an appointment, log/resolve an issue for real; log a vital / set a fitness goal honestly "prepared, not done" — no backing write exists) plus a health-scoped `ask_status` rule ("what health appointments do I have this month?"); `health/domain-agenda.ts`'s `healthAgenda()` joins `gather-assessments.ts`'s fan-out exactly like every other domain; a new `healthSpecialist` proposes `health.notify_overdue` for an overdue checkup only, executed via `ai/executors.ts`'s `notifyOverdueHealth` (needs `run.ts`'s admin client, now passed through `runExecutor`'s new optional 4th param) using the existing `notifications` pipeline; `conversation/brain.ts`'s HomeBrain reads open appointments/issues/due-or-overdue checkups only for a viewer holding `health.manage`, tagged `contentClass: "health"` so an unrelated question never surfaces them and the household's own consent policy (default: none) decides whether a model ever sees them; live-verified 2026-09-22 |
| `21-007` Vitals & measurement routines | P1 | Done | `health_measurement_routines` (created first, `cadence_days`/`preferred_time`/`reminder_enabled`/`next_due_on`/`last_completed_on`) and `health_vitals` (`value`/`secondary_value` for a paired reading like blood pressure, free-text `unit`, `status` active/archived, `routine_id` traces a reading back to the routine that produced it), same self-or-guardian RLS shape as every other health entity; `completeRoutine` records the real reading and advances `next_due_on` by the routine's own cadence in one step; `summarizeVitalTrend`/`describeVitalTrend` are pure verifiable arithmetic ("your last N readings were recorded over the past M weeks"), never a stated conclusion; HomeTalk's `log_vital` now actually executes via `createVital` — blood pressure/pulse/steps resolve without an explicit unit (their one conventional unit), every other type requires one or is honestly declined; day-scale reminder sweep (`routine-reminders.ts`) folded into `/platform/retention` alongside appointment/checkup reminders; add/edit/archive/reactivate UI for vitals, add/edit/complete/dismiss/reactivate UI for routines; live QA surfaced and fixed two real gaps — a dismissed routine with no completion history had no path back to "Bring back" (now included in Recent), and HomeTalk only recognized "My X was Y" phrasing (added "Log/Record my X as Y"); live-verified 2026-09-22 |
| `21-008` Fitness & connected-health scaffolding | P1 | Done | `health_fitness_goals`/`health_fitness_sessions` (new migration, applied live, verified via direct schema/RLS introspection — no local Supabase credentials available in this session to run `verify:live`'s scripted checks), same self-or-guardian RLS shape as every other health entity; `health/health-provider.ts`'s `HealthProvider` is a real registry — manual/home_talk/home_send/calendar declared `live: true`, apple_health_kit/android_health_connect/wearable `live: false` and refused by `assertHealthProviderLive` before any write; `health/fitness.ts`'s goal (active/dismissed, mirroring measurement routines) and session (active/archived, mirroring vitals) services depend only on that abstraction, never a provider SDK. No leaderboard, no guilt messaging, no child fitness surveillance anywhere in the module — a goal or session lives only in Overview's Recent, never escalated to Needs attention. HomeTalk's `set_fitness_goal` ("I want to walk three times a week") now genuinely executes via `createFitnessGoal`, replacing the "not tracked yet" stub from 21-006; `mapFitnessActivity` maps free speech onto the known activity set or keeps the household's own words. Add/edit/dismiss/reactivate UI for goals and add/edit/archive/reactivate for sessions on `/health`, a session optionally linking to the goal it counts toward. `countSessionsInCurrentPeriod` is pure, verifiable arithmetic, never a scored conclusion. OpenAPI extended with the four new routes |

_Generated 2026-09-23 from 22 backlog files._
