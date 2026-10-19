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

## QA cleanup

Recorded after the merge.
