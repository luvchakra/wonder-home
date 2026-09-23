# HomeBrain 2.0, part 2: current truth and HomeBrain Review (story 14-010, Wave 2)

**Date:** 2026-09-23
**Story:** 14-010 (P0, module 14). Done: this note covers part 2 of 2. Part 1 is [the grounded reasoning note](2026-09-23-homebrain-2-grounded-reasoning.md).
**Spec:** `design/HOMEBRAIN-2.0-WAVE-2.md`, §8 (corrections), §9 (current truth), §12 (HomeBrain Review).

## Why

Part 1 left the household with two stores that never talked to each other:
- HomeTalk wrote what it learned to `memories`, which HomeBrain reads. HomeBrain Review (then "Household certification") read and wrote `certification_items`, which HomeBrain never read. `certification_items.memory_id` existed for the link and nothing set it. A correction in either place was invisible to the other.
- The spec's own example failed. "Asmi doesn't like mushrooms" matched no preference rule, and "Actually Asmi is okay with mushrooms now" would have been keyed differently, so it could never supersede the first.
- Adding a belief from the Review screen always failed in production: the action inserted through the member's client, and the review tables' RLS is SELECT-only.

## What was done

**Preferences keyed by what they are about** (`conversation/memory.ts`)
- `parsePreference` reads a statement into subject, object and stance (likes, dislikes, allergic, okay with, prefers), keyed `pref.<subject>.<object>` with the object singularised. "Asmi doesn't like mushrooms" and "Actually Asmi is okay with mushrooms now" share `pref.asmi.mushroom`, so the second supersedes the first.
- Words like "now", "anymore", "no longer", "actually" and an "okay with" stance mark the statement as a correction.
- `attributeMemory` scopes a preference to the member it names. `isReviewable`, `claimFor` and `reviewPlacementFor` decide what reaches Review and where it goes: allergies are safety and high risk, meals and kids are home routines, school is education, bills are finance and medium risk, everything else is lifestyle and low risk.
- `conversation/rules.ts` gains a final preference rule, so these statements become `set_preference` with the parsed key.

**HomeTalk writes to HomeBrain Review** (`conversation/repository.ts` `remember`)
- It supersedes the old memory, inserts the new one, and writes a linked `certification_items` row (with `memory_id`, source detail "told by <name>").
- It marks the old linked item `corrected` and records a `certification_reviews` row: "Corrected in HomeTalk."
- Empty or unreviewable memories never reach Review.

**Review decisions update what HomeBrain reads** (`apps/web/app/(auth)/certification-actions.ts`)
- **Confirm** makes the memory `confirmed` with confidence 1.
- **Remove** rejects it.
- **Correct** supersedes it with a new confirmed memory, linked to the new item.
- Every action forgets the household's context cache.
- "Add a belief" now inserts through the admin client, after the same membership and permission checks it already made.

**Review beliefs are HomeBrain facts**
- `context/repository.ts` `listBeliefs` reads Review items with no memory link.
- `context/builders.ts` turns them into `belief` context items. Finance items are financial and education or child items are child privacy class, so the consent gate treats them like any other fact.
- `context/provenance.ts` explains where each came from.

**Relevance fixes found in browser QA**
- `homebrain/grounding.ts`: a fact sharing two or more meaningful words with the question now counts as relevant. "When do the children go to bed?" found nothing before.
- `homebrain/why.ts`: "where did that come from?" now matches a close paraphrase of the last reply's fact.

**The screen** (`apps/web/app/certification/page.tsx`, `CertificationItem`)
- Renamed **HomeBrain Review**, in the landing page, secondary navigation and help guide.
- Each fact shows its source ("something said in HomeTalk"), when it was learned, a confidence in words, and whether it is confirmed. It keeps the existing edit and remove.

**Migration** `supabase/migrations/20260923120000_homebrain_review_links_memories.sql`
- Data only. It backfills a linked Review item for every current learned or confirmed memory that has none, skipping empty values.
- The category, risk and claim wording mirror `memory.ts`.
- It is idempotent.

## Verified

- Unit tests:
  - `conversation/memory.test.ts` and `rules.test.ts`: preference parsing, the mushroom example, reviewability.
  - `homebrain/evaluations.test.ts`, new "Corrections and current truth (§8, §9)" block: correction supersedes; child privacy class; a Review belief is read with its provenance; the bedtime paraphrase gets a deterministic answer.
- `scripts/test-certification-rls.mjs`, 10/10:
  - the backfill run twice writes the safety/high claim "Priya is allergic to peanuts." once;
  - superseded and empty memories are skipped;
  - a bystander cannot read a member-scoped item.
- Migration applied to the live project (`kqxndableyysxqhxiorz`) with `apply_migration`, then checked with `npm run verify:live`: 117/117 passed.
- The first live backfill created a blank "Meals dinner." item from a `{}` memory. It was deleted, the migration now skips empty values, and the live migration record's statement was updated to match the file.
- Browser QA on the live project with a QA household, at 360px and desktop, no horizontal scroll:
  - "Asmi doesn't like mushrooms" then "Actually Asmi is okay with mushrooms now" shows in Review with the history row: Corrected "Asmi doesn't like mushrooms." → "Asmi is okay with mushrooms."
  - Adding a belief works.
  - Confirm sets the memory to confirmed at 1.00.
  - Why-answers and deterministic answers read the corrected fact.
- The QA user and household were deleted afterward.
- Full `npm run verify` is green; see the PR.

## Still open

- An older QA account from earlier today (`42dc16e3-8e5b-463f-8f6a-965f69261bb6`) was left in place, because this session could not confirm it created it. Delete it with `node scripts/qa-test-user.mjs delete 42dc16e3-8e5b-463f-8f6a-965f69261bb6` if nobody needs it.
- Only preferences are linked to Review so far. Other `memories` keys (bedtimes, routines) are backfilled if they carry a statement, but HomeTalk has no rule that learns them yet.
- A live check against a real model provider was not run from this sandbox. The validator still decides what reaches the household, whatever the model says.
