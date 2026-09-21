# Certification history: who reviewed what, and when (05-007)

**Date:** 2026-09-21
**Area:** `/certification`, `certification_reviews` RLS

## What was done

Product-direction v4's remaining gaps list a visible trust model as one of
the important gaps: "what WonderHome noticed, decided, did, and why." The
"decided" half already existed at the data layer — `reviewCertificationAction`
has always written an append-only row to `certification_reviews` (reviewer,
decision, previous value, new value) every time someone confirms, corrects,
removes or defers a belief — but nothing ever read it back. Story 05-007
("Certification history — show who changed what and when") is exactly that
missing read side, so it was picked as the next dependency-ready story,
weighted toward the trust-model gap.

The Certification screen gained a fourth segment, **History**, showing each
review as a row: who did it, the decision (confirmed / corrected / removed /
left for later), the claim before and after when it was a correction, and
when. No new table and no new write path — this reads the same trail the
existing review action already produces.

## What was found and deliberately left alone

While adding real test coverage for `certification_reviews`' RLS (there was
none at all — see below), its select policy turned out to check only
household membership, not the item's own scope, unlike `certification_items`
itself (which keeps a member-scoped belief private to its subject and an
admin). My first instinct was to tighten it to match. The migration's own
comment stopped that: *"The review history is visible to the whole household
on purpose: a family should be able to see who changed what WonderHome
believes about them."* That is a deliberate privacy trade-off already made,
not an oversight — reversing it is a privacy-posture decision in its own
right, not something "add a history tab" licenses on its own. Left as
documented, and the new test makes the choice a checked one instead of an
implicit one, in either direction, from here on.

## Where the code lives

- `packages/core/src/household/certification.ts` — `DECISION_LABEL`, `CertificationHistoryEntry`.
- `apps/web/app/certification/page.tsx` — the History segment, its query and its row rendering.
- `scripts/test-certification-rls.mjs` (new) — this table had zero RLS coverage before now.
- `backlogs/05-Household-Certification.md`, `tracking/PROGRESS.md`, `docs/PROGRESS.md` — 05-007 marked Done.

## Verified

- `npm run typecheck`, `npm run lint`, `npm run lint:embeds`, `npm run lint:migrations` — all clean.
- `npm run test` — 1250 unit tests across 91 files, plus 43 node tests.
- `npm run test:db` — 220 database tests, including the 9 new certification ones: a household-wide belief is visible to everyone; a member-scoped belief is hidden from an uninvolved adult but visible to its subject and to an admin; the review trail is visible to the whole household by design (both positive and negative cases); another household sees nothing at either table; and nobody can write to either table directly — only `reviewCertificationAction`'s admin client may.
- `npm run build` — clean.
- `npm run test:e2e` — 256 passing.
- `npm run tracker -- --check` — current.
- **Measured in a browser** (Chromium, since `/certification` needs a session this environment has no credentials for): a temporary route with fixture history rows confirmed the row layout, icon/tone per decision, the before→after claim text, and no horizontal overflow at 360/390px. Deleted after, not in the build's route list.

## Still open

- `05-008` (Certification health — explainable coverage indicators) is the
  module's other remaining story, P2, not started.
- The `SegmentedControl`'s active tab can sit partly outside the initial
  scroll position when a page has four segments instead of three (its
  `overflow-x-auto` still makes it reachable) — a pre-existing property of
  the shared component, not something introduced here, and not fixed as
  part of this story.
- Nothing here was viewed signed in, for the reason given above.
