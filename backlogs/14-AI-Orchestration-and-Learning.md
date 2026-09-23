# WonderHome — AI Orchestration & Learning

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 14-001 | Household orchestrator | Done | Authorization outside the model; approval binds to the exact action. 2026-09-20: the Household Brain (`conversation/brain.ts`, v4 §5) gathers every domain into one consented context, and a question is answered from all of it |
| 2 | P0 | 14-002 | Governed tools | Done | Authorization outside the model; approval binds to the exact action |
| 3 | P0 | 14-003 | Plan/execute/monitor loop | Done | Authorization outside the model; approval binds to the exact action. 2026-09-20: "understand" now reads the whole home (v4 §6 context assembly, cross-domain reasoning, result interpretation), not one domain's summary |
| 4 | P0 | 14-004 | Agent runs | Done | Authorization outside the model; approval binds to the exact action |
| 5 | P0 | 14-005 | Approval integration | Done | Authorization outside the model; approval binds to the exact action |
| 6 | P0 | 14-006 | Learning boundaries | Done | Authorization outside the model; approval binds to the exact action |
| 7 | P1 | 14-007 | Multi-agent coordination | Done | `specialists.ts`: named specialists (meals, pets, home, bills, groceries) each propose `PlannedStep`s from `HomeAssessment`s for the existing governed tool registry; a contract (`grocery_list`) is how a meal or pet need it cannot itself fulfil is handed to groceries, which consolidates every producer's list into one deduplicated set of steps. `coordinate()` runs them in order and returns one plan; `AgentRun` gained a `contracts` field and `agent_runs.contracts` column to record what was handed off, alongside the plan `authorizeToolCall` still gates step by step |
| 8 | P2 | 14-008 | Predictive intelligence | Not Started | |
| 9 | P0 | 14-009 | Household context & grounding engine (Wave 1) | Done | `packages/core/src/context/`: a derived, rebuildable layer over the domain repositories, read only through the member's own RLS client (never the service role, never `.rpc`). One canonical `HouseholdContextItem` per fact with provenance, freshness (current/stale/historical/superseded/unknown), tier 1–4 and privacy class; health's private/selected_family/household_operational scopes preserved with no admin shortcut. Retrieval API (`resolvePerson`, `resolveEntity`, `resolveReference`, `findRelevantFacts`, `findPotentialMatches`, `findPotentialConflicts`, `getCurrentState`, `getRecentChanges`, `getSupportingEvidence`); resolution never silently picks a low-confidence consequential target — it resolves, clarifies or asks. HomeBrain's context and question relevance, HomeTalk's person/grocery/health-issue resolution and HomeSend's duplicate reconciliation all go through it; every successful write invalidates it. 14 golden scenarios + 18 engine tests; live count-only check: an impersonated member sees 0 rows from 12 other households across all 29 tables the engine reads |
| 10 | P0 | 14-010 | HomeBrain 2.0 — grounded household reasoning (Wave 2) | Done | Spec: `design/HOMEBRAIN-2.0-WAVE-2.md`. Part 1 (grounded reasoning core): `packages/core/src/homebrain/` — question reading (intent/entity/time/domain hints, cross-domain connection, follow-ups, ambiguity → one focused question), the `GroundedFact` contract (opaque `F`-ids, sources, confidence, privacy class), the §14 prompt contract with cited `usedFacts`, post-generation validation (unsupported names/dates/amounts/events/health/integration/"done" claims) with one tighter regeneration then a deterministic answer then an honest "not on record", deterministic "why?" answers from recorded evidence, and the five modes (done only after an executor confirms). Part 2 (current truth): preferences keyed by subject and object (`parsePreference`), so "Actually Asmi is okay with mushrooms now" supersedes "Asmi doesn't like mushrooms" with history kept; every learned preference is written to HomeBrain Review (`certification_items.memory_id`, backfilled live by `20260923120000_homebrain_review_links_memories.sql`) with its correction recorded; Review decisions (confirm, correct, remove) update what HomeBrain reads; beliefs added in Review are read by HomeBrain with their provenance; the screen is renamed HomeBrain Review and shows source, when learned, confidence and confirmation. Fixed: adding a belief in Review was always refused by RLS |
| 11 | P0 | 14-011 | HomeSend 2.0 — multimodal intake & reconciliation (Wave 3) | In Progress | Spec: `design/HOMESEND-2.0-WAVE-3.md`. Part 1 (one pipeline, every input): `packages/core/src/homesend/ingest.ts` — every entry point (upload, paste, composer paperclip, share target, share handoff, email webhook) goes secure intake → normalize → understand → the canonical `IntakeUnderstanding` (`understanding.ts`: summary, entities, facts, candidate actions from a fixed list, references, change signal, safety, provenance). New inputs: PDF (read by the model as a document, so scanned PDFs too), TXT/CSV, links (`link-fetch.ts`: SSRF-safe — public addresses only, DNS checked and pinned, redirects re-checked, size/time limits, no cookies), voice notes (`audio.ts`: transcript confidence gate, uncertain or consequential transcripts shown and confirmed, never acted on). Types decided from bytes (`normalize.ts`), prompt-injection defense (`injection.ts`: fenced untrusted content, flagged instructions ignored and said so), content-hash idempotency, "Failed safely" inbox state with reasons, HTML-only emails read instead of dropped. Migration `20260924090000_homesend_multimodal_intake.sql` (applied live). Part 2: entity resolution through the Wave 1 resolver (`resolve.ts`, one question when ambiguous — "Who is this for — Asmi or Manan?"), reconciliation (`reconcile.ts`: duplicate / update / cancellation / conflict against the record on file, the spec's own "Update the existing event?"), updates and cancellations through the domain services with exact undo (`homesend_changes.change_type` + `previous`, migration `20260924100000_homesend_reconciliation_changes.sql`, applied live), several needs per notice each separately confirmed and undone, review UI (What I found / Update existing / Keep existing / Add as new), email 2.0 (every recipient, HTML bodies, attachments as their own items via Resend's attachment API, idempotent retries). Part 3 (confirmation strategy §12, metrics §19, §20 matrix) pending |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement AI Orchestration & Learning as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 14-E01 — Governed AI Orchestration:** stories 14-001 through 14-005.
- **Epic 14-E06 — Learning, Multi-Agent Coordination & Prediction:** stories 14-006 through 14-008.
- **Epic 14-E09 — Household Context & Grounding:** story 14-009.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 14-001 — Household orchestrator
**Epic:** Governed AI Orchestration
**Priority:** P0
**Goal:** Coordinate domain agents around outcomes.

