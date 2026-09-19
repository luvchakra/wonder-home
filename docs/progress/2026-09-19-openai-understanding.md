# OpenAI, the third provider behind the same `understand` seam

**Date:** 2026-09-19
**Scope:** `packages/core/src/ai/model-client.ts`, `apps/web/app/api/v1/households/[householdId]/conversation/route.ts`
**Status:** Done — key-ready, not yet exercised live

## What this is

Closes the last line of the two prior notes' "still open" sections: OpenAI
was the one `ModelProvider` `resolveModelKey` and the routing gate already
treated uniformly without a real client behind it. `design/PRODUCT-DIRECTION-v4-talk-to-wonderhome.md`
names all three — Anthropic Claude (primary), Google Gemini and OpenAI
(alternatives) — and `CLAUDE.md`'s stack section says the same. All three
now have a real `Understanding`.

## What was built

`packages/core/src/ai/model-client.ts` gained `createOpenAIUnderstanding`,
built on the same `IntentOutputSchema`, `SYSTEM_PROMPT` and
`intentFromModelOutput` the Claude and Gemini implementations already share
— no new pure logic, no duplicated mapping.

Verified against the installed `openai@7.20.0` package's own type
definitions (`node_modules/openai/helpers/zod.d.ts`), not recalled from
training, matching the same discipline used for Anthropic and Gemini:
OpenAI's SDK has its own Zod-native structured-output helper —
`zodResponseFormat`, from `openai/helpers/zod` — passed as
`chat.completions.parse`'s `response_format`. This is the same quality bar
Anthropic's `zodOutputFormat` gives: the SDK returns an already
schema-validated `.parsed` value (`completion.choices[0]?.message.parsed`)
directly, not text that this code has to `JSON.parse` and validate itself
the way the Gemini path must (Gemini has no equivalent helper — see the
prior note).

`OPENAI_MODEL` follows the same `WONDERHOME_AI_MODEL`-override, sensible
default pattern as `CLAUDE_MODEL` and `GEMINI_MODEL`, defaulting to
`"gpt-5.6"` (confirmed as a real, current model string in the installed
SDK's own type definitions, not guessed).

Every security property already established for Claude and Gemini holds
unchanged: the model gets `SYSTEM_PROMPT` and the bare utterance only; it
has no field to set `actorMemberId`; any failure — auth, rate limit,
network, a response that fails schema validation — resolves to the same
`unknown` intent a fixture miss already produces, never thrown into the
turn.

The route: `decideProviderRouting` gained a `decision.provider === "openai"`
branch parallel to the Anthropic and Google ones, with its own disclosure
string ("What you said was sent to OpenAI..."). All three `ModelProvider`s
now resolve to a real client; the function's final fallback return is
unreachable in practice today (it exists only for a decision naming a
provider without a resolved key, which `routeToProvider` does not produce)
but is left in place rather than removed, since a fourth provider name
reaching `resolveModelKey` without a matching branch here should still fail
safe to the deterministic rules rather than throw.

`packages/core/package.json` gained `openai` (`^7.20.0`), installed the same
way `@anthropic-ai/sdk` and `@google/genai` were.

## What was verified — and what could not be

- `npm run typecheck`, `lint`, `lint:boundaries`, `lint:secrets`,
  `npm run security` (9/9) — clean
- `npm run test` — 1031 unit tests passing, unchanged: no new pure logic
  (the OpenAI path reuses `intentFromModelOutput` as-is)
- `npm run build` — succeeds; `openai` is only imported from the same
  server-side file the other two SDKs already were
- `npx playwright test --project=desktop` — 126/126 unaffected

**Not verified: an actual live call.** No `OPENAI_API_KEY`-equivalent exists
in this session, and none was invented, per `CLAUDE.md`'s "never invent
credentials or claim a live integration." A household or the platform with
an OpenAI key configured will now have a real call attempted; any failure of
that call falls back to the same deterministic behaviour a no-key household
already had.

## What is explicitly still open

All three configurable providers now have a real client. What is still open
is unchanged from the prior two notes and is provider-independent: entity
resolution against real household data, real household mutations behind the
intent, cross-domain orchestration, voice capture. None of those depend on
which provider answers `understand`.

## Where

`packages/core/src/ai/model-client.ts`, `model-client.test.ts` (doc comment
only), `apps/web/app/api/v1/households/[householdId]/conversation/route.ts`,
`packages/core/package.json`.
