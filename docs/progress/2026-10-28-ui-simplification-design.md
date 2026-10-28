# UI simplification design (proposed)

**Date:** 2026-10-28

## What was done
- Took an inventory of every signed-in route, the primary and secondary navigation, and the places where one job is reachable or editable on several screens.
- Wrote `design/UI-SIMPLIFICATION-v1.md`, which proposes eight merges.
  - M1–M6 are notifications, connections, people, calendar, setup, and Settings with You / Household tabs.
  - M7–M8 cut the doors into the same page and shrink the More menu.
  - Together they remove 14 signed-in routes behind permanent redirects.
  - The five primary areas and the HomeTalk "one door" rule stay unchanged.

## Verified
- A design document only; no code changed. Route counts come from `apps/web/app/**/page.tsx` and `packages/core/src/navigation/*` as of this date.

## Open, needs a person
- The owner's decisions D1–D6 in §8 of the design. Stories go into the backlog and the priority report once these are answered.
