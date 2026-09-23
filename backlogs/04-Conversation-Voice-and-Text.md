# WonderHome — Conversation, Voice & Text

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 04-001 | Unified conversation engine | Done | Typed intent shared by both channels |
| 2 | P0 | 04-002 | Natural commands | Done | Fixture-backed; unknown rather than a guess |
| 3 | P0 | 04-003 | Contextual replies | Done | Resolved against the pending proposal, with expiry |
| 4 | P0 | 04-004 | Action preview | Done | Summary, changes, reason, reversibility |
| 5 | P0 | 04-005 | Voice | Done | Same engine; transcript confidence kept |
| 6 | P0 | 04-006 | Text | Done | Same engine as voice |
| 7 | P0 | 04-007 | Memory extraction | Done | Source, confidence and status on every belief |
| 8 | P1 | 04-008 | Conversation corrections | Done | Reconciliation built and tested; corrections flow through the assistant and are written server-side |
| 9 | P1 | 04-009 | A voice the household chooses | Done | Google Cloud Speech behind a provider contract, on the deployment's own key; every voice and recognition control, with the browser as the free fallback |
| 10 | P0 | 04-010 | One composer, four states | Done | Speak-to-text and live conversation as separate, adjacent controls; explicit state machine with its own test |
| 11 | P0 | 04-011 | Never ask the same question twice | Done | A clarifying question is answered by the next turn, and never repeated verbatim |
| 12 | P0 | 04-012 | One HomeTalk gateway for every channel | Done | Voice phase 1 (`design/voice-integration/01…`): `hometalk/contract.ts` + `hometalk/gateway.ts` — one canonical request/response for web, Gemini Voice and Alexa; "completed" only from the executor's own record; idempotent per delivery (PR #131) |
| 13 | P0 | 04-013 | Linked voice assistants: identity, OAuth, scopes | Done | Voice phase 2: `external_voice_identities` + `voice_oauth_grants` (hashed), S256 PKCE, scopes only narrow, payments/orders never by voice, turns under the member's own RLS session, `/settings/voice-assistants` to revoke (PR #131) |
| 14 | P0 | 04-014 | Gemini Voice: Gemini Live as a HomeTalk channel | Done | Voice phase 3: `voicelink/gemini-live.ts` (12 allowlisted tools, each only words a member could say to HomeTalk), single-use Live tokens locked to that config, `/voice/gemini/session` + `/voice/gemini/tool`, facts narrowed to the content classes the household lets reach Google, `useGeminiLive` behind the one live control, `live_engine` voice setting. Live-verified token → Gemini Live → tool → HomeTalk → spoken answer; in-browser mic audio not exercisable in the sandbox (its proxy has no WebSocket upgrades) |
| 15 | P1 | 04-015 | Alexa as a HomeTalk channel | Done | Voice phase 4: `/api/v1/voice/alexa` verified as Amazon documents (cert chain, signature, timestamp, skill id), carrier-word interaction model; inert until a person creates the skill and sets `ALEXA_*` (`integrations/alexa/README.md`) |
| 16 | P0 | 04-016 | Unified voice experience and capability matrix | Done | Voice phase 5: `voicelink/capabilities.ts` — the spec's matrix as data, every HomeTalk action placed once, every cell held to the real gates by `capabilities.test.ts`, shown to households on `/settings/voice-assistants`; payments/orders stay app-only by voice (stricter than the spec, on purpose). Conversations belong to their surface (`conversation_sessions.surface`: app / alexa, migration `20260926100000`, applied live) — a question the app asked is never answered by Alexa. Everyday domain questions ("what's for dinner?", "do we need milk?", "do the kids have homework?") now read by the rules |
| 17 | P0 | 04-017 | Voice evaluation, metrics and release gates | In Progress | Voice phase 6 built: golden voice scenarios and a blocking `voice` gate in `npm run eval` (`voicelink/readiness.ts`); per-channel telemetry `hometalk_channel_events` (migration `20260926110000`, applied live) with the spec's metrics at `GET /platform-admin/voice-metrics`; Gemini tool calls capped per session; structured Gemini tool sentences read by the rules first. Left, and needing a person: a real Alexa end-to-end run (the skill must be created), a device-level Gemini Live audio run, and a rendered dashboard with alert delivery |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Conversation, Voice & Text as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 04-E01 — Conversation Understanding & Safe Actions:** stories 04-001 through 04-004.
- **Epic 04-E05 — Voice & Text Experience:** stories 04-005 through 04-006.
- **Epic 04-E07 — Memory & Conversational Configuration:** stories 04-007 through 04-008.
- **Epic 04-E12 — Voice Channels (voice integration, `design/voice-integration/`):** stories 04-012 through 04-017.

