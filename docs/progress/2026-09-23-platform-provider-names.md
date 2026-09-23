# The platform AI key reaches the provider it belongs to

**Date:** 2026-09-23 · **Area:** AI provider configuration · **Code:** `packages/core/src/ai/model-key.ts`

## What was wrong

After HomeTalk 2.0 merged, no model turn made in production on WonderHome's
own key reached a model. The runtime log said, every time:

    [conversation] model provider failed { provider: 'anthropic', error: 'Error', status: 401 }

The platform key (`WONDERHOME_AI_KEY`) is a **Gemini** key. `platformKey()`
only recognised the exact names `anthropic`, `google` and `openai` in
`WONDERHOME_AI_PROVIDER`, and quietly read anything else as `anthropic`.

A provider named the way anyone holding a Gemini key would write it, for
example `gemini`, therefore sent the Google key to Anthropic. Anthropic
refused it with a 401, so every household without a key of its own fell back
to "I could not reach my model".

The one household that has its own Google key was unaffected. Its provider
comes from the settings screen's picker, not from this variable.

It was not the Part 3 schema: a 401 is a refused key, before the request is
read.

## What changed

`platformKey()` now reads the provider in this order:
1. **A name an operator actually writes**, case- and space-insensitively:
   - `anthropic` or `claude` → Anthropic;
   - `google`, `gemini` or `google gemini` → Google;
   - `openai`, `gpt` or `chatgpt` → OpenAI.
2. **Otherwise, the key's own documented prefix**:
   - `sk-ant-` → Anthropic;
   - `AIza` → Google;
   - `sk-` → OpenAI.
3. **Otherwise, Anthropic**, as before.

A recognised name still wins over the prefix. `.env.example` lists the
accepted names.

## Verified

- `model-key.test.ts`: 13 tests, 2 of them new, covering the aliases, the
  prefix fallback, and a recognised name winning over the prefix.
- `npm run typecheck`, `npm run lint`, `npm run lint:secrets` and the full
  unit suite (2161 tests) passed. CI runs the database and e2e suites.
- **In production after merge:** see "Production check" below.

## Production check

Pending the deploy of this change.
