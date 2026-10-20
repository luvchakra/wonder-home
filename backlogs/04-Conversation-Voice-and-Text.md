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
| 17 | P0 | 04-017 | Voice evaluation, metrics and release gates | In Progress | Voice phase 6 built: golden voice scenarios and a blocking `voice` gate in `npm run eval` (`voicelink/readiness.ts`); per-channel telemetry `hometalk_channel_events` (migration `20260926110000`, applied live) with the spec's metrics at `GET /platform-admin/voice-metrics`; Gemini tool calls capped per session; structured Gemini tool sentences read by the rules first. Left, and needing a person: a real Alexa end-to-end run (the skill must be created), a device-level Gemini Live audio run, and a rendered dashboard with alert delivery Since 2026-10-18 (owner's report: Gemini Live said it could not update a family preference), telling WonderHome what someone likes is available by voice: `family_facts` capability, Gemini tool `remember_family_fact`, `set_preference` needs no voice scope (kept as learned, correctable in HomeBrain Review); eval voice gate 18/18 tool sentences |
| 18 | P0 | 04-018 | HomeTalk follows you across screens | Done | The owner's ask, 2026-10-18 (PR #225): "take me to the grocery list", add or remove things there, move on, come back. A live conversation now lives at the app's root (`components/ui/live-talk.tsx`, `LiveTalkProvider`), so changing screens no longer ends it. Intent `open_screen` (`conversation/screens.ts`, a fixed list of screens a model and the rules pick from by key, never a path) read by the rules and the model; the reply carries `navigate` (a same-app path, through `hometalk/contract.ts` and the Gemini tool result) and is followed on any screen. A screen this person is never offered is not opened; Alexa says there is no screen. A glowing bar above the tab bar on every other screen shows listening/thinking/speaking with pause, end and the way back, and pages reserve room for it (`--wh-live-bar-clearance`). Gemini Live tool `open_screen`. Golden HT-84 to HT-87; eval voice gate 23/23. Browser-checked at 360px and desktop with a scripted recogniser: Groceries → added bananas there → Calendar → back to HomeTalk |
| 19 | P0 | 04-019 | Voice in the app is HomeTalk; getaways and likes answered from the record | Done | The owner's reports, 2026-10-18 (PR #228). Gemini Live inside HomeTalk said "I can't do that from this voice assistant, use the WonderHome app": the in-app channel now carries `inApp` limits (`channelAllowsAction`, `channelRefusal` in `voicelink/scopes.ts`), its refusal names HomeTalk and the on-screen OK, and Gemini's instructions say it is HomeTalk's own voice inside WonderHome and never to send the person to "the app". A place question is answered by Gemini Live where the household lets location reach Google (capability `places` is `consent` for Gemini, still `app_only` for Alexa). "Can you suggest a two-day vacation plan?" is a HomePlaces getaway (`purpose: "getaway"`, `when: trip`): tourist attractions within a few hours' drive of home, the search kept to that area (`within`, `includedType`), day-trip distances left out, no opening hours checked; real check from Pune gave Mahabaleshwar, Naneghat and the Wai hills. "What does Upasana like in food?" is answered by rules from every record about her — what HomeTalk was told (`memories`) and the Meals screen's preferences — in `conversation/likes.ts`, after the model said "no records" minutes after "Remembered". Golden HT-88. The cause behind the forgetting is a design limit, written up as `design/HOMEBRAIN-3.0-HOUSEHOLD-CONTEXT.md` for the owner. 2026-10-19 (owner's report, by Gemini Live: "what do you know about the preferences in food and family?" answered "I don't have information" while Review held fourteen): the turn never reached the gateway — Gemini read "what do *you* know" as its own empty memory. Now a family-wide likes question ("what does the family like?", "who likes what?", "what do you know about … preferences") is read and answered by rules from every record, person by person (`composeFamilyLikes`), Gemini gets `get_family_preferences` and an instruction that such a question is WonderHome's record, never its own; goldens HT-112/113, voice gate 25/25 (`docs/progress/2026-10-19-family-likes-and-gemini-record.md`) |
| 20 | P0 | 04-020 | HomeTalk floats over other apps | Done | The owner's ask, 2026-10-18 (PR #229): use other apps on the phone while talking to HomeTalk, with WonderHome as a picture-in-picture window and the voice still going. A web app cannot float itself, but a phone floats a video: the live session is painted onto a canvas (`components/ui/live-float.ts` — the orb, listening/thinking/speaking/paused, the last thing heard and said, in the theme's own tokens, text shrinking before it is cut), streamed as a video and floated by the browser (`LiveTalkProvider`'s `float`/`unfloat`: `requestPictureInPicture`, or Safari's presentation mode). The engines never move; the window is a view of the one session at the app's root. Float sits beside End in the composer and on the live bar, only where the browser can do it; the phone's media controls pause, resume and end the same session; a recogniser that lapses in the background relistens after a breath and on return. Help: Voice ¶8 in eight languages. `live-float.test.ts` 17. Browser-checked at 360px and 1280px: headless Chromium really entered picture-in-picture (video 480×360), the frame showed the exchange, Groceries opened while floating, End closed the window. The microphone behind another app on a real phone is the owner's check |
| 21 | P0 | 04-021 | Wait to speak until HomeTalk can hear | Done | The owner's report, 2026-10-18 (PR #230): Gemini Live takes a few seconds to open its session and only then listens, but the composer looked ready the moment it was tapped, so people spoke into nothing. A live session now has its own `connecting` state, kept apart from thinking and listening, in `LiveTalkProvider`, the live bar and the floating window. The composer shows "Getting ready… don't speak yet" in amber with a turning ring and "{who} is connecting. Start speaking when it says it's listening." (assertive live region), then "Ready — speak now" in green for three seconds, then the usual "… is listening". WonderHome's own voice does the same on a session's first listen, until the recogniser says it has started (`onstart`) or the microphone is recording (`captureUtterance`'s `onReady`), with a 2.5 s fallback. Labels in eight languages; help Voice ¶2. Browser-checked at 360px and 1280px with a recogniser that takes 2 s to start: 0.5 s "Getting ready", 2.5 s "Ready — speak now", 6 s "HomeTalk is listening…", no errors |
| 22 | P0 | 04-022 | HomeTalk floats on its own when you leave the app | Done | The owner's ask, 2026-10-18 (PR #232): switching to another app in the middle of a live conversation should float HomeTalk without anyone remembering Float. While a live conversation runs and isn't paused (`shouldArmFloat`), the floating window's hidden video is armed and playing with `autopictureinpicture`, so Safari floats it as the page goes to the background, Chrome floats it through the media session's `enterpictureinpicture` action, and a `visibilitychange` to hidden asks once more, quietly (no notice if the browser refuses). Closing the window keeps it armed; ending the conversation tears it down. Float stays as the manual way. Help Voice ¶8 in eight languages. Browser-checked at 360px and 1280px: armed before any tap, leaving the page floated it with no notice, Float/Bring back/End unchanged, no errors |
| 23 | P0 | 04-023 | The chat shows what was really said in Gemini Live | Done | The owner's report, 2026-10-18 (PR #234): Gemini heard them clearly and answered well, but the chat line had different, misspelt words. The line came from the Live API's `inputTranscription`, a light side transcriber that guesses the language unaided; the conversation model's own understanding is never exposed as text, and the documented transcription hints (`languageCodes`, `customVocabulary`) are for Google's separate transcribe model, so they were not put into the locked session. Now the page keeps each turn's microphone audio (the same audio already sent; at most a minute) and, once the person's line is shown, `POST /voice/gemini/transcribe` writes it down word for word with a full Gemini model (`voicelink/live-transcribe.ts`), told the member's listening language and the household's names; the chat line, and the floating window, are replaced with it. Same gate as the session (flag, plan, Google key, data-use agreement), its own rate limit (`voice.transcribe`), nothing stored; on any failure Gemini's line stands. Help Voice ¶2 in eight languages. Checked: unit tests for the WAV header, vocabulary, instruction and cleaning; the route refuses without Gemini voice (403), a bad body (400) and signed out (401). A real Gemini Live run needs the owner's phone |
| 24 | P1 | 04-024 | Gemini's voice plays through the floating window, so leaving the app floats it | Done | The owner's yes, 2026-10-18 (PR #237): Chrome floats on its own only media that is audibly playing, and the armed window was a silent picture, so it never floated by itself. Gemini's voice now passes through one node (`use-gemini-live.tsx`, `voiceStream`/`releaseVoice`) that plays into the armed video's stream instead of the speaker (`live-talk.tsx`, `attachVoice`), heard once either way; where sound may not play, the video stays muted and the voice returns to the speaker. Checked in Chromium: an audio track added to the playing picture after a tap plays unmuted. A real-phone check of the automatic float is the owner's |
| 25 | P1 | 04-025 | Leaving the app floats Gemini's voice on a real phone | Not Started | The owner, 2026-10-19, after 04-024: "doesnt work yet". On their phone, switching apps during Gemini Live still does not float the window on its own (Chromium in the cloud plays the voice through the armed video, but a real phone's automatic picture-in-picture needs checking: Chrome's auto-PiP rules for installed PWAs, the media session, and whether the voice track is audible to the browser's heuristic). Needs a real Android phone to diagnose |
| 26 | P0 | 04-026 | A child's or helper's request goes to an adult for the final OK | Done | The owner, 2026-10-20: "such queries are fine but results should go to adult for final approval before adding to WonderHome db". HomeTalk still understands and previews a child's or helper's request, but it never writes on its own whatever the outcome's autonomy (`proposal.ts`), and their Confirm reads "Ask a grown-up". That sends the exact proposal (its fingerprint) to their guardian, else an Admin (`conversation/referral.ts`, the existing `approvals` table, one notification). The adult answers under "Asking for your OK" on Notifications: Approve carries it out through the same executor on their session (`answerReferral`), Decline leaves it; a changed or lapsed proposal (48 h) is refused. Only a guardian of the requester or an Admin may answer, checked on the server. The requester is told in their own conversation. Test in `consent.test.ts`; help ¶15 of Talk to WonderHome in all eight languages |
| 27 | P0 | 04-027 | After a change, HomeTalk opens the screen that shows it | Done | The owner, 2026-10-20 ("Add tomato to the grocery list" should land on Groceries with tomato on it). An executed action's reply links to its screen; `navigation/app-path.ts`'s `screenShowing` takes the first WonderHome link from it and the turn sends it as `navigate`, typed or spoken, in the app only (never Alexa). The browser goes there, or refreshes in place when it is already there. `appPath` is now the one path check for the server, the contract and the browser, and allows a plain query (`/groceries?view=to-buy`). Browser-checked: typed on /ai, it landed on Groceries → To buy with Tomato listed. |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
Implement Conversation, Voice & Text as a first-class WonderHome domain. The module must expose API-backed capabilities to the web client and governed AI tools.

