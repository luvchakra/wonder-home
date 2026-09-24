# WonderHome — where the whole application stands

> Generated from `backlogs/*.md` by `npm run tracker`. **Do not edit by hand** —
> edit the backlog the story lives in and regenerate. `npm run tracker -- --check`
> fails when this file is out of date.

The backlogs are the source of truth for a story's status. This is a projection
of all twenty-two of them, so that "what is left" is one page rather than a
morning's reading. For what a given piece of work actually *was*, see the notes
in `docs/progress/`; for the running log of what changed when, `tracking/PROGRESS.md`.

## The whole picture

**218 of 225 stories done — 96.9%**

| Status | Stories |
|---|---:|
| Done | 218 |
| In Progress | 4 |
| Blocked | 0 |
| Not Started | 3 |

## By module

| Module | Progress | Done | Total | Left |
|---|---|---:|---:|---|
| 00 Project Bootstrap & Architecture | `██████████` | 10 | 10 | — |
| 01 Identity & Family Accounts | `██████████` | 9 | 9 | — |
| 02 Household Configuration & Playbook | `██████████` | 9 | 9 | — |
| 03 Outcome & Routine Engine | `██████████` | 8 | 8 | — |
| 04 Conversation, Voice & Text | `█████████░` | 16 | 17 | 1 in progress |
| 05 Household Certification & Understanding | `██████████` | 8 | 8 | — |
| 06 Actionable Notification Engine | `██████████` | 8 | 8 | — |
| 07 Househelper & Home Operations | `██████████` | 8 | 8 | — |
| 08 Kids & School Intelligence | `██████████` | 9 | 9 | — |
| 09 Commerce, Groceries & Pet Supplies | `██████████` | 9 | 9 | — |
| 10 Meals & Cooking | `██████████` | 8 | 8 | — |
| 11 Bills, Fees & Finance | `██████████` | 8 | 8 | — |
| 12 Family Time & Social Activities | `██████████` | 8 | 8 | — |
| 13 Maintenance, Laundry & Pet Care | `██████████` | 8 | 8 | — |
| 14 AI Orchestration & Learning | `██████████` | 19 | 19 | — |
| 15 Privacy, Security & Governance | `██████████` | 8 | 8 | — |
| 16 Platform Admin & Operations | `██████████` | 8 | 8 | — |
| 17 External Integrations | `██████████` | 8 | 8 | — |
| 18 API & Developer Platform | `████████░░` | 7 | 8 | 1 not started |
| 19 Testing, Observability & Production | `██████████` | 8 | 8 | — |
| 20 Subscriptions, Entitlements & Usage | `█████████░` | 10 | 11 | 1 not started |
| 21 Health and Fitness | `██████████` | 8 | 8 | — |
| 22 Internationalization and Localization | `█████░░░░░` | 4 | 8 | 3 in progress, 1 not started |
| 23 Smart Notifications | `██████████` | 12 | 12 | — |

## What is left

| Story | Module | Priority | Status |
|---|---|---|---|
| `04-017` Voice evaluation, metrics and release gates | 04 Conversation, Voice & Text | P0 | In Progress |
| `18-008` Developer platform | 18 API & Developer Platform | P2 | Not Started |
| `20-011` Payment operations | 20 Subscriptions, Entitlements & Usage | P2 | Not Started |
| `22-004` Translation catalog & core UI | 22 Internationalization and Localization | P0 | In Progress |
| `22-006` Localized notifications | 22 Internationalization and Localization | P0 | Not Started |
| `22-007` Multi-currency household records | 22 Internationalization and Localization | P1 | In Progress |
| `22-008` Right-to-left readiness | 22 Internationalization and Localization | P1 | In Progress |

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

9 of 9 done `██████████`

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
| `01-009` Settings & Profile consolidation | P1 | Done | One editor per setting: `/settings` holds the profile and opens each setting's own page, grouped Personal / AI & privacy / Connected services / Plan & usage / Account. The AI key and data-use policy moved to `/settings/ai`, and the plan and usage to `/settings/plan` (the payment return lands there). Your own profile on Family/Househelper links to Settings; an Admin still edits other people there. The unbuilt 2FA row, the Export/Delete rows (Privacy has them) and Help (avatar menu and More) are gone from Settings |

### 02 — Household Configuration & Playbook

9 of 9 done `██████████`

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
| `02-009` Intelligent household onboarding | P0 | Done | Twelve resumable screens at `/onboarding` (welcome → counts → overview → adults → children → pets & help → suggested responsibilities → per-category review → readiness summary → one-question-at-a-time guided setup → "Your home is ready"). A deterministic template engine (`household/onboarding.ts`) suggests owners from ages, work arrangements and helper roles, never from gender or relationship; suggestions are computed, never stored, and only accepting one writes a responsibility through `saveResponsibility`; readiness is weighted arithmetic over what is really set up. `household_onboarding`/`onboarding_events` (migration `20260928090000`, applied live), stated ages and work arrangements on members, an invitation that claims an adult named during setup, a Home resume card, and every new fact in HomeBrain's context |

