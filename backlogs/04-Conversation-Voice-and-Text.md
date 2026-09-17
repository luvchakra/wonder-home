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

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Conversation, Voice & Text as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 04-E01 — Conversation Understanding & Safe Actions:** stories 04-001 through 04-004.
- **Epic 04-E05 — Voice & Text Experience:** stories 04-005 through 04-006.
- **Epic 04-E07 — Memory & Conversational Configuration:** stories 04-007 through 04-008.

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

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.