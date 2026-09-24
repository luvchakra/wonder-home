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
| 8 | P2 | 14-008 | Predictive intelligence | Done | `ai/predictions.ts`: the next 14 days read from real rows only, never a model and never written — three or more things likely to run out within a week of each other (one shop, an opportunity; from the buying pattern or what the household stated), two or more unpaid bills due within 5 days (a risk; amounts summed only when known and in one currency), a child's exam in a week with 3+ other things due (a risk). Thresholds deliberately high so an ordinary week says nothing. Today's Household view shows "Looking ahead" from exactly what the viewer may already read (never a child's view); `GET /households/{id}/predictions`. Money now shows two decimals whenever it has any (₹3,449.50) |
| 9 | P0 | 14-009 | Household context & grounding engine (Wave 1) | Done | `packages/core/src/context/`: a derived, rebuildable layer over the domain repositories, read only through the member's own RLS client (never the service role, never `.rpc`). One canonical `HouseholdContextItem` per fact with provenance, freshness (current/stale/historical/superseded/unknown), tier 1–4 and privacy class; health's private/selected_family/household_operational scopes preserved with no admin shortcut. Retrieval API (`resolvePerson`, `resolveEntity`, `resolveReference`, `findRelevantFacts`, `findPotentialMatches`, `findPotentialConflicts`, `getCurrentState`, `getRecentChanges`, `getSupportingEvidence`); resolution never silently picks a low-confidence consequential target — it resolves, clarifies or asks. HomeBrain's context and question relevance, HomeTalk's person/grocery/health-issue resolution and HomeSend's duplicate reconciliation all go through it; every successful write invalidates it. 14 golden scenarios + 18 engine tests; live count-only check: an impersonated member sees 0 rows from 12 other households across all 29 tables the engine reads |
| 10 | P0 | 14-010 | HomeBrain 2.0 — grounded household reasoning (Wave 2) | Done | Spec: `design/HOMEBRAIN-2.0-WAVE-2.md`. Part 1 (grounded reasoning core): `packages/core/src/homebrain/` — question reading (intent/entity/time/domain hints, cross-domain connection, follow-ups, ambiguity → one focused question), the `GroundedFact` contract (opaque `F`-ids, sources, confidence, privacy class), the §14 prompt contract with cited `usedFacts`, post-generation validation (unsupported names/dates/amounts/events/health/integration/"done" claims) with one tighter regeneration then a deterministic answer then an honest "not on record", deterministic "why?" answers from recorded evidence, and the five modes (done only after an executor confirms). Part 2 (current truth): preferences keyed by subject and object (`parsePreference`), so "Actually Asmi is okay with mushrooms now" supersedes "Asmi doesn't like mushrooms" with history kept; every learned preference is written to HomeBrain Review (`certification_items.memory_id`, backfilled live by `20260923120000_homebrain_review_links_memories.sql`) with its correction recorded; Review decisions (confirm, correct, remove) update what HomeBrain reads; beliefs added in Review are read by HomeBrain with their provenance; the screen is renamed HomeBrain Review and shows source, when learned, confidence and confirmation. Fixed: adding a belief in Review was always refused by RLS |
| 11 | P0 | 14-011 | HomeSend 2.0 — multimodal intake & reconciliation (Wave 3) | Done | Spec: `design/HOMESEND-2.0-WAVE-3.md`. Part 1 (one pipeline, every input): `packages/core/src/homesend/ingest.ts` — every entry point (upload, paste, composer paperclip, share target, share handoff, email webhook) goes secure intake → normalize → understand → the canonical `IntakeUnderstanding` (`understanding.ts`: summary, entities, facts, candidate actions from a fixed list, references, change signal, safety, provenance). New inputs: PDF (read by the model as a document, so scanned PDFs too), TXT/CSV, links (`link-fetch.ts`: SSRF-safe — public addresses only, DNS checked and pinned, redirects re-checked, size/time limits, no cookies), voice notes (`audio.ts`: transcript confidence gate, uncertain or consequential transcripts shown and confirmed, never acted on). Types decided from bytes (`normalize.ts`), prompt-injection defense (`injection.ts`: fenced untrusted content, flagged instructions ignored and said so), content-hash idempotency, "Failed safely" inbox state with reasons, HTML-only emails read instead of dropped. Migration `20260924090000_homesend_multimodal_intake.sql` (applied live). Part 2: entity resolution through the Wave 1 resolver (`resolve.ts`, one question when ambiguous — "Who is this for — Asmi or Manan?"), reconciliation (`reconcile.ts`: duplicate / update / cancellation / conflict against the record on file, the spec's own "Update the existing event?"), updates and cancellations through the domain services with exact undo (`homesend_changes.change_type` + `previous`, migration `20260924100000_homesend_reconciliation_changes.sql`, applied live), several needs per notice each separately confirmed and undone, review UI (What I found / Update existing / Keep existing / Add as new), email 2.0 (every recipient, HTML bodies, attachments as their own items via Resend's attachment API, idempotent retries). Part 3: confirmation strategy (`confirmation.ts`, §12 — a new grocery or school item applies on its own only when read clearly, sent in by a member, matching nothing on record, with no question open, and only where the household set that outcome to "execute"; bills and health documents always wait for a person; medium confidence prepares, low confidence asks one question), review outcomes kept on each item in closed words (migration `20260924110000_homesend_review_outcomes.sql`, applied live), HomeSend metrics (`metrics.ts`, §19, each a count out of a count, `GET /api/v1/platform-admin/homesend-metrics`), and the §20 acceptance matrix, one test per row (`acceptance-matrix.test.ts`). Live email still waits on a Resend account and receiving domain (§18) and is not labelled connected |
| 12 | P0 | 14-012 | HomeTalk 2.0 — contextual conversational operations (Wave 4) | Done | Spec: `design/HOMETALK-2.0-WAVE-4.md`. Part 1 (grounding): `conversation/temporal.ts` — one deterministic resolver for today/tomorrow/tonight/this and next Friday/this weekend/next week/after school/before dinner/explicit dates, in the household's timezone (the model names the phrase, code decides the day); `conversation/grounding.ts` — every action intent is grounded before a proposal exists: person mentions through the Wave 1 resolver (one focused question when two fit, "I do not know anyone called…" when none do), dates to local days, "that/it/them/him/the other one" through `conversation/references.ts` in the spec's priority order (pending question → pending proposal → recent conversation and recent HomeSend by recency → context), with "Do you mean the white T-shirt from the school notice or the printer paper?" when two things are in play; each turn persists its focus (what it acted on, proposed or mentioned) on its reply for the next turn's "that". Part 2 (operations): corrections (`conversation/corrections.ts`) amend a waiting proposal or undo-then-redo an executed write through its own domain service; multi-part sentences split (`conversation/decompose.ts`) into independently gated parts with the premise rule; several items per add; real reminders (`set_reminder`, a notification held until due); meals (`plan_meal` via `createMeal`/`attachIngredients`) and "make sure we have everything" from the recipe's ingredients; "Nothing to change" instead of "Done" when nothing was written Part 3 (contract): the model sees a runtime context (role, local date/time, what is waiting, what the conversation is about — minimised like the utterance) and returns named, nullable parameters with no id field, and anything server-only is stripped from its output; "I think you mean …" at medium confidence and "I found two possibilities …" at low; every §21 example handled through its own domain service (school done/move, remove from list, service request, protected family time); §22 matrix in `conversation/evaluation.test.ts` |
| 13 | P0 | 14-013 | Unified AI evaluation, reliability & production hardening (Wave 5) | Done | Spec: `design/AI-EVALUATION-WAVE-5.md`. One evaluation framework for HomeTalk, HomeSend and HomeBrain; synthetic golden households; §8 metrics and the §10 error taxonomy; corrections as structured evaluation evidence; provider/model/prompt/context versions recorded per run; release artifact and gates; rate and payload limits; failure semantics; idempotency; email-forwarding monitoring |
| 14 | P1 | 14-014 | HomeSend reads the time of day | Done | Local start and end read deterministically from the notice's own date words (`timeFromDateText`); `school_items.due_time_known` + `ends_at` (migration `20260927090000`, applied live); all-day items never show a time |
| 15 | P0 | 14-015 | WhatsApp into HomeSend — linking and intake | Done | Spec: the WhatsApp HomeSend integration brief. WhatsApp becomes an input channel, never an authorization channel (`packages/core/src/whatsapp/`, migration `20261002090000_whatsapp_intake.sql`, applied live). A number is linked to one adult member only through a single-use code: fifteen minutes, SHA-256 hash only, completed atomically by the service-role-only `public.complete_whatsapp_link` from a signature-verified "CONNECT <code>". One number, one member, anywhere. `public.disconnect_whatsapp` keeps history. A linked number's messages are recorded once by WhatsApp's message id and queued (`whatsapp.process` on the job queue, run after the response with `after()`, retried with backoff and dead after five tries). They become `whatsapp` / `whatsapp_media` HomeSend items from that member (`ingestWhatsAppText` / `ingestWhatsAppMedia`: media fetched from Meta's CDN only, type from bytes, private bucket), and a short acknowledgement never echoes an amount, a health detail or a number. An unlinked number is told how to connect, and nothing it sent is kept. Closed-word telemetry lives in `whatsapp_events`. Inert until a deployment sets the WhatsApp credentials |
| 16 | P0 | 14-016 | WhatsApp into HomeSend — in the app | Done | The mockup flow: connect WhatsApp (intro, save the number and send CONNECT, confirmation), another adult connecting, WhatsApp status beside members in Manage Household, WhatsApp as a HomeSend channel with an All / WhatsApp / Email / Uploads filter and provenance on each item, and connection management in Settings |
| 17 | P0 | 14-017 | Deep document understanding — whole-document reader & change plan | Done | Spec: `design/HOMESEND-DEEP-DOCUMENT-UNDERSTANDING-2.0.md` (mockup `design/HomeSend-Deep-Document-Understanding-Mockup.png`), phases A–C. The classifier reads the whole document into every household-relevant record across its pages (`records[]`: each event, each date of a series, each fee, each thing to buy), each with page, section and quote as evidence, plus pages read/unreadable and the day the document is dated (`issuedOn`). Deterministic backstop per record (no ids, no field a domain does not own); each record's day and time grounded by WonderHome, never the model. `homesend/document.ts` keeps the reading on the understanding (older readings derive records from the headline and needs); `homesend/plan.ts` reconciles every record on its own — create / update (field by field, before → after) / cancel / no change / conflict (a newer record wins, §28) / needs your answer (one question, §29) — with a series of dates read as occurrences, one record on file answering for one thing, a same-amount-same-day bill recognised, and school/class enrichment from the household's records marked as such (§30). Matcher fixes: a part of an occasion (rehearsal, fee, registration) is never the occasion; equal matches ordered by name. Golden scenarios 1–3 (§46–48) are permanent tests |
| 18 | P0 | 14-018 | Deep document understanding — review, apply and receipt | Done | Phases D–E. A document with two or more records is reviewed as its plan in HomeSend and in the HomeTalk paperclip sheet (`_components/home-send-plan.tsx`): Found N items, grouped Updates / New / Already on record / Conflicts / Needs your answer, each row opening to its fields, before → after, household-record enrichment and source page, with per-record include, edit and "who is it for"; "Review and apply (N)". `applyDocumentPlanAction` rebuilds the plan on the server from the stored reading (the browser sends only choices), writes each included record through its domain service (writes moved to the server-only `home-send-writes.ts`), verifies updates by reading them back, records each change with its plan key, field-level before/after and evidence (migration `20261005090000_homesend_document_plan_receipt.sql`, applied live), and keeps the exact plan and receipt on the item. `homesend/apply.ts` makes the receipt: created / updated / cancelled / unchanged / skipped / needs_clarification / failed, partial never reported as done, "Nothing new found. No records changed." as a success; a second apply returns the stored receipt. "Undo all" reverses every change of a document; history names each change. A document with a plan never applies on its own |
| 19 | P0 | 14-019 | Deep document understanding — HomeTalk attachments & certification | Done | Phases F–G. The paperclip in HomeTalk opens the same HomeSend sheet, pipeline, plan and apply — no second parser — and once a plan is applied HomeTalk posts what it did into the conversation from the stored receipt (`documentReceipt` turn, `homesend/talk.ts` `documentReplyText`: "I read the 2-page school notice and found 7 things… Done. Updated: • Annual Day — 12 Oct → 15 Oct …"). "What did the school notice change?" is answered by rules from the receipt and the change rows (`readDocumentChangeQuestion` / `answerDocumentChanges`), never from the model's reading: undone changes are said to be undone, and a question no applied document fits goes on to HomeBrain; not over a voice link, whose content limits the HomeBrain path applies. Golden scenario 4 (same reading → same plan whichever door) in `talk.test.ts`; eval HS-16 (a part of an occasion is not the occasion, 50/50); §50 counts in HomeSend metrics (`documents`: applied, outcomes, changes standing, correct household changes per document). A receipt with a question still open says so ("1 change applied, 1 waiting on your answer") |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement AI Orchestration & Learning as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 14-E01 — Governed AI Orchestration:** stories 14-001 through 14-005.
- **Epic 14-E06 — Learning, Multi-Agent Coordination & Prediction:** stories 14-006 through 14-008.
- **Epic 14-E09 — Household Context & Grounding:** story 14-009.
- **Epic 14-E17 — Deep Document Understanding 2.0:** stories 14-017 through 14-019.

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

### Story 14-012 — HomeTalk 2.0: contextual conversational operations (Wave 4)
**Epic:** Household Context & Grounding
**Priority:** P0
**Spec:** `design/HOMETALK-2.0-WAVE-4.md` (Product Council approved)
**Goal:** "HomeTalk should understand the household, not just the sentence" — HomeTalk becomes the reliable conversational control surface for household operations.

**Acceptance criteria**
- HomeTalk is genuinely model-driven when a provider is configured, and keeps its deterministic safety nets when one is not.
- Wave 1 contextual grounding and HomeBrain retrieval are reused; the model only proposes, the server resolves ids and dates.
- References ("that", "it", "them", "the other one") resolve reliably in the spec's priority order; ambiguity creates one focused clarification.
- Dates resolve deterministically in the household's timezone.
- Corrections work: before a write they amend the pending operation; after one they go through the normal update/undo path.
- Multi-step requests decompose into independently validated operations; cross-domain requests propose per domain.
- Text and voice share one semantic engine; low-confidence consequential voice commands are confirmed.
- Every mutation goes through governed tools/domain services, and the executor's actual result decides what the reply claims.
- HomeTalk and HomeSend share household truth.

**Progress**
- Part 1 (grounding, §4–§8, §16) — merged in PR #120. Note: `docs/progress/2026-09-23-hometalk-2-grounding.md`.
- Part 2 (corrections, multi-step, cross-domain, honest "unchanged", §9–§12) — note: `docs/progress/2026-09-23-hometalk-2-operations.md`.
- Part 2 merged in PR #121.
- Part 3 (model prompt contract, confidence UX, voice confirm, §21 examples and §22 matrix) — note: `docs/progress/2026-09-23-hometalk-2-contract.md`. Story Done.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass, including the §22 evaluation matrix.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.


### Story 14-013 — Unified AI evaluation, reliability & production hardening (Wave 5)
**Epic:** Household Context & Grounding
**Priority:** P0
**Spec:** `design/AI-EVALUATION-WAVE-5.md` (Product Council approved)
**Goal:** Move from "the model seems to understand" to "we can measure whether WonderHome understood correctly, grounded it correctly and changed the household correctly."

**Acceptance criteria**
- One evaluation framework is shared by HomeTalk, HomeSend and HomeBrain, comparing each stage: interpretation, grounding, entity resolution, action proposal, safety/governance, executor result and final answer.
- Synthetic golden households A–E exist (never production data), with golden cases across the §4 categories.
- The §8 metrics are measured separately, the §10 error taxonomy is tracked, and the Unsafe Action Rate is 0 in release evaluation.
- Every run records provider, model, prompt version, context version and dataset version; the same golden set runs for every configured provider.
- User corrections become structured evaluation evidence, never erased.
- Human approval binds to the exact target, amount and entity; stale and changed-proposal approvals are rejected.
- Rate and payload limits, honest failure semantics and idempotency hold across the three surfaces.
- Email forwarding is observable end to end, with alert conditions.
- An AI release artifact records the evaluation, safety result, known limitations and rollback plan; release gates are enforced.

**Progress**
- Started 2026-09-23.
- Part 1 (2026-09-23): the evaluation framework, `packages/core/src/evaluation/`, run by `npm run eval` in CI and `verify`. It covers golden households A–E and 45 cases across the three surfaces. It adds the §2 staged comparison, the §10 taxonomy, the §8 metrics, the §9 Unsafe Action Rate, content-hashed prompt/context/dataset versions, the §21 gates and the §22 artifact (`docs/ai-releases/`). The golden set found five HomeBrain and HomeTalk defects, which were fixed. Note: `docs/progress/2026-09-23-wave5-evaluation-framework.md`.
- Part 2 (2026-09-23): corrections are now structured evidence (§13). HomeTalk corrections, HomeSend review fixes and HomeBrain Review corrections each write one row per corrected field into the append-only, admin-readable `ai_corrections`, stamped with error type, understanding source and prompt version. Approvals bind to the exact proposal (§20): `conversation_actions.approval_fingerprint`, and stale, changed and expired approvals are refused and closed. HomeTalk and HomeBrain production quality (§23) is served at `GET /api/v1/platform-admin/ai-quality`. Migration `20260924140000` is applied live and `verify:live` passes 140/140. Note: `docs/progress/2026-09-23-wave5-corrections-approvals-metrics.md`.
- Part 3 (2026-09-23): production hardening (§14–§17).
  - Limits: fixed-window rate limits through the service-role-only `public.rate_limit_hit`, fail-open. They cover a HomeTalk turn, model calls per household, HomeSend intake, links and forwarded email. Payload limits add 40 PDF pages, 10 minutes of WAV and a 256 KB webhook body.
  - Timeouts: every model client has one, with a single SDK retry; voice has one too.
  - Email: forwarded email is observed end to end in the closed-word `homesend_email_events`, with the §14 alert thresholds in the platform-admin HomeSend metrics.
  - Retries: a failed classification is persisted and retried through `jobs`, drained after the response and by the daily retention run. The cron routes now answer Vercel Cron's GET.
  - Failure semantics: a multi-part request that half-succeeded says which parts did and did not happen.
  - Concurrency: idempotency keys are reserved while in flight, and one household's agent run is locked for 10 minutes.
  - Security: `npm run security` gained untrusted intake, AI release safety, and abuse and retries.
  - Migration `20260924150000` is applied live, and `verify:live` passes 145/145.
  - Not yet: a rendered operations dashboard and alert delivery, so the non-blocking operations gate still reads "not yet". A configured-provider eval run and live Resend both wait on a person.
  - Note: `docs/progress/2026-09-23-wave5-production-hardening.md`.

**Definition of Done**
- One unified evaluation framework, synthetic golden households, common infrastructure across the three surfaces.
- Provider/model/prompt/context changes are measurable; corrections feed structured error analysis.
- Production telemetry, continuously tested security/privacy cases, email forwarding observed end to end, queues/retries tested, rollback documented.
- No unsafe execution in release evaluation; the normal verification gates stay green.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-014 — HomeSend reads the time of day
**Epic:** AI Orchestration
**Priority:** P1
**Goal:** Keep the time a notice gives, not just the day.

**Acceptance criteria**
- An intake's date text with a time ("at 9:00 am", "9–11am") grounds to a local start (and end) time in the household's timezone.
- A time on its own never invents a day; a day with no time stays an all-day item.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 14-015 — WhatsApp into HomeSend: linking and intake
**Epic:** AI Orchestration
**Priority:** P0
**Goal:** A household adult can link their own WhatsApp number and forward anything to WonderHome's official number, and it arrives in their household's HomeSend — with WhatsApp never able to decide, authorize or touch a domain record.

**Acceptance criteria**
- A number is linked only by a single-use, time-limited code issued to a signed-in adult and sent from that number; a matching number alone links nothing; one number is linked to at most one member anywhere; a second adult links their own.
- The household and member of every inbound message come from the verified link, never from the payload; an unlinked number's content is not kept.
- Every retried delivery is idempotent — one message record, one HomeSend item, one acknowledgement.
- Text, images, PDFs, text files and voice notes become HomeSend items through the existing pipeline and its confirmation strategy; anything else is refused politely.
- Disconnecting stops new association and deletes nothing; telemetry holds no content.

### Story 14-016 — WhatsApp into HomeSend: in the app
**Epic:** AI Orchestration
**Priority:** P0
**Goal:** The mockup flow, end to end, in the app.

**Acceptance criteria**
- Connect WhatsApp: an intro, the official number with copy and an "Open WhatsApp" link carrying the CONNECT message, and a confirmation shown only once the server has actually linked the number.
- Manage Household shows who has WhatsApp connected, never another member's number; Settings lets a member see, reconnect and disconnect their own, and an admin disconnect anyone's.
- HomeSend lists WhatsApp as a channel and filters its inbox by channel; every item shows where it came from and who sent it.
- Nothing is offered while the deployment has no WhatsApp number configured.

### Story 14-017 — Deep document understanding: whole-document reader & change plan
**Epic:** Deep Document Understanding 2.0
**Priority:** P0
**Goal:** Read the whole document, and decide for every household-relevant thing in it whether it is new, an update, already on record, a conflict, or needs a person's answer — before anything is written.

**Acceptance criteria**
- One document yields every record it proposes, across pages and domains (school, bills, things to buy), each with the page, section and words it came from; how many pages were read is reported and an unreadable page is never claimed read.
- The model never names an id, never decides a day (WonderHome grounds each record's own words), and never proposes a field a record's domain does not own.
- Each record is reconciled on its own: an existing record is updated field by field rather than duplicated; the same thing already on record is a no-op; a record changed after the document was written stands (conflict); a child it cannot place is one question, and nothing is created until it is answered.
- Several dates of the same thing are separate occurrences; one record on file answers for one thing in the document.
- Enrichment from the household's own records is marked as such.
- Golden scenarios 1–3 of the spec are permanent regression tests.

### Story 14-018 — Deep document understanding: review, apply and receipt
**Epic:** Deep Document Understanding 2.0
**Priority:** P0
**Goal:** The person sees exactly what will change, chooses record by record, and afterwards sees exactly what did.

**Acceptance criteria**
- The review groups outcomes (Updates, New, Already on record, Conflicts, Needs your answer); every record opens to its fields, before → after, and its source page; each can be included, skipped, edited or answered.
- Applying runs each included record through its own domain service; the exact plan and a field-level change history are kept; the receipt says what was created, updated, left unchanged, skipped or failed, and a partial failure is never reported as success.
- Every applied change can be undone exactly; re-sending the same document changes nothing.

### Story 14-019 — Deep document understanding: HomeTalk attachments & certification
**Epic:** Deep Document Understanding 2.0
**Priority:** P0
**Goal:** A file given to HomeTalk goes through the same pipeline and plan, and HomeTalk can say afterwards what it actually changed.

**Acceptance criteria**
- The same file through HomeTalk and HomeSend produces the same understanding, matches, proposals, writes and provenance; only the presentation differs.
- HomeTalk shows the plan and the receipt in the conversation, and answers "what did it change?" from stored changes, never from the model's reading.
- The spec's golden scenarios and §45 coverage run in the evaluation; §50 counts are observable.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.