# A helper's daily summary: one line for a quiet day, one entry for what wasn't (07-006)

**Date:** 2026-09-21
**Area:** `packages/core/src/household/helpers.ts`

## What was done

Story 07-006 ("Optional daily summary — provide one unusual-work summary")
was the next untouched P1 in module 07 (Househelper & Home Operations);
07-001 through 07-005 were already `Done`. The module's founding rule,
stated in `helpers.ts`'s own header comment, is that "a househelper does
not update WonderHome... the system notices when something is *not*
normal" — this story is exactly that noticing, collected into one digest
instead of left scattered across whatever already surfaces an individual
exception.

`buildDailySummary(input)` is a small addition built entirely on what
07-004 (`handleHelperException`) and 07-002 (`assessAbsence`) already
decide:

- It takes the day's exception/handling pairs (whatever already called
  `handleHelperException`) and keeps only the ones that came back
  `tell_household` — a `handle_silently` exception, by definition, needed
  nobody's attention, so it earns no entry.
- It takes the day's absence impact (from `assessAbsence`, if there was an
  absence) and adds one entry only when it was `notable` — i.e. something
  was left uncovered. A fully-covered absence is the backup plan working,
  which is not unusual either.
- The result is one `DailySummary`: a list of entries, a `quiet` flag, and
  one `headline` — "Nothing unusual today" when the list is empty, or a
  count when it isn't. Never a blank screen that could be mistaken for
  "nobody checked."

This is deliberately opt-in and inert: nothing in the product depends on
anyone reading a `DailySummary`, matching the acceptance criterion
("routine helper work requires no per-chore status update") and the
existing `helperNeedsToRespond` function's own restraint (a helper is
asked to respond only when something is genuinely blocked, never to
acknowledge a summary).

## What was found and left for later

`HelperException` has never been backed by a table — nothing in the schema
or any repository writes or reads one; it exists purely as the type
`handleHelperException` (07-004) already operates on. That means there is
no live source of "today's exceptions" to build a real summary from yet,
so wiring `buildDailySummary` into the `/househelper` screen (which has
an Overview/Schedule/Tasks structure that a Summary tab would fit naturally
into) would mean inventing exception data — exactly what CLAUDE.md's rule
against fabricated numbers and dead providers forbids. This stays a pure,
tested domain function today, on the same precedent 03-007
(`findTimingPattern`/`proposeTimingPattern`) and 14-007 (`specialists.ts`)
already set in this session: correct and integrated with the module's
existing decisions, ready for whichever job or screen ends up generating
`HelperException` rows first.

## Where the code lives

- `packages/core/src/household/helpers.ts` — `SummaryEntry`, `DailySummary`, `buildDailySummary`.
- `packages/core/src/household/helpers.test.ts` — 8 new tests (21 total in the file).
- `backlogs/07-Househelper-and-Home-Operations.md`, `tracking/PROGRESS.md`, `docs/PROGRESS.md` — 07-006 marked Done.

## Verified

- `npm run typecheck`, `npm run lint`, `npm run lint:boundaries`, `npm run lint:embeds`, `npm run lint:migrations` — all clean (no migration needed; no new storage).
- `npm run test` — 1285 unit tests across 94 files (8 new).
- `npm run test:db` — 220 database tests, unaffected.
- `npm run build` — clean.
- `npm run test:e2e` — 256 passing.
- `npm run brand -- --check` / `npm run tracker -- --check` — current.
- No UI change (see above), so nothing to verify in a browser for this story.

## Still open

- Nothing calls `buildDailySummary` yet — see above.
- `07-007` (Pattern learning — normal timing and missed patterns, for helper work specifically) and `07-008` (Service marketplace) remain the module's other open stories.
- `03-008`, `05-008`, `14-008` remain the other open P2 stories from prior activity.
