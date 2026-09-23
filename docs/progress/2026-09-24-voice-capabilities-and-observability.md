# Voice phases 5–6: one capability matrix, per-surface conversations, voice gates and per-channel telemetry (stories 04-016, 04-017)

**Specs:**
- `design/voice-integration/05-unified-voice-ux-and-capabilities.md`
- `design/voice-integration/06-voice-integration-evaluation-and-hardening.md`

**Stories:**
- 04-016 Done.
- 04-017 In Progress. What is left needs a person; see below.

## What was built

### Phase 5: one household, one engine, channels as doors

- **Capability matrix as code** (`voicelink/capabilities.ts`). This is the spec's matrix, as data, across the app, Gemini Voice and Alexa.
  - Every cell is one of: `yes`, `consent` (Gemini: only if the household's data-use agreement lets that class reach Google), `opt_in` (Alexa: only if the member turned the scope on when linking), `approval`, `app_only`, or `session`.
  - Every one of HomeTalk's 22 intent actions is placed exactly once, so a new action has to be decided on for voice.
  - `capabilities.test.ts` holds every cell to the gates that actually decide:
    - `voiceAllowsAction`;
    - the default and sensitive scopes;
    - `inAppVoiceScopes`' consent mapping;
    - the Gemini tool list.
  - Payments and orders are `app_only` by voice. That is stricter than the spec's "step-up + approval", on purpose: a spoken yes is not step-up authentication, and a speaker in a shared kitchen is not the member alone.
- **Voice assistants screen.** It now shows "What a voice assistant can do" for Gemini Voice and Alexa, grouped as Can do / Can do when you allow it / Only in the app. It renders from the matrix, so it cannot drift from policy.
- **Conversations belong to their surface** (spec "Cross-channel continuity").
  - Until now a member had **one open session whatever the channel**. Every pending question and proposal hangs off the session, so "which one?" said to Alexa could have answered the app's question, or approved its proposal.
  - Now `conversation_sessions.surface` is `app` or `alexa`. The web, PWA and in-app Gemini share the app's conversation (one screen); Alexa has its own. Household data is shared.
  - Migration `20260926100000` is applied live.
  - `openSession` and `currentSessionId` are scoped by surface.
- **The spec's everyday questions are read by the rules.** The golden set showed four of the spec's own examples were not: "what's for dinner?", "do we need milk?", "do the kids have homework?" and "what homework does Asmi have?". Each cost a model round trip, and without a model the reply was "I did not follow that". One rule now reads them as questions. Statements such as "we need milk" still add.

### Phase 6: evaluation, telemetry, cost controls

- **Golden voice scenarios and a blocking `voice` gate in `npm run eval`** (`voicelink/readiness.ts`). The gate checks four things, with no model and no network:
  - every golden Gemini tool call becomes a sentence the rules read as the promised action, with its details;
  - every golden Alexa carrier phrase lands on its action;
  - every action is placed in the matrix;
  - every app-only action is refused over voice by the gate itself.

  Its evidence says plainly that a real Gemini Live and Alexa run need a person's account.
- **Structured Gemini tool sentences skip the second model read.** Sentences built from a tool's structured arguments go to HomeTalk's rules first (`rulesFirst`). Anything the rules don't read confidently still goes to the model, and every gate downstream is unchanged. `ask_household` and `answer_pending_question` still carry the person's own words to the model.
- **Per-channel telemetry.**
  - `hometalk_channel_events`: one row per HomeTalk turn, or per channel event (Gemini session opened, provider error, unlinked Alexa speaker, rate limit).
  - Each row holds only closed words and numbers: channel, outcome, latency, and whether it was a replay. Never an utterance, a transcript or audio.
  - Service-role only (RLS deny-all), and swept after 90 days by `/platform/retention`. Migration `20260926110000` is applied live, and `verify:live` checks it.
  - Where rows are recorded:
    - the gateway records every turn and knows a redelivery from its first run;
    - the web composer's route records its turns;
    - the Gemini session route records sessions and provider errors;
    - Alexa records unlinked speakers and rate limits.
- **Metrics.** `GET /platform-admin/voice-metrics` (`ai_operations.read`) reports per channel:
  - requests;
  - success, failure, clarification, approval and not-authorized rates;
  - action success and failure;
  - duplicates;
  - p50/p95 latency;
  - provider errors and Live sessions;
  - unlinked speakers and rate limits.

  Every rate is a count out of a count.
- **Cost control.** Tool calls are capped per Gemini Live session (`voice.tool`, 120 per 15 minutes). The session token already expires after 15 minutes, and sessions are rate-limited per member.

## Verified

- **Gates.** Typecheck, lint and repo lints pass.
  - Unit tests:
    - capability matrix 11;
    - session surfaces 3;
    - golden voice 25;
    - channel metrics 5;
    - gateway telemetry 3;
    - conversation, evaluation and HomeBrain suites all green.
  - Database tests: voice links 11/11, including channel telemetry being unreachable from sessions and the surface constraint.
  - Eval 45/45 with unsafe actions 0/13, and the new `voice` gate passes: 15/15 Gemini sentences, 4/4 Alexa phrases, 22/22 actions placed, 11/11 app-only actions refused.
  - `verify:live` 153/153.
- **Live, on the dev server with Gemini as the key.**
  - Tool calls through the real route answered and executed correctly: meal plan, 6 apples added, a reminder set, a duplicate add answered "already on the groceries".
  - `hometalk_channel_events` rows were written for `gemini_voice` and `web` with outcomes and latency, and nothing else.
  - The QA household has one `app` session shared by the web and Gemini.
- **Browser.** `/settings/voice-assistants` at 360px and desktop: the capability section renders, with no overflow and no console errors.

## Observed, not changed

- **Turn latency here.** It is about 8–10 s on the dev server. That is database round-trips from this sandbox: about 310 ms each, measured, times the 25–30 sequential queries in a turn. It is not model time; skipping the model read did not move it. Measure again in production, where a round-trip is a few ms, before setting a voice latency gate.

## Still open / needs a person

- **Alexa end to end.** Someone must create the skill and set `ALEXA_*` (`integrations/alexa/README.md`).
- **Gemini Live on a real device**: speak, interrupt, pause, end. The sandbox proxy has no WebSocket upgrades.
- **A rendered dashboard and alert delivery** for the voice metrics. The JSON endpoint exists; no admin UI or paging integration does, the same as the eval's `operations` gate says.

## Where the code lives

- **Voice modules:**
  - `packages/core/src/voicelink/capabilities.ts`
  - `packages/core/src/voicelink/readiness.ts`
  - `packages/core/src/voicelink/voice-golden.test.ts`
- **Telemetry:**
  - `packages/core/src/hometalk/channel-events.ts`
  - `packages/core/src/hometalk/gateway.ts` (the `record` hook)
- **Sessions:** `packages/core/src/conversation/repository.ts` (`surfaceForChannel`, surface-scoped sessions)
- **Rules:** `packages/core/src/conversation/rules.ts` (everyday domain questions)
- **Routes and screens:**
  - `apps/web/app/api/v1/platform-admin/voice-metrics/route.ts`
  - `apps/web/app/settings/voice-assistants/page.tsx`
- **Migrations:**
  - `supabase/migrations/20260926100000_conversation_session_surface.sql`
  - `supabase/migrations/20260926110000_hometalk_channel_events.sql`

## Test data cleanup

Ran after PR #133 merged:
- QA account `80d4bb89-9ed3-4d88-82e1-53f3b470191e`, deleted with `qa-test-user.mjs delete`.
- Household `efca6ba4-089f-4bb4-8963-d0e5e9b5af18` ("Gemini QA Home"), with its audit events and channel events.
- This session's `rate_limit_counters` rows: `ai.model`, `hometalk.turn`, `voice.session`, `voice.tool` and `verify.live`.

SQL counts confirm none of it remains: households, members, sessions, channel events, audit events, Storage objects, the auth user, the profile and the rate-limit rows are all 0.

The scratchpad scripts and screenshots were deleted, and the dev server had already been stopped.