### 03 — Outcome & Routine Engine

8 of 8 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `03-001` Outcome model | P0 | Done | Desired state, owner, window, verification — not a checklist item |
| `03-002` Routine model | P0 | Done | Routine separate from the outcomes it instantiates |
| `03-003` Monitoring | P0 | Done | Pure evaluation; normal operation is silent |
| `03-004` Exception detection | P0 | Done | Impact and recommended action are NOT NULL by design |
| `03-005` Replanning | P0 | Done | Downstream reachability computed, unaffected plans preserved |
| `03-006` Dependency graph | P1 | Done | `attachDependencies` turns the household's real dependency edges (the same ones `configuration.ts`'s `canDependOn` validates) into each outcome's own `dependencies`, carrying the upstream outcome's current status, feeding straight into the evaluation and replanning already built for 03-003/03-005 |
| `03-007` Pattern learning | P1 | Done | `pattern-learning.ts`: `findTimingPattern` looks at an outcome key's actually-met history and calls a normal timing only when completions cluster tightly enough (consistency ≥0.6, at least 4 samples) — scattered history says nothing. `proposeTimingPattern` turns a found pattern into the same `LearningProposal` shape module 14 uses everywhere (observed, capped confidence, status "learned"), and refuses outright — returns `null`, proposing nothing — once the household has confirmed a fact about that outcome's timing, the goal's own words made a caller-supplied fact so it is testable rather than assumed |
| `03-008` Optimization | P2 | Done | `workload.ts`: each member's load in times a week from each outcome's own rhythm (daily 7, weekly 1, monthly ≈0.25; no rhythm set counts as weekly and is reported as assumed); an imbalance is named only when the heaviest carries ≥2× the lightest and ≥5 more a week; `suggestRebalance` only ever proposes the outcome's named backup taking it, within adults or within helpers, never a child, and only a swap that narrows the gap. `acceptRebalance` applies it through the validated, audited responsibility save, idempotent, refusing a suggestion the household has moved on from. Responsibilities shows "Share the load" only when there is something to share; `GET /households/{id}/workload`, `POST .../workload/rebalance` |

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

