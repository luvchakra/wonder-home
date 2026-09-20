# Jump back to the latest message

**Date:** 2026-09-20
**Area:** Talk (`/ai`)

## What was done

A small circular arrow now appears just above the Talk composer whenever the
reader has scrolled back through the conversation. Tapping it returns them to
the newest message.

Two behaviours, both deliberate:

- **It only exists when it has something to do.** Below 120px of scroll-back
  there is no button at all, so nothing is floating over the composer — the
  one thing somebody came to this screen to use — while they are already at
  the bottom (CLAUDE.md rule 10: never a control that does nothing).
- **Scrolling back now holds its place.** Before this, every new message
  re-pinned the scroller to the bottom, so reading back through the
  conversation while a reply landed yanked the reader down mid-sentence. The
  auto-pin now applies only to a reader who was already at the newest
  message; everybody else stays where they put themselves, and the arrow is
  how they choose to come back.

## Where the code lives

- `apps/web/app/ai/assistant.tsx` — `scrolledBack` state, `BACK_AT_LEAST`,
  `onScroll`, `jumpToLatest`, and the button itself.

The scroller is `flex-col-reverse`, so the newest message sits at
`scrollTop` 0 and scrolling back moves away from it — negative in most
engines, positive in some. The threshold therefore reads `Math.abs(scrollTop)`;
the sign is never trusted.

`jumpToLatest` checks `prefers-reduced-motion` and falls back to an instant
jump, matching the rest of the Talk screen.

## Verified

- `npm run typecheck`, `npm run lint` — clean.
- `npm run test` — 1250 unit tests pass (91 files), plus the 43 node tests.
- `npm run build` — clean.
- `npm run test:e2e` — 256 pass.
- **Measured in a real browser** (Chromium at 390×780, against a temporary
  harness mirroring the Talk scroller, since `/ai` needs a session):
  hidden while pinned to the newest message; shown after scrolling back past
  the threshold; the button sits fully inside the viewport
  (x 175, y 657, 40×40); clicking it returns `scrollTop` to 0 and the button
  disappears again; a 40px nudge stays below the threshold and shows nothing.
  The harness was deleted afterwards — it is not in the built route list.

## Still open

- `/ai` itself is still only verifiable against a live session; the harness
  stands in for it. Unchanged from the notes before this one.
