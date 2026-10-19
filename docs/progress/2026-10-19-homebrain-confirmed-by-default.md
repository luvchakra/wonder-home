# What HomeBrain registers is confirmed by default (05-010)

**Date:** 2026-10-19 · **Asked by:** the owner ("whatever HomeBrain registers, mark it as confirmed by default. admin can later review and remove items from HomeBrain", with a screenshot of 14 items under Needs review)

## What changed

- **New beliefs are confirmed.** Everything a member tells HomeTalk goes through one writer, `remember()` in `conversation/repository.ts`. That covers likes, routines, the welcome questions and corrections. `extractMemory` (`conversation/memory.ts`) and the welcome (`conversation/welcome.ts`) now produce memories with status `confirmed`, and `remember()` writes the HomeBrain item as `confirmed` with them. Confidence still records how a belief was learned (under 1 for something said), so certainty stays a person's to give.
- **The database agrees.** The `memories` and `certification_items` status columns default to `confirmed`. That is migration `20261019150000_homebrain_confirmed_by_default.sql`, applied live.
- **What was on record moved too.** The migration moved 18 learned memories and their 18 HomeBrain items to `confirmed`, leaving 20 confirmed items. The 4 corrected items and 5 superseded memories were untouched.
- **What still waits for a person.** A statement that contradicts something already confirmed (`needs_review`) still waits under Needs review. That rule is unchanged in `reconcileMemory`.
- **Admins still decide.** Review offers Confirm, Remove, Later and Correct on every live item. Remove sets the memory to rejected, so HomeTalk stops using it.
- **Replies are cleaner.** "(you told me; not confirmed yet)" no longer appears, because items are confirmed. Voice answers are shorter as a result, which leaves more room under the 420-character spoken limit for the rest of the family. That limit is the cause of the "only Asmi's preferences" voice answer; it is reported to the owner and not changed here.
- **Help.** HomeBrain ¶1 says this in all eight languages, using each catalog's own tab name. The section is dated 2026-10-19.
- **Also in this PR:** a "Performance: what every change keeps" section in CLAUDE.md, drawn from the performance pass (2026-10-19).

## Verified

- Tests: the memory, engine and welcome tests now state the owner's rule ("recorded as confirmed, for an Admin to remove or correct later"). None was removed.
- Gates: `npm test` 3603 + 64; `test:db` 674/674; typecheck; `npm run eval` 133/133; migration lint.
- Live: the migration was applied through the Supabase MCP. Row counts were checked before and after, and both defaults read `'confirmed'`. `verify:live` passed 305/305. The household's stored context was marked stale by the update and rebuilt after it.
- Browser at 360px on a QA household:
  - "Asmi likes pasta" was remembered, and "What does Asmi like?" answered "Asmi likes pasta" with no "not confirmed yet".
  - Needs review reads "You're all caught up".
  - The like shows under Confirmed with Confirm, Remove, Later and Correct.
  - Remove took it off.
  - No page errors.

## Follow-up: "Registered", never "Confirmed"

The owner, the same day: "instead of calling default state as confirmed, call it Registered. let's not have anything called confirmed". Done in #251:
- **HomeBrain Review.** The metric, the tab, the status, the decision, the ring, the count line, the empty states and the add lede now read "Registered". The controls read "Register" and "Register selected". The source lines no longer say "not yet confirmed".
  - These are 18 `review.*` keys in all 8 household catalogs.
  - They also cover the kit defaults (`certification-item.tsx`) and `DECISION_LABEL`.
- **Notices.** The review actions say "Registered." and "Added, and registered".
- **HomeTalk.** HomeTalk now says "(you told me; not registered yet)" and "This contradicts something the household registered". The "why" answer and the context conflict line were changed the same way.
- **Help.** HomeBrain ¶1 and ¶4 are reworded in 8 languages.
- **Left alone.** The stored status value stays `confirmed` (`memories`, `certification_items`, `certification_reviews`), so no migration was needed. "Confirm" elsewhere in the app keeps its own meaning: approving a HomeSend item, a payment, or a calendar "confirmed plan". Renaming the stored value too is a separate, larger change (check constraints, functions, the context builders and the golden set) and was not asked for.

Verified: 1178 tests across conversation, household, homebrain, help, i18n, context and components; typecheck; eval 133/133. In the browser at 360px, HomeBrain Review showed "1 of 1 belief registered", a Registered metric and tab, and no "Confirmed" left.

## QA cleanup

Ran after #250 merged (2026-10-19): QA account `7532f0fd-c1ea-40f0-aab2-19a4cdc0501b` and household `29c2c0e7-1ecc-4ed2-b62b-ed33a8a9f382` ("QA Confirmed Home") deleted. Confirmed by SQL: 0 households, members, memories, review items and auth users left for them.
