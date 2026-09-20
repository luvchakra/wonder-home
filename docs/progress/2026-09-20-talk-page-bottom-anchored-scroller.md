# The Talk page opens at the newest message, with nothing scrolling

**Date:** 2026-09-20
**Scope:** `apps/web/app/ai/assistant.tsx`, `apps/web/app/ai/page.tsx`

## What was done

The Talk page (`/ai`) no longer scrolls the document at all. Three earlier
passes tried to land the reader at the newest message with
`scrollIntoView` — first smooth, then instant, then from a layout effect —
and every one of them still showed a jump, because the server-rendered page
paints at scroll position 0 and the scroll only happens once hydration
lands a moment later.

The fix is structural rather than behavioural:

- The conversation is now its own scroll container laid out bottom-up
  (`flex-col-reverse`, `overflow-y-auto`). A column-reverse scroller opens
  at its end natively, on the very first paint, with no JavaScript.
  "The end" is `scrollTop 0` in that layout, so the only remaining effect
  re-pins it to 0 after a new turn in case the reader had scrolled up.
- The whole `Assistant` is sized to exactly the space between the header
  and `main`'s own bottom padding
  (`100dvh − header − safe-area top − tab bar − raised-button clearance −
  1rem`, and a simpler `100dvh − header − 4.5rem` on desktop), so the
  document itself never has anything to scroll.
- The composer and its disclaimer are a plain flex child below the
  scroller, no longer sticky, so no message can show through them and the
  last line of the last reply always sits above the input.
- The page title and the shell title read "Talk to WonderHome" to match
  the renamed tab.

## Why

The user asked that opening Talk show the layout as-is: the newest message
already in view, nothing moving as the page loads. Every scroll-to-end
approach is a visible correction by definition; only a layout that starts
at the end can satisfy that.

## Verified

- A Playwright harness of the same layout (14 turns, rendered synchronously
  like SSR, zero scroll code) at 375×812: document not scrollable, scroller
  at `scrollTop 0`, the last reply fully visible with a 16px gap above the
  composer.
- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run test` — 43 pass.
- `npm run build` — clean.
- `npm run test:e2e` — 252 pass.

## Still open

- The harness is not committed; it lived in the session scratchpad. An
  authenticated e2e that opens `/ai` with a long history and asserts
  `window.scrollY === 0` would make this regression-proof.
