# Recurring misses, learned without a person having to notice first (07-007)

**Date:** 2026-09-21
**Area:** `packages/core/src/household/helpers.ts`

## What was done

Story 07-007 ("Pattern learning — learn normal timing and missed
patterns") was the last untouched P1 in module 07; 07-001 through 07-006
were already `Done`. Its goal has two halves, and the first turned out to
need no new code at all: "normal timing" is exactly what 03-007's
`findTimingPattern` (`household/pattern-learning.ts`) already computes —
it operates on any `Outcome[]` filtered by `outcomeKey`, and a helper's
responsibilities are outcomes like any other. Duplicating that logic here
would have meant two implementations of the same idea that could quietly
drift apart, so this story reuses 03-007's function directly rather than
writing a second one scoped to helpers.

The genuinely new half is "missed patterns." `findMissPattern` (added to
`helpers.ts`, next to the `HelperException`/`handleHelperException` types
it operates on) looks at an outcome's history of exceptions and calls a
recurring miss only when the *same kind* of exception keeps happening —
at least 3 occurrences, with one kind accounting for at least 60% of them.
One blocked day and one missing-supply day are two different problems, not
a pattern worth a household reviewing the backup plan over; three
missing-supply days in a row is. `proposeMissPattern` turns a found
pattern into the same `LearningProposal` shape module 14's
`orchestrator.ts` already defines (observed, capped confidence, status
"learned"), with confidence rising on both occurrence count and
concentration together — and, matching 03-007's own gate exactly, it
returns `null` and proposes nothing once the household has already
confirmed a fact about that outcome, so a pattern noticed afterward never
competes with a deliberate confirmation.

No caller is wired up yet, on the same precedent 03-007, 07-006 and 14-007
already established this session: `HelperException` still has no backing
table (07-006's progress note already documents this), so there is nothing
live to run either function against. Both are ready for whichever job
generates that history first.

## Where the code lives

- `packages/core/src/household/helpers.ts` — `MissRecord`, `MissPattern`, `findMissPattern`, `proposeMissPattern`.
- `packages/core/src/household/helpers.test.ts` — 8 new tests (29 total in the file).
- `backlogs/07-Househelper-and-Home-Operations.md`, `tracking/PROGRESS.md`, `docs/PROGRESS.md` — 07-007 marked Done.

## Verified

- `npm run typecheck`, `npm run lint`, `npm run lint:boundaries`, `npm run lint:embeds`, `npm run lint:migrations` — all clean (no migration needed; no new storage).
- `npm run test` — 1307 unit tests across 96 files (8 new).
- `npm run test:db` — 224 database tests, unaffected.
- `npm run build` — clean.
- `npm run test:e2e` — 256 passing.
- `npm run brand -- --check` / `npm run tracker -- --check` — current.

## Still open

- Nothing calls `findMissPattern`/`proposeMissPattern` yet — same gap as 07-006, waiting on a real `HelperException` data source.
- `07-008` (Service marketplace) is the module's other remaining story, P2, not started.
- `03-008`, `05-008`, `14-008` remain the other open P2 stories from prior activity.
