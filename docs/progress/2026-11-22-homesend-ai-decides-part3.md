# HomeSend: the model decides, part 3 — decision memory and worked examples (14-083)

**Why.** The owner, 2026-11-22: "learnt over time to take the right decision in automated way". Design: `docs/design/2026-11-22-homesend-ai-decides.md`.

**What was done.**
- Migration `supabase/migrations/20261122090000_homesend_decision_memories.sql`: one row per decided item and its outcome; RLS on the member's own households (set forms only); indexes on every foreign key and the recent-first read. In `household/reset-tables.json` and the knowledge registry (excluded: automation memory, not household facts).
- `packages/core/src/homesend/decision-memory.ts`: `rememberDecision` (accepted operations only, as capability/op/title/confidence; no amount, no person; an embedding when the household has an embedder), `similarDecisions` / `mostSimilar` (meaning or words, same sender first, a floor so nothing unrelated), `examplesText`, `recordDecisionOutcome` with `strongerOutcome` (an undo or correction is never overwritten by a later keep). Every function treats a missing table as no memory and never throws.
- `ingest.ts` `understand`: the household's similar past decisions go to the model as worked examples (`IntakeContext.pastDecisions`, fenced as untrusted by `pastDecisionsLine` since titles came from what people sent); after the decision the item is remembered. Callers pass the sender member.
- Outcomes: `undoHomeSendChange` → undone; `confirmHomeSendEntry` → confirmed (a person) or answered (their answers); the Nothing-waits runner → kept, when it keeps a note.
- X-003 and the WhatsApp "instruction as content" test now list `homesend_decision_memories` as one of HomeSend's own tables: it is HomeSend's memory, not a household record.

**Verified.** Vitest homesend, hometalk, ai, evaluation, whatsapp, household, knowledge: 2,048 pass (6 new). `npm run eval` deterministic (see PR). `lint:knowledge`, `lint:migrations` pass. Core typecheck clean.

**Not verified live.** No model key, so the effect of worked examples on a real reading is unmeasured; replay cases come with 14-085. The migration is not applied by this session (Supabase MCP not used, per the coordinator): until the owner runs it, the code reads no memory and writes none.

**Open.** "Corrected" from a plain correction in HomeTalk (`correct_entry`) and the field it changed are not yet linked to the item's memory; 14-084 does it with rule promotion. No test data created.
