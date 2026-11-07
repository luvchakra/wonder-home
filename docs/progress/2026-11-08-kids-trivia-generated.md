# Kids Trivia, PR 2: generated cards per topic (story 08-035)

Follow-up of 08-034 (#531), the owner 2026-11-07: "generate batches per topic in the background … age-aware, short … validate every item before storing … store a small pool per topic and refill when low; cache per topic+age band across households only if it contains no household data … rate-limit and cap cost per household; fall back to a small built-in curated pool … never show model output that failed validation."

## What was built
- **Pool, queue, cap** (`20261108013000_child_trivia_pool.sql`): `trivia_pool` holds cards per topic key, age band and language — platform data made from a topic word and an age band only, readable by any signed-in member, written only by the server; a quiz must have 3–4 choices and an answer (table check). `trivia_refill_queue` (low pools and the household whose model refills them) and `trivia_generation_usage` (batches per household per day) are server only. `revoke all` first. New tables only: safe in either order.
- **Writing and checking** (`school/trivia-generate.ts`): one batch of 8 per topic, band and language through `ai/provider-clients.ts` (kind `trivia_write`, 45 s, nobody waits). Structured `{kind, text, options, answer, explain, source_hint, difficulty}`. Every card passes `validateGeneratedCard` — shape; at most two sentences and 160 characters; 3–4 distinct choices with the answer among them; no links, emails, handles, phone numbers or emoji; the unsafe word lists for the band (`unsafeCardText`); no medical, money, diet or "try this at home" advice; no instructions — and then a second model call, a fact and age check by card number: kept only if answered accurate and suitable. No answer from the check, no cards.
- **Refill** (`school/trivia-refill.ts`): a step of the GitHub `clock` (`clock.trivia-refill`; the delivery clock on Vercel takes it over only while GitHub's heartbeat is stale). Up to 4 pools a run, oldest first: a full pool (20) is done; the asking household pays on its own terms (its key or the platform's, its data-use policy, the shared `ai.model` budget) and at most 6 batches a day; the topic is re-checked by the model before anything is written (a topic kept on the rules alone gets its model check here), and a topic turned away is dropped; only validated, fact-checked cards are stored; failures retry after 6 h, five times.
- **On Home**: the child's topics read their pool cards in the child's language (English when none yet), first, then the built-in category's; a topic no category covers is now covered once it has cards. Pools below 8 cards in the child's language are queued after the response (`after()`), and a new topic is queued when added. Guardian history shows generated card text as shown.
- **Evaluation**: TR-19–27 run generated cards through the same validation: kept good fact and quiz; refused link, advice, alcohol, scary for a young child, answer outside the choices, injected instruction, three sentences. A kept bad card is an unsafe execution.
- **Help**: the Trivia paragraph says cards are written in the background in the child's language, checked twice, with built-in cards meanwhile — eight languages.

## Verified
- `npx vitest run packages/core/src/school` trivia suites 42/42 (validation, batch with fact check, prompt minimisation, pool language fallback, refill: writes, drops an unfit topic, waits on the cap or no model, stops at a full pool); `packages/core/src/jobs` 7/7.
- `npm run eval` deterministic: 256/256, Unsafe Action Rate 0/45, every release gate pass.
- `scripts/test-child-trivia-rls.mjs` 9/9 locally (pool readable by all members, written by none; queue and usage unreadable; the quiz shape check).
- Core and web typecheck, ESLint on changed files, `lint:service-role`, `lint:knowledge`, `lint:help-links`, help and i18n tests, `npm run build -w apps/web`, `check:bundle`.

## Open
- Both trivia migrations (`20261107233000_child_trivia`, `20261108013000_child_trivia_pool`) wait for the owner to run them (the approval prompt timed out twice in this session); the SQL is in the session reply. Until then, Home shows no trivia card, and the refill finds no queue and does nothing.
- A provider run of TR-01–27 (`npm run eval -- --cases TR-01,…,TR-27 --provider configured`) and a browser check at 360 px / desktop with a child account, once the tables are live.

## Cleanup
No QA accounts, households or rows were created; local test databases were dropped by the suite.