## Dependencies
- `CLAUDE.md`
- `TECH-STACK-AND-NFR.md`
- `architecture/API-ARCHITECTURE.md`
- `architecture/SECURITY-BASELINE.md`
- `database/SUPABASE-DATABASE.md`
- `tracking/PROGRESS.md`
- `tracking/IMPLEMENTATION-ORDER.md

## Stories

### Story 04-001 — Unified conversation engine
**Epic:** Conversation Understanding & Safe Actions
**Priority:** P0
**Goal:** Use one engine for text and voice.

**Acceptance criteria**
- Given the household state described by the story, use one engine for text and voice .
- Representative household utterances are included as deterministic regression fixtures.
- The same household request is represented by a typed intent with actor, target, parameters and requested action regardless of whether it arrived as text or speech.
- Consequential ambiguity results in clarification rather than guessed execution; low-risk explicit preferences can be applied directly within policy.
- Every action proposal is checked against member role, household scope, entitlement and autonomy policy before execution.
- Conversation state is scoped to the session/member and does not leak private adult or child conversations into shared household context.
- AI tool calls and resulting mutations are traceable to the originating conversation action without logging raw sensitive content by default.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 04-002 — Natural commands
**Epic:** Conversation Understanding & Safe Actions
**Priority:** P0
**Goal:** Understand changes to people, plans, preferences and
responsibilities.

**Acceptance criteria**
- Given the household state described by the story, understand changes to people, plans, preferences and
responsibilities .
- Preferences retain source and scope so household preferences are not confused with an individual member preference.
- The same household request is represented by a typed intent with actor, target, parameters and requested action regardless of whether it arrived as text or speech.
- Consequential ambiguity results in clarification rather than guessed execution; low-risk explicit preferences can be applied directly within policy.
- Every action proposal is checked against member role, household scope, entitlement and autonomy policy before execution.
- Conversation state is scoped to the session/member and does not leak private adult or child conversations into shared household context.
- AI tool calls and resulting mutations are traceable to the originating conversation action without logging raw sensitive content by default.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 04-003 — Contextual replies
**Epic:** Conversation Understanding & Safe Actions
**Priority:** P0
**Goal:** Handle short replies like yes, no and do it.

**Acceptance criteria**
- Given the household state described by the story, handle short replies like yes, no and do it .
- The composer supports retry without duplicating the underlying action.
- The same household request is represented by a typed intent with actor, target, parameters and requested action regardless of whether it arrived as text or speech.
- Consequential ambiguity results in clarification rather than guessed execution; low-risk explicit preferences can be applied directly within policy.
- Every action proposal is checked against member role, household scope, entitlement and autonomy policy before execution.
- Conversation state is scoped to the session/member and does not leak private adult or child conversations into shared household context.
- AI tool calls and resulting mutations are traceable to the originating conversation action without logging raw sensitive content by default.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 04-004 — Action preview
**Epic:** Conversation Understanding & Safe Actions
**Priority:** P0
**Goal:** Preview consequential changes before execution.

**Acceptance criteria**
- Given the household state described by the story, preview consequential changes before execution .
- The same household request is represented by a typed intent with actor, target, parameters and requested action regardless of whether it arrived as text or speech.
- Consequential ambiguity results in clarification rather than guessed execution; low-risk explicit preferences can be applied directly within policy.
- Every action proposal is checked against member role, household scope, entitlement and autonomy policy before execution.
- Conversation state is scoped to the session/member and does not leak private adult or child conversations into shared household context.
- AI tool calls and resulting mutations are traceable to the originating conversation action without logging raw sensitive content by default.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 04-005 — Voice
**Epic:** Voice & Text Experience
**Priority:** P0
**Goal:** Support speech input and conversational voice.

**Acceptance criteria**
- Given the household state described by the story, support speech input and conversational voice .
- Representative household utterances are included as deterministic regression fixtures.
- The same household request is represented by a typed intent with actor, target, parameters and requested action regardless of whether it arrived as text or speech.
- Consequential ambiguity results in clarification rather than guessed execution; low-risk explicit preferences can be applied directly within policy.
- Every action proposal is checked against member role, household scope, entitlement and autonomy policy before execution.
- Conversation state is scoped to the session/member and does not leak private adult or child conversations into shared household context.
- AI tool calls and resulting mutations are traceable to the originating conversation action without logging raw sensitive content by default.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 04-006 — Text
**Epic:** Voice & Text Experience
**Priority:** P0
**Goal:** Support persistent text input everywhere.

**Acceptance criteria**
- Given the household state described by the story, support persistent text input everywhere .
- The composer supports retry without duplicating the underlying action.
- The same household request is represented by a typed intent with actor, target, parameters and requested action regardless of whether it arrived as text or speech.
- Consequential ambiguity results in clarification rather than guessed execution; low-risk explicit preferences can be applied directly within policy.
- Every action proposal is checked against member role, household scope, entitlement and autonomy policy before execution.
- Conversation state is scoped to the session/member and does not leak private adult or child conversations into shared household context.
- AI tool calls and resulting mutations are traceable to the originating conversation action without logging raw sensitive content by default.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 04-007 — Memory extraction
**Epic:** Memory & Conversational Configuration
**Priority:** P0
**Goal:** Turn explicit statements into structured household memory.

**Acceptance criteria**
- Given the household state described by the story, turn explicit statements into structured household memory .
- The same household request is represented by a typed intent with actor, target, parameters and requested action regardless of whether it arrived as text or speech.
- Consequential ambiguity results in clarification rather than guessed execution; low-risk explicit preferences can be applied directly within policy.
- Every action proposal is checked against member role, household scope, entitlement and autonomy policy before execution.
- Conversation state is scoped to the session/member and does not leak private adult or child conversations into shared household context.
- AI tool calls and resulting mutations are traceable to the originating conversation action without logging raw sensitive content by default.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 04-008 — Conversation corrections
**Epic:** Memory & Conversational Configuration
**Priority:** P1
**Goal:** Correct memory/configuration conversationally.

**Acceptance criteria**
- Given the household state described by the story, correct memory/configuration conversationally .
- Representative household utterances are included as deterministic regression fixtures.
- The same household request is represented by a typed intent with actor, target, parameters and requested action regardless of whether it arrived as text or speech.
- Consequential ambiguity results in clarification rather than guessed execution; low-risk explicit preferences can be applied directly within policy.
- Every action proposal is checked against member role, household scope, entitlement and autonomy policy before execution.
- Conversation state is scoped to the session/member and does not leak private adult or child conversations into shared household context.
- AI tool calls and resulting mutations are traceable to the originating conversation action without logging raw sensitive content by default.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 04-009 — A voice the household chooses
**Epic:** Voice & Text Experience
**Priority:** P1
**Goal:** Let a household pick how WonderHome sounds and how carefully it listens, on a real speech provider rather than whatever the browser happens to offer.

**Acceptance criteria**
- The deployment configures one speech credential for everybody, as an environment variable; no household is asked for a key of its own.
- Speech reaches the provider through the server only; the key is never sent to a browser, a log or a rendered page.
- A household chooses whether to use that service at all, or keep speech inside its own browser, and the choice is a visible control rather than a side effect of configuring something else.
- Voice, language, accent, gender, voice family, speaking rate, pitch, volume and the listening device are each settable, and a change is audible on the next thing WonderHome says.
- Recognition language, additional languages for a household that switches mid-sentence, the recognition model, punctuation, profanity masking and expected words are each settable.
- The household's own member names are sent as recognition hints without anybody configuring them.
- A household with no provider configured keeps working on the browser's own speech, and the screen says which of the two is in use.
- Combinations a provider rejects — pitch on a voice family that synthesises its own — are dropped before the request rather than surfaced as a provider error.
- Every provider failure becomes something the household can act on, and never passes the provider's own prose through.
- Changing the voice — including whether speech leaves the browser — is written to the audit trail.
- Whether voice runs at all remains the `conversation.voice` entitlement and the rollout flag, checked server-side; the settings are preferences and never authorization.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 04-010 — One composer, four states
**Epic:** Voice & Text Experience
**Priority:** P0
**Goal:** Make the difference between "transcribe what I say" and "let's have a conversation" obvious at a glance, in one control.

**Acceptance criteria**
- The composer has exactly four states a household can be in — typing, speaking to text, a live conversation, and nothing at all — and which one it is in is never ambiguous.
- Tapping the microphone transcribes into the field for review and never starts a conversation; the person can edit what was heard before sending it.
- Tapping the conversation control starts a real back-and-forth and never silently sends a single transcribed message.
- A spoken message shows where it has got to — listening, transcribing, ready to send — rather than a spinner.
- A live conversation can be paused and resumed without ending it, and ending it still produces the recap.
- Illegal combinations are impossible by construction: no Send button while the microphone is open, and no live session left running behind a composer that looks idle.
- Escape leaves any voice state; every control carries an accessible name and a tooltip.
- Nothing is offered that cannot work: the conversation control is absent without the entitlement and flag, and the microphone is absent where the browser cannot listen.
- Every state works at 360px with no horizontal scroll and nothing clipped.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 04-011 — Never ask the same question twice
**Epic:** Memory & Conversational Configuration
**Priority:** P0
**Goal:** Make a clarifying question a promise to use the answer, so a household never has to repeat itself to be understood.

**Acceptance criteria**
- When WonderHome asks a clarifying question, the next turn is read as the answer to it before it is read as anything else.
- The answer is folded into what was already understood, rather than parsed as a fresh, unrelated request.
- The same question is never asked twice: a second attempt says what was understood, names exactly what is missing, and shows the shape of an answer that would work.
- A second attempt always offers a way forward that is not talking to the assistant again.
- Conversational filler somebody uses when frustrated ("I just said", "I already told you") is never mistaken for content.
- A destination ("for order", "to the shopping list") is never mistaken for the thing being ordered.
- Changing the subject instead of answering is allowed, and the new request is not swallowed as an answer.
- Only the most recent question is treated as open; an older one has been overtaken.
- An answer that resolves a clarification is treated as confident — somebody who has said a thing twice has been clear.
- A resolved intent still passes every entitlement, autonomy and approval gate; nothing here shortcuts consent.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 04-012 — One HomeTalk gateway for every channel
**Epic:** Voice Channels
**Priority:** P0
**Goal:** Give every channel — the app, Gemini Voice, Alexa — one canonical way to ask HomeTalk and one structured answer back.

**Acceptance criteria**
- A channel adapter only proves who is speaking and renders the answer; it never decides what happened.
- `completed` is read only from the governed executor's own record; a failed or unrecorded execution is `failed`, never "done".
- A redelivered request with the same request id replays its first answer and runs once.
- A session that is not the member the request names, or a household the member is not in, changes nothing and says so.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 04-013 — Linked voice assistants: identity, OAuth, scopes
**Epic:** Voice Channels
**Priority:** P0
**Goal:** Link an external voice assistant to one member with least privilege, and let them revoke it.

**Acceptance criteria**
- Linking is OAuth 2.0 with S256 PKCE; codes and tokens are stored only as SHA-256 hashes; a replayed code revokes the link's tokens.
- Scopes only narrow what the member could do in the app; payments, orders and access changes are never available by voice.
- A voice turn runs under the member's own RLS session, never a service role.
- Every member can see and revoke their links; an admin can revoke any link in the household.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 04-014 — Gemini Voice: Gemini Live as a HomeTalk channel
**Epic:** Voice Channels
**Priority:** P0
**Goal:** Let a member hold a real-time spoken conversation through Gemini Live without Gemini becoming a second HomeBrain.

**Acceptance criteria**
- Gemini receives only narrow, domain-specific tools; each call becomes words a member could have said and runs as a HomeTalk gateway turn.
- The browser holds only a short-lived, single-use token locked to WonderHome's instructions and tools — never a key.
- The tool result is HomeTalk's decision; success is the executor's, never the model's.
- Gemini only hears facts whose content class the household lets reach a model provider; school, money and health scopes follow the same agreement.
- Availability (flag, plan, a Google key, consent) is checked when a session opens and again on every tool call.
- A provider failure, timeout or closed session ends safely: nothing changed, the composer returns to idle, typing still works.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 04-015 — Alexa as a HomeTalk channel
**Epic:** Voice Channels
**Priority:** P1
**Goal:** Answer the WonderHome Alexa skill through HomeTalk, proved to be Amazon's before it is read.

**Acceptance criteria**
- Requests are verified as Amazon documents: certificate URL, chain and domain, signature over the raw body, timestamp and skill id.
- The speaker is whoever the WonderHome access token belongs to, never Amazon's account id.
- Inert until the skill id and OAuth settings are configured by a person; nothing claims a live integration before then.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 04-016 — Unified voice experience and capability matrix
**Epic:** Voice Channels
**Priority:** P0
**Goal:** One voice experience across the app, Gemini and Alexa, with a capability matrix that says what each channel may do.

**Acceptance criteria**
- Per `design/voice-integration/05-unified-voice-ux-and-capabilities.md`.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 04-017 — Voice evaluation, metrics and release gates
**Epic:** Voice Channels
**Priority:** P0
**Goal:** Voice golden scenarios, per-channel metrics and release gates alongside the Wave 5 evaluation.

**Acceptance criteria**
- Per `design/voice-integration/06-voice-integration-evaluation-and-hardening.md`.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- API/OpenAPI and Supabase migrations/RLS are updated where applicable.
- Relevant unit/integration/E2E tests pass.
- Security/privacy/audit requirements are verified.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.