## Epic Map

- **Epic 04-E01 — Conversation Understanding & Safe Actions:** stories 04-001 through 04-004.
- **Epic 04-E05 — Voice & Text Experience:** stories 04-005 through 04-006.
- **Epic 04-E07 — Memory & Conversational Configuration:** stories 04-007 through 04-008.
- **Epic 04-E12 — Voice Channels (voice integration, `design/voice-integration/`):** stories 04-012 through 04-023.

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

### Story 04-023 — The chat shows what was really said in Gemini Live
**Epic:** Voice Channels
**Priority:** P0
**Goal:** What the chat writes for a person's spoken turn is what they said, spelt right, not the Live API's side transcriber's guess.

### Story 04-022 — HomeTalk floats on its own when you leave the app
**Epic:** Voice Channels
**Priority:** P0
**Goal:** Switching to another app in the middle of a live conversation floats HomeTalk without anyone tapping Float.

**Acceptance criteria**
- While a live conversation runs and isn't paused, leaving WonderHome opens the floating window where the phone allows it (Safari's automatic picture-in-picture, Chrome's media-session request, one quiet request when the page is hidden).
- A refusal on the way out shows no notice; the conversation carries on and Float still works.
- Pausing or ending the conversation stops the automatic float; ending closes the window.

**Definition of Done**
- Relevant unit tests pass (`components/ui/live-float.test.ts`, `shouldArmFloat`).
- Browser-checked at 360px and desktop.

