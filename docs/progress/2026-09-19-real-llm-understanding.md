# A real model behind the conversation engine (product-direction v4, Priority A)

**Date:** 2026-09-19
**Scope:** `packages/core/src/ai/model-client.ts`, `conversation/engine.ts`, `apps/web/app/api/v1/households/[householdId]/conversation/route.ts`
**Status:** Done — key-ready, not yet exercised live

## What this is

A new product-direction document (`design/PRODUCT-DIRECTION-v4-talk-to-wonderhome.md`,
supplied this session and now checked in as an authoritative reading item in
`CLAUDE.md`) reprioritizes the project: real LLM reasoning behind the
conversation engine, and "Talk to WonderHome" as a P0 primary control
surface, ahead of chasing remaining backlog-story coverage. Its own words:
"do not blindly chase 170/170… Priority A — make the brain real."

Investigated first, per that document's own execution contract ("do not
duplicate architecture"). Two findings shaped everything below:

1. **No LLM was wired up anywhere.** No `@anthropic-ai/sdk`, no `ai` /
   `@ai-sdk/*` package, no `generateText`/`messages.create` call. The
   "conversation engine" was — and, for households without a configured
   provider, still is — deterministic pattern matching
   (`conversation/fixtures.ts`).
2. **The architecture already expected this exact moment.** `engine.ts`'s
   own docstring: *"Understanding is deterministic today —
   `resolveFixtureIntent` — because no language-model provider is configured
   with credentials… The seam is `understand`: a live provider slots in there
   and nothing downstream changes, because nothing downstream ever trusted
   the model with a decision."* `ai/model-key.ts` already had the
   household-key/platform-key/none precedence built. `ai/credentials.ts`
   already had `readHouseholdKey`. `ai/privacy.ts`'s `routeToProvider` /
   `minimiseContext` — the consent and minimisation gate — was already built
   and already ran on every turn, years (in product time) before a client
   existed to send anything to. The route's own comment even named the one
   rule this had to keep: *"Saying 'sent' here would be the one lie this
   product must never tell."*

So this was not a green-field integration. It was filling in the one seam
everything else was already built to receive.

## What was built

`packages/core/src/ai/model-client.ts`:

- `createClaudeUnderstanding(apiKey)` returns an `Understanding` (the exact
  function type `engine.ts` already declared) backed by
  `client.messages.parse` with a Zod-typed `output_config.format`
  (`@anthropic-ai/sdk`'s structured-output path) — never hand-parsed JSON.
- The model produces `{action, target, parameters, confidence}` only. It
  never sees or sets `actorMemberId` — that always comes from the caller's
  authenticated session. This is the load-bearing security property: even a
  fully successful prompt injection inside a household's own message can, at
  worst, produce a *confidently wrong intent* naming the real actor as the
  one asking — and every existing gate (`authorizeToolCall`, entitlements,
  autonomy, the consequential-confidence threshold) still runs on that
  intent exactly as it runs on a fixture-resolved one. The model was never
  in a position to grant itself or anyone else authority; this change did
  not alter that boundary, only what feeds it.
- Any failure (auth, rate limit, network, an unparseable response) resolves
  to the same `unknown`-intent shape a fixture miss already produces — never
  thrown into the turn. `intentFromModelOutput` (the pure mapping) is unit
  tested directly; the network call itself is not, matching this codebase's
  existing convention for `SupabaseClient`-composing functions
  (`previewPlanChange`, `usageSummary`) — verified by typecheck and build,
  not a mocked network boundary.
- Context sent is exactly what was already being minimised for this purpose
  before any client existed: the utterance, nothing else. No household name,
  no member roster, no schedule. Broader entity resolution (resolving "mom"
  or "Riya" against real household data) is v4's own §53 and is explicitly
  future work, not silently dropped.

`conversation/engine.ts`: `Understanding` may now return `Promise<HouseholdIntent>`,
and `converse` is `async`. Every existing caller and test updated
(`await converse(...)`); added one new case proving the seam actually awaits
a promise-returning `understand`, not just a synchronous one.

The conversation route: `decideProviderRouting` now reads the household's
real key (`readHouseholdKey`, not the placeholder `"set"` it used to pass
through) and, when the resolved provider is Anthropic and a key is present,
constructs the real `Understanding` and passes it to `converse`. Every other
outcome — no provider, policy forbids it, a non-Anthropic provider (no
client exists for Google/OpenAI yet) — falls back to the deterministic rules
exactly as before, with an honest `code` describing which.

## What was verified — and what could not be

- `npm run typecheck`, `lint`, `lint:boundaries`, `lint:secrets`,
  `npm run security` (9/9) — clean
- `npm run test` — 1031 unit tests passing (was 1026; +5: 4 new in
  `model-client.test.ts`, 1 new async-seam case in `engine.test.ts`)
- `npm run build` — succeeds; the SDK is only imported from server-side
  files, confirmed by the import-boundary lint passing unchanged
- `npx playwright test --project=desktop` — 126/126 unaffected

**Not verified: an actual live call.** Per this session's own environment,
no Anthropic API key exists to exercise the real path end to end, and none
was invented — `WONDERHOME_AI_KEY` stays unset. The code is real and
type-checks against the actual SDK, but "does Claude in fact return a
sensible intent for a real household utterance" is unverified until a key
is configured in a real deployment. Until then, every household still gets
the same deterministic fixture behaviour they had before this change —
nothing regresses in the no-key case, which is still the tested case.

## What is explicitly still open (v4's own phasing)

This is P0.1's foundation only. Still open, in the document's own order:

- **P0.2 — real household mutations.** The intent this produces still flows
  through the same `proposeFromIntent`/governed-tool path the fixtures
  always used, which is thin for most domains today (groceries,
  responsibilities, etc. mostly "prepare" rather than actually mutate).
- **Entity resolution against real household data** (§53) — the model
  currently returns a bare reference token ("sunita", "groceries"), exactly
  as the fixtures did; resolving that against real members/bills/lists is
  unbuilt.
- **Voice** (P0.4) — the seam is channel-agnostic already (voice and text
  share the same `understand` call), so no separate work is needed here for
  parity, but voice capture/transcription itself is a different story.
- **Cross-domain orchestration, simulation mode, "why didn't WonderHome",
  undo, the household timeline** (P0.3, P0.5) — all still ahead.
- **Google/OpenAI clients** — `resolveModelKey` and the routing gate already
  treat all three providers uniformly; only Anthropic has a real
  `createClaudeUnderstanding`-equivalent today.

## Where

`packages/core/src/ai/model-client.ts`, `model-client.test.ts`,
`packages/core/src/conversation/engine.ts`, `engine.test.ts`,
`apps/web/app/api/v1/households/[householdId]/conversation/route.ts`,
`design/PRODUCT-DIRECTION-v4-talk-to-wonderhome.md` (new, checked in),
`CLAUDE.md` (mandatory-startup reading list updated).