8 of 8 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `07-001` Normal helper model | P0 | Done | Outcomes and windows, never per-chore status |
| `07-002` Availability/leave | P0 | Done | Outcomes and windows, never per-chore status |
| `07-003` Backup planning | P0 | Done | Outcomes and windows, never per-chore status |
| `07-004` Exception handling | P0 | Done | Outcomes and windows, never per-chore status |
| `07-005` Helper privacy | P0 | Done | Outcomes and windows, never per-chore status |
| `07-006` Optional daily summary | P1 | Done | `buildDailySummary`: one digest of what was unusual, built only from exceptions `handleHelperException` already routed to `tell_household` and an absence left uncovered — a handled exception or a fully-covered absence stays silent, matching the module's own rule that normal work needs no update. Opt-in by construction: nothing depends on anyone reading it, and a quiet day says so in one line rather than nothing |
| `07-007` Pattern learning | P1 | Done | Normal timing is already covered by reusing 03-007's `findTimingPattern` directly — it operates on any `Outcome[]`, helper-owned outcomes included. New: `findMissPattern`/`proposeMissPattern` call a recurring miss only when the same exception kind keeps recurring for one outcome (≥3 occurrences, ≥0.6 concentration), and never propose anything once the household has confirmed a fact about it — the same confirmed-rule gate 03-007 uses |
| `07-008` Service marketplace | P2 | Done | `backup_services` (Admin-only, retired never deleted) names the outside services a household can call and the outcomes each covers; `planBackupCoverage` turns the next fortnight's helper absences into only the outcomes left uncovered — a member's backup is handled and silent — each `arranged`, `service_available` or `nobody`; one tap arranges cover as an ordinary 13-006 service request (provider, contact, household's next move), one open cover per outcome and day by unique index. Nothing is booked on anyone's behalf: no marketplace/booking provider is connected. Househelper Overview leads with "While they're away"; Tasks keeps the services (add/edit/retire/restore); `/households/{id}/backup-services` and `/backup-services/cover` |

### 08 — Kids & School Intelligence

9 of 9 done `██████████`

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
| `08-009` Add a child from a school notice | P2 | Done | Found in the test-spec live run (23 Sep 2026): a household with no child on record cannot confirm a school notice — offer to add the child inline. Done: the resolver names an untitled unknown child (`unknown`), never assumes the household's only child; the review offers "Add <name> as a child" to Admins (guardian = the Admin, as on Family) and confirms the notice for them in the same step; golden case HS-15 |

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

19 of 19 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `14-001` Household orchestrator | P0 | Done | Authorization outside the model; approval binds to the exact action. 2026-09-20: the Household Brain (`conversation/brain.ts`, v4 §5) gathers every domain into one consented context, and a question is answered from all of it |
| `14-002` Governed tools | P0 | Done | Authorization outside the model; approval binds to the exact action |
| `14-003` Plan/execute/monitor loop | P0 | Done | Authorization outside the model; approval binds to the exact action. 2026-09-20: "understand" now reads the whole home (v4 §6 context assembly, cross-domain reasoning, result interpretation), not one domain's summary |
| `14-004` Agent runs | P0 | Done | Authorization outside the model; approval binds to the exact action |
| `14-005` Approval integration | P0 | Done | Authorization outside the model; approval binds to the exact action |
| `14-006` Learning boundaries | P0 | Done | Authorization outside the model; approval binds to the exact action |
| `14-007` Multi-agent coordination | P1 | Done | `specialists.ts`: named specialists (meals, pets, home, bills, groceries) each propose `PlannedStep`s from `HomeAssessment`s for the existing governed tool registry; a contract (`grocery_list`) is how a meal or pet need it cannot itself fulfil is handed to groceries, which consolidates every producer's list into one deduplicated set of steps. `coordinate()` runs them in order and returns one plan; `AgentRun` gained a `contracts` field and `agent_runs.contracts` column to record what was handed off, alongside the plan `authorizeToolCall` still gates step by step |
| `14-008` Predictive intelligence | P2 | Done | `ai/predictions.ts`: the next 14 days read from real rows only, never a model and never written — three or more things likely to run out within a week of each other (one shop, an opportunity; from the buying pattern or what the household stated), two or more unpaid bills due within 5 days (a risk; amounts summed only when known and in one currency), a child's exam in a week with 3+ other things due (a risk). Thresholds deliberately high so an ordinary week says nothing. Today's Household view shows "Looking ahead" from exactly what the viewer may already read (never a child's view); `GET /households/{id}/predictions`. Money now shows two decimals whenever it has any (₹3,449.50) |
| `14-009` Household context & grounding engine (Wave 1) | P0 | Done | `packages/core/src/context/`: a derived, rebuildable layer over the domain repositories, read only through the member's own RLS client (never the service role, never `.rpc`). One canonical `HouseholdContextItem` per fact with provenance, freshness (current/stale/historical/superseded/unknown), tier 1–4 and privacy class; health's private/selected_family/household_operational scopes preserved with no admin shortcut. Retrieval API (`resolvePerson`, `resolveEntity`, `resolveReference`, `findRelevantFacts`, `findPotentialMatches`, `findPotentialConflicts`, `getCurrentState`, `getRecentChanges`, `getSupportingEvidence`); resolution never silently picks a low-confidence consequential target — it resolves, clarifies or asks. HomeBrain's context and question relevance, HomeTalk's person/grocery/health-issue resolution and HomeSend's duplicate reconciliation all go through it; every successful write invalidates it. 14 golden scenarios + 18 engine tests; live count-only check: an impersonated member sees 0 rows from 12 other households across all 29 tables the engine reads |
| `14-010` HomeBrain 2.0 — grounded household reasoning (Wave 2) | P0 | Done | Spec: `design/HOMEBRAIN-2.0-WAVE-2.md`. Part 1 (grounded reasoning core): `packages/core/src/homebrain/` — question reading (intent/entity/time/domain hints, cross-domain connection, follow-ups, ambiguity → one focused question), the `GroundedFact` contract (opaque `F`-ids, sources, confidence, privacy class), the §14 prompt contract with cited `usedFacts`, post-generation validation (unsupported names/dates/amounts/events/health/integration/"done" claims) with one tighter regeneration then a deterministic answer then an honest "not on record", deterministic "why?" answers from recorded evidence, and the five modes (done only after an executor confirms). Part 2 (current truth): preferences keyed by subject and object (`parsePreference`), so "Actually Asmi is okay with mushrooms now" supersedes "Asmi doesn't like mushrooms" with history kept; every learned preference is written to HomeBrain Review (`certification_items.memory_id`, backfilled live by `20260923120000_homebrain_review_links_memories.sql`) with its correction recorded; Review decisions (confirm, correct, remove) update what HomeBrain reads; beliefs added in Review are read by HomeBrain with their provenance; the screen is renamed HomeBrain Review and shows source, when learned, confidence and confirmation. Fixed: adding a belief in Review was always refused by RLS |
| `14-011` HomeSend 2.0 — multimodal intake & reconciliation (Wave 3) | P0 | Done | Spec: `design/HOMESEND-2.0-WAVE-3.md`. Part 1 (one pipeline, every input): `packages/core/src/homesend/ingest.ts` — every entry point (upload, paste, composer paperclip, share target, share handoff, email webhook) goes secure intake → normalize → understand → the canonical `IntakeUnderstanding` (`understanding.ts`: summary, entities, facts, candidate actions from a fixed list, references, change signal, safety, provenance). New inputs: PDF (read by the model as a document, so scanned PDFs too), TXT/CSV, links (`link-fetch.ts`: SSRF-safe — public addresses only, DNS checked and pinned, redirects re-checked, size/time limits, no cookies), voice notes (`audio.ts`: transcript confidence gate, uncertain or consequential transcripts shown and confirmed, never acted on). Types decided from bytes (`normalize.ts`), prompt-injection defense (`injection.ts`: fenced untrusted content, flagged instructions ignored and said so), content-hash idempotency, "Failed safely" inbox state with reasons, HTML-only emails read instead of dropped. Migration `20260924090000_homesend_multimodal_intake.sql` (applied live). Part 2: entity resolution through the Wave 1 resolver (`resolve.ts`, one question when ambiguous — "Who is this for — Asmi or Manan?"), reconciliation (`reconcile.ts`: duplicate / update / cancellation / conflict against the record on file, the spec's own "Update the existing event?"), updates and cancellations through the domain services with exact undo (`homesend_changes.change_type` + `previous`, migration `20260924100000_homesend_reconciliation_changes.sql`, applied live), several needs per notice each separately confirmed and undone, review UI (What I found / Update existing / Keep existing / Add as new), email 2.0 (every recipient, HTML bodies, attachments as their own items via Resend's attachment API, idempotent retries). Part 3: confirmation strategy (`confirmation.ts`, §12 — a new grocery or school item applies on its own only when read clearly, sent in by a member, matching nothing on record, with no question open, and only where the household set that outcome to "execute"; bills and health documents always wait for a person; medium confidence prepares, low confidence asks one question), review outcomes kept on each item in closed words (migration `20260924110000_homesend_review_outcomes.sql`, applied live), HomeSend metrics (`metrics.ts`, §19, each a count out of a count, `GET /api/v1/platform-admin/homesend-metrics`), and the §20 acceptance matrix, one test per row (`acceptance-matrix.test.ts`). Live email still waits on a Resend account and receiving domain (§18) and is not labelled connected |
| `14-012` HomeTalk 2.0 — contextual conversational operations (Wave 4) | P0 | Done | Spec: `design/HOMETALK-2.0-WAVE-4.md`. Part 1 (grounding): `conversation/temporal.ts` — one deterministic resolver for today/tomorrow/tonight/this and next Friday/this weekend/next week/after school/before dinner/explicit dates, in the household's timezone (the model names the phrase, code decides the day); `conversation/grounding.ts` — every action intent is grounded before a proposal exists: person mentions through the Wave 1 resolver (one focused question when two fit, "I do not know anyone called…" when none do), dates to local days, "that/it/them/him/the other one" through `conversation/references.ts` in the spec's priority order (pending question → pending proposal → recent conversation and recent HomeSend by recency → context), with "Do you mean the white T-shirt from the school notice or the printer paper?" when two things are in play; each turn persists its focus (what it acted on, proposed or mentioned) on its reply for the next turn's "that". Part 2 (operations): corrections (`conversation/corrections.ts`) amend a waiting proposal or undo-then-redo an executed write through its own domain service; multi-part sentences split (`conversation/decompose.ts`) into independently gated parts with the premise rule; several items per add; real reminders (`set_reminder`, a notification held until due); meals (`plan_meal` via `createMeal`/`attachIngredients`) and "make sure we have everything" from the recipe's ingredients; "Nothing to change" instead of "Done" when nothing was written Part 3 (contract): the model sees a runtime context (role, local date/time, what is waiting, what the conversation is about — minimised like the utterance) and returns named, nullable parameters with no id field, and anything server-only is stripped from its output; "I think you mean …" at medium confidence and "I found two possibilities …" at low; every §21 example handled through its own domain service (school done/move, remove from list, service request, protected family time); §22 matrix in `conversation/evaluation.test.ts` |
| `14-013` Unified AI evaluation, reliability & production hardening (Wave 5) | P0 | Done | Spec: `design/AI-EVALUATION-WAVE-5.md`. One evaluation framework for HomeTalk, HomeSend and HomeBrain; synthetic golden households; §8 metrics and the §10 error taxonomy; corrections as structured evaluation evidence; provider/model/prompt/context versions recorded per run; release artifact and gates; rate and payload limits; failure semantics; idempotency; email-forwarding monitoring |
| `14-014` HomeSend reads the time of day | P1 | Done | Local start and end read deterministically from the notice's own date words (`timeFromDateText`); `school_items.due_time_known` + `ends_at` (migration `20260927090000`, applied live); all-day items never show a time |
| `14-015` WhatsApp into HomeSend — linking and intake | P0 | Done | Spec: the WhatsApp HomeSend integration brief. WhatsApp becomes an input channel, never an authorization channel (`packages/core/src/whatsapp/`, migration `20261002090000_whatsapp_intake.sql`, applied live). A number is linked to one adult member only through a single-use code: fifteen minutes, SHA-256 hash only, completed atomically by the service-role-only `public.complete_whatsapp_link` from a signature-verified "CONNECT <code>". One number, one member, anywhere. `public.disconnect_whatsapp` keeps history. A linked number's messages are recorded once by WhatsApp's message id and queued (`whatsapp.process` on the job queue, run after the response with `after()`, retried with backoff and dead after five tries). They become `whatsapp` / `whatsapp_media` HomeSend items from that member (`ingestWhatsAppText` / `ingestWhatsAppMedia`: media fetched from Meta's CDN only, type from bytes, private bucket), and a short acknowledgement never echoes an amount, a health detail or a number. An unlinked number is told how to connect, and nothing it sent is kept. Closed-word telemetry lives in `whatsapp_events`. Inert until a deployment sets the WhatsApp credentials |
| `14-016` WhatsApp into HomeSend — in the app | P0 | Done | The mockup flow: connect WhatsApp (intro, save the number and send CONNECT, confirmation), another adult connecting, WhatsApp status beside members in Manage Household, WhatsApp as a HomeSend channel with an All / WhatsApp / Email / Uploads filter and provenance on each item, and connection management in Settings |
| `14-017` Deep document understanding — whole-document reader & change plan | P0 | Done | Spec: `design/HOMESEND-DEEP-DOCUMENT-UNDERSTANDING-2.0.md` (mockup `design/HomeSend-Deep-Document-Understanding-Mockup.png`), phases A–C. The classifier reads the whole document into every household-relevant record across its pages (`records[]`: each event, each date of a series, each fee, each thing to buy), each with page, section and quote as evidence, plus pages read/unreadable and the day the document is dated (`issuedOn`). Deterministic backstop per record (no ids, no field a domain does not own); each record's day and time grounded by WonderHome, never the model. `homesend/document.ts` keeps the reading on the understanding (older readings derive records from the headline and needs); `homesend/plan.ts` reconciles every record on its own — create / update (field by field, before → after) / cancel / no change / conflict (a newer record wins, §28) / needs your answer (one question, §29) — with a series of dates read as occurrences, one record on file answering for one thing, a same-amount-same-day bill recognised, and school/class enrichment from the household's records marked as such (§30). Matcher fixes: a part of an occasion (rehearsal, fee, registration) is never the occasion; equal matches ordered by name. Golden scenarios 1–3 (§46–48) are permanent tests |
| `14-018` Deep document understanding — review, apply and receipt | P0 | Done | Phases D–E. A document with two or more records is reviewed as its plan in HomeSend and in the HomeTalk paperclip sheet (`_components/home-send-plan.tsx`): Found N items, grouped Updates / New / Already on record / Conflicts / Needs your answer, each row opening to its fields, before → after, household-record enrichment and source page, with per-record include, edit and "who is it for"; "Review and apply (N)". `applyDocumentPlanAction` rebuilds the plan on the server from the stored reading (the browser sends only choices), writes each included record through its domain service (writes moved to the server-only `home-send-writes.ts`), verifies updates by reading them back, records each change with its plan key, field-level before/after and evidence (migration `20261005090000_homesend_document_plan_receipt.sql`, applied live), and keeps the exact plan and receipt on the item. `homesend/apply.ts` makes the receipt: created / updated / cancelled / unchanged / skipped / needs_clarification / failed, partial never reported as done, "Nothing new found. No records changed." as a success; a second apply returns the stored receipt. "Undo all" reverses every change of a document; history names each change. A document with a plan never applies on its own |
| `14-019` Deep document understanding — HomeTalk attachments & certification | P0 | Done | Phases F–G. The paperclip in HomeTalk opens the same HomeSend sheet, pipeline, plan and apply — no second parser — and once a plan is applied HomeTalk posts what it did into the conversation from the stored receipt (`documentReceipt` turn, `homesend/talk.ts` `documentReplyText`: "I read the 2-page school notice and found 7 things… Done. Updated: • Annual Day — 12 Oct → 15 Oct …"). "What did the school notice change?" is answered by rules from the receipt and the change rows (`readDocumentChangeQuestion` / `answerDocumentChanges`), never from the model's reading: undone changes are said to be undone, and a question no applied document fits goes on to HomeBrain; not over a voice link, whose content limits the HomeBrain path applies. Golden scenario 4 (same reading → same plan whichever door) in `talk.test.ts`; eval HS-16 (a part of an occasion is not the occasion, 50/50); §50 counts in HomeSend metrics (`documents`: applied, outcomes, changes standing, correct household changes per document). A receipt with a question still open says so ("1 change applied, 1 waiting on your answer") |

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

8 of 8 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `17-001` Connector framework | P0 | Done | connector contract, health, dedupe, fixtures; no live provider yet |
| `17-002` Calendar | P0 | Done | canonical payload → family_events by provider identity; never protected/confirmed; private = time only; partial sync never cancels; POST integrations/calendar/sync (409 until a provider is live) |
| `17-003` Email | P0 | Done | recognised bills → obligations by provider identity + content hash; status never touched by a sync; POST integrations/email/sync (409 until a provider is live) |
| `17-004` School | P0 | Done | translate() extended with contentHash + provider-cancellation signal; reconciled onto school_items by identity; cancel never overrides done/submitted; POST integrations/school/sync (409 until a provider is live) |
| `17-005` Commerce | P0 | Done | Merchant reports reconciled by identity + hash; lifecycle refuses a rewind, a reprice never overwrites the approved figure; POST integrations/commerce/sync (409 until a merchant is live) |
| `17-006` WhatsApp | P1 | Done | WhatsApp Cloud API adapter behind the 06-008 channel shape (approved template, E.164 only, closed-word errors); new due notifications now go out on the member's live channels (`notifications/deliver.ts`) with `sent`/`delivery_failed` events; signed webhook records delivered/seen/failed by provider message id and honours STOP; inert until a deployment sets `WHATSAPP_*` |
| `17-007` Weather | P1 | Done | Open-Meteo behind the 13-005 weather port; an Admin picks an area (coordinates rounded to ~1 km, `weather_locations`), the forecast is cached hourly on the household's row, entitlement `home.weather` decided on the server; laundry/drying plans around it; outages recorded on the connection only, last forecast serves ≤6 h; off unless the deployment sets `WONDERHOME_WEATHER_PROVIDER=open-meteo` |
| `17-008` Smart home | P2 | Done | One canonical device payload behind the 17-001 contract; a device is linked to an appliance by an Admin (or ignored), never inferred; only fresh readings from linked devices become `home_device_signals`, once each, with provider confidence capped below certainty; outages change connection health only; `home_device_links` (sync-created, Admin decides asset/ignored), Devices section on Integrations; POST integrations/smart-home/sync (409 until a provider is live) |

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

10 of 11 done `█████████░`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `20-001` Plan model | P0 | Done | free/pro/max seeded as data; changing a plan is a migration |
| `20-002` Entitlements | P0 | Done | one server-side entitlement service; hiding a feature is never the control |
| `20-003` Usage metering | P0 | Done | atomic counters proven against 20 concurrent sessions |
| `20-004` Upgrade/downgrade | P0 | Done | A change writes one row and never a household record; consequences shown and re-derived before applying; audited |
| `20-005` Usage UI | P1 | Done | Settings shows used/limit per metered feature, from the same counter `consume` enforces against |
| `20-006` Billing abstraction | P1 | Done | Provider-neutral `BillingProvider` port + pure `applyBillingEvent` (out-of-order and other-subscription events ignored, cancellation falls back to free, never deletes); Stripe adapter code-complete and inert (intent id as Idempotency-Key, HMAC-verified webhooks); `billing_intents` (one open per household+plan) and `billing_events` (unique per provider event) with RLS; `plans.requires_payment` keeps paid plans out of reach of any household session |
| `20-007` Quota automation | P2 | Done | Burst (N per fixed W-second window) and fair-use (past N in the period, served more simply, never refused) as plan data on `plan_features`, enforced in the one entitlement service (`consume`); HomeTalk answers from the rules past fair use, with a disclosure, and refuses a burst as temporary; staff set policies through `PATCH /platform-admin/plans/{planKey}/policies` (`subscription.manage`, reason code), every change kept in `plan_policy_events` |
| `20-008` Plan experiments | P2 | Done | `entitlement_experiments`: one feature changed (on, off, or a different allowance) for a stable hashed share of the households on named plans, applied inside `loadSubscription` so `may`/`consume` and every screen agree and a direct API call cannot bypass it; terms frozen once running and draft → running → stopped only (database trigger); a household reads only a running experiment's terms (column grants), never staff's description; staff create/start/stop through `/platform-admin/experiments` (`subscription.manage`, reason code, `entitlement_experiment_events`) and read per-group household counts and usage — counts only; Settings tells a household plainly when a feature is part of a trial |
| `20-009` Multi-provider payments backend | P1 | Done | Razorpay (India) and Stripe (international) behind the one `BillingProvider` port, chosen per checkout by `selectPaymentProvider` (INR or an Indian household → the India provider, anything else → the international one, a preference honoured only where eligible, both defaults deployment config); our own price catalogue in major units (`plan_prices`, readable when active) mapped server-side to provider plans (`payment_provider_plans`, service role only); a ledger of what providers report (`payments` forward-only, `billing_invoices`, `payment_refunds` pending until the provider confirms, `payment_customers`), Admin-read and server-written; the subscription learns provider, interval, currency, amount, cancel-at-period-end and a scheduled downgrade; per-provider webhooks at `/api/v1/billing/webhook/{provider}`, HMAC-verified and applied once; a refund's household comes from our ledger, never the payload. Inert until a person prices the plans and sets a provider's keys |
| `20-010` Plan, checkout and billing screens | P1 | Done | Prices decided and seeded (Pro ₹299/month, Max ₹599/month, a year at 20% off: ₹2,870 and ₹5,750); `/settings/plan` shows the current plan with its real terms (renewal date, ends-with-period, payment due), a Monthly/Yearly toggle, every plan's catalogue price with the yearly arithmetic, and "Free during early access" while no plan requires payment — switching stays free until a person marks the plans paid once a provider is live; a checkout summary (`/settings/plan/checkout`: plan, price, includes, region and currency, the provider the router chose and how it takes payment) that says honestly when payments aren't open; a confirmation page that waits for the provider's webhook instead of assuming; billing history with the last payment method (closed word, last four at most) and invoice detail linking to the provider's own copy; cancel at the end of the period, provider first; the landing page shows the same catalogue prices |
| `20-011` Payment operations | P2 | Not Started | Payment notifications, platform-admin payment monitoring, staff refunds and provider reconciliation |

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

### 22 — Internationalization and Localization

4 of 8 done `█████░░░░░`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `22-001` Locale foundation & formatting | P0 | Done | `i18n/locales.ts` (languages, regions, currencies, IANA time zones), `i18n/preferences.ts` (precedence: person → household → region → app default), `i18n/format.ts` (Intl only, Latin digits, a calendar day never shifted by the zone, imperial for presentation only), `i18n/request.ts` sets the locale once per request so the existing date/time/money helpers follow it; 16 formatter tests |
| `22-002` Preferences & Language & Region settings | P0 | Done | Migration `localization_preferences` (applied live): household `region`/`currency`/`measurement_system`/`default_language` (Admin only, existing `households_update_admin`), person `language`/`date_format`/`time_format`/`measurement_system` (self or Admin); `/settings/language-region` with language, region, currency, date & time and member-languages pages; audit `member.locale_updated`/`household.locale_updated`; 9 RLS tests |
| `22-003` Optional localization setup | P0 | Done | `/onboarding/personalize` runs after family setup, never in place of it: six steps for an Admin, four for anyone else (they never set the household's region or currency); every step saved, "I'll do this later" resumable, a dismissible Home card for anyone who skipped; localization events recorded by the member themselves |
| `22-004` Translation catalog & core UI | P0 | In Progress | Own catalog (`i18n/messages/*`, en/hi/mr/es/fr/de/ar, about 115 keys) with plurals, interpolation and English fallback, never a raw key, completeness enforced by the compiler and tests. Localized so far: navigation, Home header and counts, setup, Language & Region settings, the personalize card. Every other screen is still English, and the language page says so |
| `22-005` Multilingual HomeTalk | P0 | Done | A person can type or speak in their own language and get the reply in it, and no gate decides anything differently. The model is told the person's language (`languageLine` in `systemFor`) and returns the same language-neutral intent, with days, times, numbers and fixed choices in English words and the household's own words kept as said. A bare yes or no is read in all seven languages, as a whole reply only. Each reply is composed and validated in English, then translated by `conversation/reply-language.ts`: names, bold values, dates, times, amounts, numbers, link targets and brand names become tokens, and the result must carry every token once, with no new digit and no new markup. Otherwise the checked English is shown with a line saying why. A reply is translated only when the household has agreed that every content class it carries (`REPLY_CLASSES`, the answer's facts) may reach its model provider. The English stays the message's content, and the shown text is kept in `metadata.localized` |
| `22-006` Localized notifications | P0 | Not Started | PR 2: structured event + params rendered per recipient in their own language |
| `22-007` Multi-currency household records | P1 | In Progress | The household currency is the default for new bills and transactions only (`CurrencyField` picker with "Another currency…"); every record keeps its own currency, nothing is converted; the two money formatters use Intl. Still to audit: any screen that adds amounts across currencies |
| `22-008` Right-to-left readiness | P1 | In Progress | `DocumentLocale` sets `lang`/`dir` from the viewer's language; the shell, Home hero, header, wordmark and script accents are direction-aware (logical properties, `rtl:` mirroring, `dir="auto"`), verified in Arabic at 360px and desktop. The remaining screens still need a pass |

### 23 — Smart Notifications

12 of 12 done `██████████`

| Story | Priority | Status | Notes |
|---|---|---|---|
| `23-001` Reminders from real records | P0 | Done | `notifications/sources.ts` derives reminders from unpaid bills, pending school items, planned meals, the grocery list, pet care and family plans. `notifications/reconcile.ts` brings the table in line (create / update / resolve / expire), is throttled per household, and runs after any signed-in page, before the feed reads and from the daily cron. Rows carry `category`, `source_type`/`source_id` and a window. Live-verified end to end on the real project |
| `23-002` Reminder policies and timing windows | P0 | Done | `notifications/policies.ts`: per-category presets as data (bills 3 days + due day, school evening before + morning of, meals when cooking starts from the recipe's time, groceries late afternoon, pets on the day, family an hour before). `planStages` works in the household's zone; stages are bounded (≤10, DB-checked). `reminder_preferences` holds a person's chosen preset |
| `23-003` Idempotency, auto-cancellation and lifecycle trail | P0 | Done | The thread key plus the open-per-thread index is the dedupe key, and an unchanged reminder is never rewritten. A finished source resolves its reminder; a moved date reschedules it; a dismissed stage never returns, though a later one can. `wh.log_notification_transition` records every change of state in closed words |
| `23-004` Quiet hours on the household's clock | P0 | Done | Fixes the UTC bug in `decide.ts`/`channels.ts`: quiet hours are read in the household's time zone, to the minute. A reminder is deferred, brought forward, or — only when urgent — breaks the quiet. The household's HomeTalk quiet-hours rule is the default for people with no setting of their own |
| `23-005` Notification center: feed, categories, detail, actions | P0 | Done | `/notifications` reconciles first, then shows the person's own reminders most pressing first (priority → deadline → newest) under All / Action needed / Upcoming / Updates, with category chips. Each row (`ReminderRow`, an `ExpandableRow`) opens to the live record behind it — a bill's amount, due date, payee and repeat; a school item; a meal and its recipe time; a pet; a family plan — read now through the person's own session, never copied. Mark as paid goes through `finance/repository.ts`'s `markObligationPaid` (a recurring bill rolls to its next due date with history; Admins only), Mark done through `completeSchoolItem`/`markPetCareDone`; the reminder clears by reconciliation, never by editing it. The nav badge counts what is new; opening the feed marks it seen. Browser-verified at 360px and desktop |
| `23-006` Snooze and custom reminders | P0 | Done | "Remind me later" on every open row: 15 minutes, an hour, later today, tomorrow morning, or a picked day (the next week) and time on the household's clock (`atLocal`), bounded by the database to 31 days. The confirmation names when it comes back |
| `23-007` Notification settings | P1 | Done | `/settings/notifications`: quiet hours to the quarter hour on the household's clock, and per-kind timing (the policy's own presets, picked never typed) with an on/off each; saving reconciles so waiting reminders move at once. The per-channel cards stay below |
| `23-008` Smart batching | P1 | Done | The grocery list is one reminder a day ("Milk, bread and eggs are running low"). A child's school things due the same day, going to the same person, are one reminder ("Aarav — 3 things for tomorrow", source `school_day`, the child), naming each item and marking all of them done through `completeSchoolItem`. It is as urgent as its most urgent item, so nothing critical hides in it. Batching is set per kind in the policy (`batching`) |
| `23-009` Today at a glance and member-specific view | P1 | Done | Upcoming is today and tomorrow, grouped Today / Tomorrow / Later on the household's clock. Every view is only the person's own, and one responsible person gets each reminder. Settings' "What comes to you" lists the responsibilities that route reminders to this person, first or as backup, with a link to change them. Decision: no "Household" view of other people's reminders — a person's reminders are theirs, and the Admin already manages who owns what |
| `23-010` Escalation | P1 | Done | A reminder moves through its policy's stages (bounded; `maxRemindersFor` = stages + one backup). When the policy escalates (bills after 3 h, school after 1 h, pets after 2 h) and the responsible person's last reminder has gone unanswered that long, the responsibility's backup hears once, naming who has not answered, under their own quiet hours and settings. Never again once they dismiss it; recorded as `escalated` on the unanswered reminder |
| `23-011` HomeBrain smart digest | P1 | Done | "HomeBrain summary · Today" above the list: today's reminders, in the order they come, built from the same rows — a summary, never a second source. On unless the person turns it off (`notification_preferences.daily_digest`) |
| `23-012` Timing learned from behaviour | P1 | Done | Off unless the person turns it on (`learn_timing`). Evidence is only them acting on a reminder itself (`acted` events, 60 days); five or more, with the middle half within two hours, moves the first reminder of that kind to their median time, on the quarter hour. Never over a timing they chose, never a "before" reminder, never past the next stage; quiet hours still apply, and the row says so only when a learned time actually moved it |

_Generated 2026-09-24 from 24 backlog files._
