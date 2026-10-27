# HomeBrain 4.0 phase 3a: cached prompts, a streamed answer call, turn timings (14-027)

2026-10-27. Story 14-027 (P0), spec `design/HOMEBRAIN-4.0-DEEP-HOUSEHOLD-INTELLIGENCE.md` §3.4 and §3.6.

## Why

The queue's goal for phase 3 is a typed p95 of 2.5 s to the first token. Production says where the time goes now (the `timings` on HomeTalk replies, live project, 13 to 27 October 2026, warm production build on Vercel `bom1`):

| Turn | n | p50 total | p95 total | p50 understand | p50 answer call |
|---|---|---|---|---|---|
| Question the rules settle, model answer | 42 | 3.81 s | 6.60 s | 0.02 s | 3.77 s |
| Question the rules did not settle, model answer | 21 | 6.53 s | 10.19 s | 2.84 s | 3.56 s |
| Model answer regenerated once | 8 | 11.0–12.1 s | 15.4 s | — | 8.7–11.0 s |
| Deterministic answer, rules settled | 49 | 0.48 s | 6.44 s | 0.01 s | 0.42 s |

Two model calls in a row are most of it. Retrieval is not: `groundFacts` over 2,000 synthetic facts takes 12 ms warm (32 ms cold), and `findRelevantFacts` under 1 ms a question, inside the 20 ms §3.4 allows. So this PR builds no separate lexical index (it would cost the same scan per request, since household data is never cached across requests) and spends the change where the seconds are.

## What changed

- **Cached understanding prompt.** `systemBlocksFor` sends the fixed instructions (about 15.5 kB, roughly 4k tokens) as one system block marked `cache_control`, then the runtime moment (time, asker, what is waiting), which changes every minute, after it. Before, the moment was appended to the same string, so nothing was ever cached. Same words as `systemFor`, which Gemini and OpenAI still read; their caches are automatic and prefix-based.
- **Cached answer prompt.** The answer system prompt is a cached block, and the facts now come first in the user turn (`anthropicAnswerMessages`), cached, before the time, the asker, a previous draft's problems and the question. A regeneration, which repeats the same facts, reads them from the cache; the regeneration text now says "the facts above".
- **The answer call streams.** `createAnswerComposer("anthropic")` uses `messages.stream` with the same structured output, so the turn knows when the first token came. The draft is still read whole and validated by `homebrain/validate.ts` before anybody sees it; nothing unvalidated reaches a person. `AnswerInput.onFirstToken` and `onUsage` report a time and token counts, never text.
- **Timings.** Each HomeTalk reply's `metadata.timings` adds `store` (when the household's facts were in hand), `retrieve` (choosing the facts), `firstToken` (the answer's first model token, from the start of the turn) and `tokens` (`input`, `cacheRead`, `cacheWrite`, `output`, summed over drafts). Numbers only.

Code: `packages/core/src/ai/model-client.ts`, `packages/core/src/homebrain/turn.ts`, `apps/web/app/_lib/hometalk-turn.ts`. Rule added to `docs/agent-platform.md`: never put a per-turn value ahead of a cached block.

## Verified

- Unit tests: `ai/`, `homebrain/`, `evaluation/`, `conversation/` — 74 files, 1,521 tests pass, including new ones for the cached blocks, the facts-first order, the regeneration reusing the cached block, and the timings and summed usage on a regenerated answer.
- Typecheck (core and web), ESLint on the changed web file, `npm run build -w apps/web`.
- Deterministic eval: 208/208, Unsafe Action Rate 0/26, every release gate passes.
- No live provider run: this container has no provider key (variable names checked only). The "after" numbers come from production `timings` once the deploy has served turns; read them with the query below and add them here.

```sql
select (metadata->'timings'->>'quick') quick, count(*),
  percentile_cont(0.5) within group (order by (metadata->'timings'->>'firstToken')::int) p50_first_token,
  percentile_cont(0.95) within group (order by (metadata->'timings'->>'firstToken')::int) p95_first_token,
  avg((metadata->'timings'->'tokens'->>'cacheRead')::int) avg_cache_read
from public.conversation_messages
where role = 'assistant' and metadata->'timings' ? 'firstToken' and created_at > now() - interval '7 days'
group by 1;
```

## Open

- **14-056** (P0): one structured call returning answer, clarify, not on record or an action intent, so a question the rules cannot settle no longer waits 2.8 s on understanding first.
- **14-057** (P0): the reply streamed to the person, each sentence shown only after validation against the draft's `usedFacts`; this is what reaches 2.5 s p95 to the first visible token. Needs 14-056.
- Test data: none was created.
