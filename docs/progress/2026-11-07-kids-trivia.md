# Kids Trivia, PR 1 (story 08-034)

The owner, 2026-11-07: "in kids version, create a trivia section, where child can choose topic of interest (can be anything), then WonderHome can ask or tell trivia about those topics every time the child opens the app in a fun way."

## What was built
- **Topics.** On a child's Home (Today), *My trivia topics*: type anything, or tap a suggestion (rule 20); at most 8; remove with ×. Every topic is normalised (NFKC, invisible characters and emoji dropped, 2–40 characters, five words) and checked twice: fixed rules (`school/trivia.ts` `screenTopic`: violence, sexual, drugs/alcohol, self-harm, hate, gambling, horror for under-13s and ghosts for under-8s, someone the child knows, instructions) and then the household's model (`school/trivia-safety.ts`, through `ai/provider-clients.ts`, kind `trivia_check`, the household's key and data-use policy, the shared `ai.model` budget). Only the topic word and the age band are sent. The model answers from a fixed list and is read the careful way (`readVerdict`); a rules "no" is final and the model is never asked. A turned-away topic answers only "Let's pick another topic"; its words are never stored — a SHA-256 within the household and a reason code (`trivia_rejections`). Rate limit `trivia.topic` 20/hour per child.
- **The card.** One card each time the child opens Home: "Did you know?" and "Quiz time!" in turn, the next topic each opening, never the last card again, unseen cards first and nearest the child's difficulty (`pickNextCard`). Quiz: 3–4 choices, tap to answer, cheerful feedback and a one-line why; a "N right in a row 🔥" streak counted from answers on record (rule 9; kept separate from goal stars, which count only things done). Tell me another / Next topic / Too hard / Too easy / Read it to me (the device's own speech, nothing leaves the device).
- **Built-in cards.** ~90 hand-checked cards in 21 categories (`school/trivia-curated.ts`), English, so it works with no AI key. A child's topic maps to a category by its words ("Minecraft" → computers and games); a topic no category covers is said honestly ("No X trivia yet, so here's one about Y"). Generated cards per topic, in the child's language, are 08-035.
- **Guardian.** In Family, the child's row (a guardian of that child or an Admin; one editor, rule 23): on/off, the child's topics (remove any), the last 20 cards shown with right/not right, turned-away topics in the last 30 days by reason only, and the privacy line.
- **Data.** Migration `20261107233000_child_trivia.sql`: `trivia_profiles`, `trivia_topics`, `trivia_rejections`, `trivia_shown`. RLS in set form: the child, their guardians and Admins read; topics, cards, answers and rejections are written only by the server (service role) after its checks — `revoke all` first, since Supabase grants new tables to `authenticated`; only a guardian or an Admin changes on/off (trigger `wh.trivia_profile_guard`). New tables only: safe in either order with the code (no tables → no card, no guardian control). Excluded from the knowledge registry with reasons.
- **Evaluation.** A fourth surface, `trivia`, in the one evaluation: TR-01–18 (kept interests incl. "killer whales", "Star Wars", "World War 2" for a teen; unsafe topics in each class, a disguised spelling, horror by age, someone the child knows; injected instructions and a link). A kept unfit topic is an unsafe execution. Provider runs check topics with the model too.
- **Words and help.** `trivia.*` in eight languages; help → School and children's work gains a Trivia paragraph in eight languages (`updated` 2026-11-07).

## Verified
- `npx vitest run packages/core/src/school/trivia.test.ts` 24/24 (normalise, screen, model reading, hash, levels, curated cards well formed, category mapping, scheduling: alternation, topic rotation, no repeat, unseen first, difficulty, streak).
- `npm run eval` deterministic: 242/242, Unsafe Action Rate 0/38, every release gate pass; trivia 18/18.
- `scripts/test-child-trivia-rls.mjs` 7/7 on a local database; `test-setup-counts-rls.mjs` 5/5.
- Core and web typecheck, ESLint on changed files, `npm run build -w apps/web`, `check:bundle`, `lint:knowledge`, `lint:help-links`, help and i18n tests.

## Open
- **Live migration:** `apply_migration`'s approval timed out in this session; the owner runs the SQL by hand (given in the PR reply). Until then no trivia card shows.
- **Browser check at 360 px / desktop with a QA household with a child:** after the migration is live.
- **08-035:** generated cards per topic and age band in the child's language, background refill on the GitHub clock, per-item validation and a second-model fact check, per-household cost cap, eval cases for generated cards.

## Cleanup
No QA accounts, households or rows were created in this session; local test databases were dropped by the suite.