**Acceptance criteria**
- Given the household state described by the story, coordinate domain agents around outcomes .
- The agent execution record identifies the tools used and final outcome without storing unnecessary raw model context.
- The orchestrator decomposes household goals into governed domain actions and records the plan, selected tools and result state.
- Every AI tool invocation re-checks authorization, household scope, entitlement and autonomy policy outside the model.
- Agent failures are recoverable: partial work is recorded, completed side effects are not repeated, and the household is told only when intervention is needed.
- Confirmed household facts are never silently overwritten by model inference; learned patterns remain distinguishable and reviewable.
- AI evaluation fixtures cover realistic multi-domain household scenarios, including ambiguous requests, notification suppression and unsafe action attempts.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-002 — Governed tools
**Epic:** Governed AI Orchestration
**Priority:** P0
**Goal:** Expose authorized domain tools/APIs.

**Acceptance criteria**
- Given the household state described by the story, expose authorized domain tools/APIs .
- Contract tests validate the documented request/response behavior against the running route.
- The orchestrator decomposes household goals into governed domain actions and records the plan, selected tools and result state.
- Every AI tool invocation re-checks authorization, household scope, entitlement and autonomy policy outside the model.
- Agent failures are recoverable: partial work is recorded, completed side effects are not repeated, and the household is told only when intervention is needed.
- Confirmed household facts are never silently overwritten by model inference; learned patterns remain distinguishable and reviewable.
- AI evaluation fixtures cover realistic multi-domain household scenarios, including ambiguous requests, notification suppression and unsafe action attempts.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-003 — Plan/execute/monitor loop
**Epic:** Governed AI Orchestration
**Priority:** P0
**Goal:** Implement observe → understand → plan → act → monitor → learn.

