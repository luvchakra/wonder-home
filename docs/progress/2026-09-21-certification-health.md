# Certification health: a percentage that can't hide the belief that matters (05-008)

**Date:** 2026-09-21
**Area:** `packages/core/src/household/certification.ts`, `apps/web/app/certification/page.tsx`

## What was done

Story 05-008 ("Certification health — provide explainable coverage
indicators") was the last untouched story in module 05; 05-001 through
05-007 were already `Done`. Its unique ask, past the module's usual
boilerplate criteria already satisfied by earlier stories, is in the goal
line: an explainable coverage indicator.

`summarize()` (05-001) already gives a single confirmed-over-live
percentage. The gap: that number can look healthy while hiding exactly the
belief a household most needs to see. Nine confirmed low-risk trivia and
one stale high-risk fact — a payment limit, a child's access — reads as
"90% understood," and nothing about that number tells anyone the one thing
that actually needs a look is buried inside the missing 10%.

`certificationHealth()` breaks the same live items down by risk level
instead of by category, and adds two things `summarize()` doesn't have:
`highRiskGapExists` (true only when a high or critical item currently needs
review) and a one-sentence `explanation` that is always traceable to the
counts above it — never an invented number, per the design rule that a
figure with no source is worse than none. When both a high and a critical
item are overdue, the explanation names how many are critical specifically
("2 beliefs that matter most need review, 1 of them critical") rather than
collapsing them into one undifferentiated count.

Unlike 03-007, 07-006, 07-007 and 14-007 before it, this story's underlying
data (`certification_items`) is already live and already queried on
`/certification`, so this one got real UI wiring rather than staying a
pure function waiting for a caller. The explanation now appears as a
second line in the page's own summary card, in amber, and — matching the
product rule that normal operation is silent — only when
`highRiskGapExists` is true. A household with nothing overdue at high risk
sees exactly what it saw before this story.

## Where the code lives

- `packages/core/src/household/certification.ts` — `RiskCoverage`, `CertificationHealth`, `certificationHealth`.
- `packages/core/src/household/certification.test.ts` — 6 new tests.
- `apps/web/app/certification/page.tsx` — the summary card's new conditional line.
- `backlogs/05-Household-Certification.md`, `tracking/PROGRESS.md`, `docs/PROGRESS.md` — 05-008 marked Done.

## Verified

- `npm run typecheck`, `npm run lint`, `npm run lint:boundaries`, `npm run lint:embeds`, `npm run lint:migrations` — all clean (no migration needed; no new storage).
- `npm run test` — 1313 unit tests across 96 files (6 new).
- `npm run test:db` — 224 database tests, unaffected.
- `npm run build` — clean.
- `npm run test:e2e` — 256 passing.
- `npm run brand -- --check` / `npm run tracker -- --check` — current.
- **Measured in a browser** (Chromium, since `/certification` needs a session this environment has no credentials for): a temporary route with a fixture household (9 confirmed low-risk items, 1 stale high-risk one) confirmed the amber explanation line reads correctly beside the ring at 360px and desktop, with no horizontal overflow. Deleted after, not in the build's route list.

## Still open

- Module 05 (Household Certification) is now fully `Done` — all eight stories.
- `03-008` and `14-008` remain the other open P2 stories from prior activity.
