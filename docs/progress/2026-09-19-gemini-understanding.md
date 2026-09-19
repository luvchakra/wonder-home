# Google Gemini behind the same `understand` seam

**Date:** 2026-09-19
**Scope:** `packages/core/src/ai/model-client.ts`, `apps/web/app/api/v1/households/[householdId]/conversation/route.ts`
**Status:** Done — key-ready, not yet exercised live

## What this is

The Anthropic Claude integration (previous note,
`2026-09-19-real-llm-understanding.md`) left one line in its own "still
open" section: *"Google/OpenAI clients — `resolveModelKey` and the routing
gate already treat all three providers uniformly; only Anthropic has a real
`createClaudeUnderstanding`-equivalent today."* This closes that line for
Google. `design/PRODUCT-DIRECTION-v4-talk-to-wonderhome.md` names Google
Gemini as the first of the two configurable alternatives to Anthropic
("Primary: Anthropic Claude. Alternatives: Google Gemini, OpenAI"), so it is
next.

Nothing about the seam, the privacy gate, or the security boundary changed.
`ai/model-key.ts`'s `ModelProvider` already included `"google"`;
`routeToProvider` and `minimiseContext` were already provider-agnostic; the
route's `decideProviderRouting` already resolved a household or platform key
for Google and simply had nowhere real to send it. This is that destination.

## What was built

`packages/core/src/ai/model-client.ts` gained a second `Understanding`,
built on the same pure pieces the Anthropic one already used:

- `createGeminiUnderstanding(apiKey)`, backed by `@google/genai`'s
  `ai.models.generateContent`, with `config.systemInstruction` set to the
  same `SYSTEM_PROMPT` both providers share, and
  `config.responseMimeType: "application/json"` +
  `config.responseJsonSchema` requesting schema-guided output — the closest
  Gemini has to Anthropic's `zodOutputFormat`. There is no Zod-native helper
  for Gemini's schema, so `INTENT_JSON_SCHEMA` is a hand-written JSON Schema
  literal covering the same shape as `IntentOutputSchema` (`action`,
  `target.kind`/`reference`, `parameters`, `confidence`), deliberately using
  only the keyword subset Gemini's own documentation lists as supported
  (`type`, `enum`, `properties`, `required`, `minimum`, `maximum`) rather
  than deriving it with `z.toJSONSchema`, which emits keywords outside that
  subset for this schema (`$schema` at the top level, `propertyNames` for
  the `parameters` record) that Gemini does not document support for.
- Unlike Anthropic's SDK, Gemini's structured-output path still returns text
  (`response.text`) rather than a pre-validated object: the response is
  `JSON.parse`d and then validated against the same `IntentOutputSchema`
  Anthropic uses, inside the same `try`/`catch` — a schema mismatch is a
  parse failure like any other, and resolves to the same `unknown` intent a
  fixture miss or a network failure already produces.
- Every property the Anthropic implementation's doc comment already claims
  holds unchanged: the model gets `SYSTEM_PROMPT` and the bare utterance
  only (no household name, roster, or schedule); it has no field to set
  `actorMemberId`, which still comes only from the caller's authenticated
  session; and `intentFromModelOutput` — the one pure mapping function — is
  reused as-is, not duplicated, so both providers produce an intent through
  exactly the same code once a value comes back.
- `GEMINI_MODEL` reads the same `WONDERHOME_AI_MODEL` override the Anthropic
  path reads (a deployment configures one active provider via
  `WONDERHOME_AI_PROVIDER`, so one model-override variable naming whichever
  provider is active is consistent with how `platformKey()` already works),
  defaulting to `"gemini-flash-latest"` when unset.

The route: `decideProviderRouting` gained a `decision.provider === "google"`
branch parallel to the existing Anthropic one, with its own honest
disclosure string ("What you said was sent to Google Gemini..."). Every
other outcome — no provider, policy forbids it, OpenAI (still no client) —
still falls back to the deterministic rules exactly as before.

`packages/core/package.json` gained `@google/genai` (`^2.23.0`), the
official Google GenAI SDK for TypeScript/Node, installed the same way
`@anthropic-ai/sdk` was for the Claude work — no other SDK or HTTP client
was considered.

## What was verified — and what could not be

- `npm run typecheck`, `lint`, `lint:boundaries`, `lint:secrets`,
  `npm run security` (9/9) — clean
- `npm run test` — 1031 unit tests passing, unchanged from before this
  change: no new pure logic was introduced (the new JSON Schema is a static
  literal, and the mapping it feeds is the already-tested
  `intentFromModelOutput`), matching this codebase's own convention that a
  network-calling wrapper is verified by typecheck and build, not new tests
  for a schema constant with no branches.
- `npm run build` — succeeds; `@google/genai` is only imported from the same
  server-side file the Anthropic SDK already was, confirmed by the
  import-boundary lint passing unchanged
- `npx playwright test --project=desktop` — 126/126 unaffected

**Not verified: an actual live call.** As with the Anthropic work, no
`GEMINI_API_KEY`-equivalent exists in this session, and none was invented —
consistent with `CLAUDE.md`'s "Never invent credentials or claim a live
integration." The `responseJsonSchema` keyword subset, the `config` field
names, and the `response.text` accessor were all confirmed against the
installed `@google/genai@2.23.0` package's own `.d.ts` files (not recalled
from training or trusted from an incomplete first documentation fetch) —
but whether Gemini in fact returns a well-formed intent for a real household
utterance is unverified until a key is configured in a real deployment.
Until then, a household with a Google-provider key still gets a real call
attempted, and any failure of that call — including a key that turns out to
be invalid — falls back to the same deterministic fixture behaviour a
no-key household already had, so nothing regresses in the no-key or
bad-key case, which is still the tested case.

## What is explicitly still open

- **OpenAI** — the last of the three `ModelProvider`s in v4's own list still
  has no real client; `resolveModelKey` and the routing gate already treat
  it uniformly with the other two, same as they did for Google before this
  change. (Update: closed the same day — see
  `2026-09-19-openai-understanding.md`.)
- Everything the Anthropic note's "still open" section already listed and
  did not name a provider (entity resolution against real household data,
  real household mutations behind the intent, cross-domain orchestration,
  voice capture) is unchanged by this — those are seam-independent.

## Where

`packages/core/src/ai/model-client.ts`, `model-client.test.ts` (doc comment
only — no new pure logic to test),
`apps/web/app/api/v1/households/[householdId]/conversation/route.ts`,
`packages/core/package.json`.