**Acceptance criteria**
- Given the household state described by the story, implement observe → understand → plan → act → monitor → learn .
- A direct API call cannot bypass the entitlement decision even when the UI does not render the feature.
- The orchestrator decomposes household goals into governed domain actions and records the plan, selected tools and result state.
- Every AI tool invocation re-checks authorization, household scope, entitlement and autonomy policy outside the model.
- Agent failures are recoverable: partial work is recorded, completed side effects are not repeated, and the household is told only when intervention is needed.
- Confirmed household facts are never silently overwritten by model inference; learned patterns remain distinguishable and reviewable.
- AI evaluation fixtures cover realistic multi-domain household scenarios, including ambiguous requests, notification suppression and unsafe action attempts.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-004 — Agent runs
**Epic:** Governed AI Orchestration
**Priority:** P0
**Goal:** Record plans, tools and safe results.

**Acceptance criteria**
- Given the household state described by the story, record plans, tools and safe results .
- The agent execution record identifies the tools used and final outcome without storing unnecessary raw model context.
- The orchestrator decomposes household goals into governed domain actions and records the plan, selected tools and result state.
- Every AI tool invocation re-checks authorization, household scope, entitlement and autonomy policy outside the model.
- Agent failures are recoverable: partial work is recorded, completed side effects are not repeated, and the household is told only when intervention is needed.
- Confirmed household facts are never silently overwritten by model inference; learned patterns remain distinguishable and reviewable.
- AI evaluation fixtures cover realistic multi-domain household scenarios, including ambiguous requests, notification suppression and unsafe action attempts.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-005 — Approval integration
**Epic:** Governed AI Orchestration
**Priority:** P0
**Goal:** Pause for human approval when required.

**Acceptance criteria**
- Given the household state described by the story, pause for human approval when required .
- The orchestrator decomposes household goals into governed domain actions and records the plan, selected tools and result state.
- Every AI tool invocation re-checks authorization, household scope, entitlement and autonomy policy outside the model.
- Agent failures are recoverable: partial work is recorded, completed side effects are not repeated, and the household is told only when intervention is needed.
- Confirmed household facts are never silently overwritten by model inference; learned patterns remain distinguishable and reviewable.
- AI evaluation fixtures cover realistic multi-domain household scenarios, including ambiguous requests, notification suppression and unsafe action attempts.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-006 — Learning boundaries
**Epic:** Learning, Multi-Agent Coordination & Prediction
**Priority:** P0
**Goal:** Separate confirmed facts from inferred patterns.

**Acceptance criteria**
- Given the household state described by the story, separate confirmed facts from inferred patterns .
- The UI identifies the exact record or policy that will change before the user confirms.
- The orchestrator decomposes household goals into governed domain actions and records the plan, selected tools and result state.
- Every AI tool invocation re-checks authorization, household scope, entitlement and autonomy policy outside the model.
- Agent failures are recoverable: partial work is recorded, completed side effects are not repeated, and the household is told only when intervention is needed.
- Confirmed household facts are never silently overwritten by model inference; learned patterns remain distinguishable and reviewable.
- AI evaluation fixtures cover realistic multi-domain household scenarios, including ambiguous requests, notification suppression and unsafe action attempts.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-007 — Multi-agent coordination
**Epic:** Learning, Multi-Agent Coordination & Prediction
**Priority:** P1
**Goal:** Allow specialist agents to collaborate through contracts.

**Acceptance criteria**
- Given the household state described by the story, allow specialist agents to collaborate through contracts .
- The agent execution record identifies the tools used and final outcome without storing unnecessary raw model context.
- The orchestrator decomposes household goals into governed domain actions and records the plan, selected tools and result state.
- Every AI tool invocation re-checks authorization, household scope, entitlement and autonomy policy outside the model.
- Agent failures are recoverable: partial work is recorded, completed side effects are not repeated, and the household is told only when intervention is needed.
- Confirmed household facts are never silently overwritten by model inference; learned patterns remain distinguishable and reviewable.
- AI evaluation fixtures cover realistic multi-domain household scenarios, including ambiguous requests, notification suppression and unsafe action attempts.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-008 — Predictive intelligence
**Epic:** Learning, Multi-Agent Coordination & Prediction
**Priority:** P2
**Goal:** Predict household risks/opportunities.

