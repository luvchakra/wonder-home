# The platform AI key reaches the provider it belongs to, and one bad model field no longer discards a turn

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

## Production check, after #124

This ran on a fresh QA household on home.wonderapps.biz, deployment
`f5d14f4`. **Gemini answered.** In the database, each of these turns has
`understanding: "model"` and `understandingFailure: null`:

| Said | Result |
|---|---|
| "could you pop some coriander and a couple of lemons onto our shopping" | Coriander and Lemons were added. |
| "Sunita won't make it in on the day after tomorrow" | "Record that Sunita is away on Fri 25 Sep", waiting for a yes. Today is Wed 23. |
| "what's on the shopping list?" | HomeBrain answered from the facts; validation passed on the first attempt. |
| "yes", then "not lemons, limes" | Sunita's absence was recorded. Lemons were retired, limes added, coriander kept. |

**One real defect showed up.** "The little one is off sick tomorrow" and
"remind me to pick up some coriander on the way home this evening" were both
stored as `understandingFailure: "unparseable"`. Gemini answered, but its
JSON failed our schema check, and the whole understanding was thrown away.
The household saw "I could not reach my model".

The exact failing field was never logged. Values are deliberately not
logged, and until now the reasons were not logged either.

## Second fix: a bad detail costs that detail, not the turn

`ai/model-client.ts` now reads every provider's answer through
`readIntentOutput`, which runs `tidyIntentOutput` before the schema check.
Each detail is repaired on its own:
- **Becomes `null` ("not stated"):**
  - an empty or blank string;
  - a phrase over its length limit;
  - a `slot` or `timesPer` outside its fixed set (a slot is read in any
    case);
  - a number or flag of the wrong type.
- **Trimmed:** a list loses its blank entries.
- **Clamped:** a confidence is kept within 0–1.
- **Dropped:** keys the schema does not name, ids included.

Nothing is truncated or guessed. Grounding asks for a missing detail when it
matters. The action, the target's kind and the confidence are still checked
strictly, so an answer that is wrong where it counts is still refused.

Other changes:
- **Claude and OpenAI** now send the same structured-output schema, but
  their replies go through the same repair instead of the SDKs' parse
  helpers. Before, a length rule they carry only as a description would
  have thrown there, and been logged as a *provider* failure.
- **Gemini's schema** now carries the `slot` and `timesPer` enums.
- **Logging:** an answer that still cannot be read logs
  `[conversation] model output unparseable` with the paths and codes of what
  was wrong. It never logs the values.

**Verified:**
- `model-client.test.ts`: 6 new tests covering:
  - blanks, enums, long phrases and list entries;
  - wrong-typed numbers;
  - the strict fields still being refused;
  - confidence clamping;
  - ids never surviving.
- Typecheck, lint and the secret scan passed.
- 2167 unit tests passed.
- The production re-check after merge is recorded below.
