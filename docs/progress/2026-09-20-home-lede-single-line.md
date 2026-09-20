# Home's lede fits on one line instead of wrapping to three

**Date:** 2026-09-20
**Area:** Home (`/`)

## What was done

"A calmer home today, for a brighter tomorrow." was sharing a flex column
with the date pill in Home's header, squeezed down to roughly 200px of
available width and wrapping across three lines. It now sits on its own row
spanning the header's full width, with the greeting and the date pill still
sharing the row above it as before — the greeting can still wrap on a very
narrow phone, but the lede itself no longer competes with the pill for space.

## Where the code lives

- `apps/web/app/_screens/home-dashboard.tsx` — the header's `<div>` split
  into two rows instead of one.

## Verified

- `npm run typecheck` / `npm run lint` — clean.
- `npm run test` — 1250 tests across 91 files.
- `npm run build` — clean.
- `npm run test:e2e` — 256 passing.
- **Measured in Chromium** at 360, 375, 390, 412, 430, 500, 640 and 672px
  against a temporary route mirroring the header: one line at every width,
  no horizontal overflow. Route deleted immediately after.

## Still open

- `/` itself is still only verifiable against a live session.