**Acceptance criteria**
- Given the household state described by the story, predict household risks/opportunities .
- The orchestrator decomposes household goals into governed domain actions and records the plan, selected tools and result state.
- Every AI tool invocation re-checks authorization, household scope, entitlement and autonomy policy outside the model.
- Agent failures are recoverable: partial work is recorded, completed side effects are not repeated, and the household is told only when intervention is needed.
- Confirmed household facts are never silently overwritten by model inference; learned patterns remain distinguishable and reviewable.
- AI evaluation fixtures cover realistic multi-domain household scenarios, including ambiguous requests, notification suppression and unsafe action attempts.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-009 — Household context & grounding engine (Wave 1)
**Epic:** Household Context & Grounding
**Priority:** P0
**Goal:** Give HomeTalk, HomeBrain and HomeSend one shared, authorized, provenance-linked understanding of the household, so a reply is grounded in what is actually recorded and a reference resolves to the right person or thing.

**Acceptance criteria**
- A derived, rebuildable context layer reads every shipped domain through the member's own RLS-bound client; no model and no context code queries Supabase directly or through the service role.
- Every fact is a canonical `HouseholdContextItem` carrying provenance (source, evidence, confirmation), freshness, a context tier and a privacy class — never chain-of-thought.
- Entity resolution returns candidates: one strong candidate resolves, several ask which, a weak one asks to confirm; a low-confidence consequential target is never silently selected.
- Incoming facts are matched as exact_match, likely_duplicate, likely_update, related_but_different, contradiction or no_match; an older source never overrides a newer record.
- Health privacy scopes (private, selected_family, household_operational) hold with no household-administrator shortcut.
- The context is invalidated after any successful mutation.
- The council's 14 golden scenarios pass, and a live check shows no cross-household leakage.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-010 — HomeBrain 2.0: grounded household reasoning (Wave 2)
**Epic:** Household Context & Grounding
**Priority:** P0
**Spec:** `design/HOMEBRAIN-2.0-WAVE-2.md` (Product Council approved)
**Goal:** Make HomeBrain the household's reasoning layer — "WonderHome knows how our household works" — answering from what WonderHome knows, not from what a model can imagine.

**Acceptance criteria**
- HomeBrain uses Wave 1 retrieval and grounding; the model receives only `GroundedFact`s (opaque id, statement, sources, confidence, privacy class) that passed the consent gate.
- Cross-domain questions connect the parts of the home they span (school → household need, meals → groceries, appointment → calendar) without exposing private appointment details.
- Contextual references and follow-ups resolve through the context engine; an ambiguous person produces one focused clarification, never a guess.
- Every model answer is validated for unsupported names, dates, amounts, events, health claims, provider/integration claims and claims of completed actions; a failing answer is regenerated once with tighter context, then answered deterministically, then honestly declined — never silently accepted.
- "Why?" questions are answered from observable evidence (recorded reasons, provenance, HomeSend intakes), never chain-of-thought.
- Modes: answer, clarify, prepare, approval, done — "done" only after a governed executor confirms the change.
- A confirmed correction supersedes an older learned observation, with history kept; HomeBrain Review exposes fact, source, when learned, confidence, confirmation, edit and remove.
- HomeTalk and HomeSend changes become visible to HomeBrain; privacy boundaries hold; health stays privacy-scoped and non-diagnostic; every existing gate stays green.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass, including the §16 evaluation questions.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-011 — HomeSend 2.0: multimodal intake & reconciliation (Wave 3)
**Epic:** Household Context & Grounding
**Priority:** P0
**Spec:** `design/HOMESEND-2.0-WAVE-3.md` (Product Council approved)
**Goal:** "Give WonderHome something that matters" — HomeSend understands, grounds, reconciles and safely proposes updates from text, files, audio, links and email forwarding.

**Acceptance criteria**
- HomeSend supports text, files (P0: JPG, PNG, WebP, PDF, TXT), audio, links and email forwarding, and every input goes through the same canonical understanding pipeline.
- Entity resolution is shared with HomeBrain/HomeTalk; an ambiguous person gets one focused question, never a guess.
- Existing records are checked before a duplicate is created; update and cancellation candidates are proposed against the existing record, with undo.
- Cross-domain impact can be proposed safely, each impact separately confirmed and undoable.
- Malicious or untrusted content cannot become instructions; links are fetched SSRF-safely; an uncertain voice transcript is never acted on.
- The email webhook is signature-verified, the recipient address alone determines the household, retries are idempotent, and a malicious attachment never loses the safe email text.
- Pending items persist in the inbox (Needs your review, Recently handled, Failed safely); all writes use governed domain services; HomeBrain sees successful changes after routing.
- Live email is only marked active after provider configuration and end-to-end verification.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass, including the §20 acceptance matrix.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.