### Story 04-021 — Wait to speak until HomeTalk can hear
**Epic:** Voice Channels
**Priority:** P0
**Goal:** A person never speaks into a live conversation that cannot hear yet: until it can, the screen says to wait, and the moment it can, it says to speak.

### Story 04-020 — HomeTalk floats over other apps
**Epic:** Voice Channels
**Priority:** P0
**Goal:** While a live conversation runs, a person can shrink HomeTalk to a small window that stays over the other apps on their phone, with HomeTalk still listening and answering out loud.

**Acceptance criteria**
- During a live conversation, Float (beside End in the composer, and on the live bar) opens the phone's picture-in-picture window showing HomeTalk's orb, what it is doing, the last thing heard and the last thing said. The conversation keeps running from the page underneath, through the same engine and the same gates; the window is a view of it, never a second session.
- The phone's media controls — the floating window's own pause, the lock screen — pause, resume and end that same session. Closing the window never ends the conversation; ending the conversation closes the window.
- Float is shown only where the browser can float a window. Where it refuses to open one, the composer says so and the conversation carries on.
- The window is painted in the theme's own tokens and the composer's own words, in the viewer's language. Nothing is recorded beyond the conversation itself.

**Definition of Done**
- UI behavior implemented, including the unsupported and failed states.
- Relevant unit tests pass (`components/ui/live-float.test.ts`).
- Help content updated in every language.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

### Story 04-019 — Voice in the app is HomeTalk; getaways and likes answered from the record
**Epic:** Voice Channels
**Priority:** P0
**Goal:** Gemini Live inside HomeTalk never sends a person to "the app" they are in, answers a getaway question with real places, and a question about what someone likes is answered from what the household told WonderHome.

### Story 04-018 — HomeTalk follows you across screens
**Epic:** Voice Channels
**Priority:** P0
**Goal:** While talking to HomeTalk, a person can ask it to open a screen, work there by voice, move between screens and come back, and the conversation never stops because the screen changed.

**Acceptance criteria**
- "Take me to the grocery list", "open the calendar", "go back to HomeTalk" open that screen, typed or spoken, through Gemini Live too. A question about a screen ("what's on the grocery list?") is still answered, not opened.
- The live conversation carries on across screens; on every screen but HomeTalk's a bar shows it is listening, thinking or speaking, with pause, end and the way back, and nothing on the page is left under it.
- Only screens the person is offered are opened; a path is never taken from what anyone or any model said; a speaker with no screen says so.
- A recap is still written when the session ends, wherever it ends.

**Definition of Done**
- Domain behavior implemented and integrated with existing architecture.
- UI behavior implemented where applicable, including loading/empty/error/unauthorized states.
- Relevant unit/integration/E2E tests pass.
- Story is marked `Done` in this file and `tracking/PROGRESS.md` only after evidence exists.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.