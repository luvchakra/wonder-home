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

## Production re-check after #125, and a third fix

Re-run on deployment `112687b`. **No turn was unparseable**, and there was
no `model output unparseable` log line.

| Said | Result |
|---|---|
| "the little one is off sick tomorrow" | "I think you mean Manan (you said "the little one") — if not, say who." Then "record that Manan is away tomorrow (Thu 24 Sep)", waiting for a yes. This is the §20 medium-confidence line on a real model. |
| "we're running low on atta, better grab some" | Atta was added. |
| "Asmi's got a dentist visit next Thursday" | Understood as `record_health_appointment`, then refused as "not part of your current plan". That is correct for the QA household's free plan. |
| "remind me to pick up some coriander on the way home this evening" | Understood as `set_reminder`, but it asked "When should I remind you?". |

**What the reminder showed.** The model's parameters carried no day at all.
They did carry placeholders: `symptom: "none"`, `asset: "coriander"` and
`timesPer: "day"`. The deterministic rules read the same sentence as
`set_reminder` with `when: "this evening"`. They were never consulted,
because they only step in when the model says `unknown`.

**Third fix:**
- `conversation/engine.ts`: when a model's understanding and the rules
  agree on the action, the rules fill **only the parameters the model left
  unsaid**. Nothing the model said is overwritten. When the two read
  different actions, nothing is added.
- `tidyIntentOutput` now also treats placeholder words as "not stated":
  "none", "N/A", "unknown", "not specified" and the like.
- The prompt now asks for unstated parameters to be null, never "none",
  false or a guess. It also asks for a reminder's part of the day to stay
  in `when`, exactly as said.

**Verified:**
- 4 new tests: 2 in `engine.test.ts` (fill-only-gaps, never overwrite or
  cross actions) and 2 in `model-client.test.ts` (placeholders, prompt
  lines).
- Typecheck, lint and the secret scan passed.
- 2171 unit tests passed.

## Production deploy of #126 is waiting on Vercel's daily limit

#126 merged as `608f38b`, but no production deployment was ever created for
it. Triggering a redeploy by hand was refused:

    402 payment_required: "Resource is limited - try again in 24 hours
    (more than 100, code: "api-deployments-free-per-day")"

The project is on Vercel's free plan, which allows 100 deployments a day.
Every push and pull request makes a preview as well as a production build,
so a busy day of small PRs uses the allowance up. The limit resets at
**2026-09-24 14:26 UTC**.

Until then production keeps serving `112687b`: #125 without #126. What that
means for a household:
- the key fix and the field repair are live;
- "remind me … this evening" still asks "when?".

**Needs doing after the reset:**
1. Redeploy production with the latest `main`: in Vercel, Redeploy, or any
   new merge to `main`.
2. Re-run the reminder with a fresh QA account.

A session check-in is scheduled for then. Upgrading the Vercel plan would
lift the limit, but that is a billing decision for the owner.

## Update, 2026-09-24: #126 is in production

After the quota reset, production was already serving a later `main`:
`0f47765` (#157), deployed automatically by that merge. Its history includes
`608f38b` (#126), so no manual redeploy was needed.

The live re-run of "remind me to pick up some coriander on the way home this
evening" against production was **not done**. This session was not permitted
to drive the production site with a test account.

A QA account (`d174973b-acd6-4abf-9d2f-f10b3cba96b9`) and household
(`8ca55abc-d6f5-4198-8aa0-92c46cbc3653`) were created for the check. Both
were deleted straight away, and nothing else was written.

**Still needs a person:**
1. Sign in to home.wonderapps.biz with any household that uses the platform
   (Gemini) key.
2. Say that sentence.
3. Check the answer: it should offer to remind you this evening, not ask
   "when?".

The unit tests that cover this case are in `ai/model-client.test.ts` and
`conversation/engine.test.ts`.

## QA cleanup

This session's QA data is all removed from the live project:
- **Household:** "Model QA Home" (`4d47c1de-f7c8-45f9-b0ac-7c12c2b3d8a9`)
  was deleted, with every row in it. Nothing was in Storage.
- **QA account:** `570355fb-4015-490c-a8d0-923ced397303` was deleted with
  `scripts/qa-test-user.mjs`.
- **Local:** the scratchpad scripts are gone, and no dev server is running.

**Confirmed:** a count over every `household_id` table in `public` and `wh`
finds 0 rows for that household, and the auth user no longer exists.
