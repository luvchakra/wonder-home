# HomeTalk: the composer stays at the bottom on desktop

**Date:** 2026-11-20 · **Reported by:** owner ("in desktop view, in HomeTalk, the composer section should stick at the bottom, currently it's scrolling")

## Cause
On desktop the HomeTalk column had a fixed height, `100dvh − header − 4.5rem`, worked out as if it were the only thing on the page. Anything above it — the "Needs you" list (since 2026-11-14), a key alert, the first-day welcome — added its own height on top, so the page grew taller than the window, the page itself scrolled, and the composer scrolled away with it. Even with nothing above it the page overflowed by 1 px. Not caused by #558 or #567 (the sidebar PRs did not touch the main column); it dates from the fixed height (`bbd711a`) and became visible once the "Needs you" list sat above the conversation.

## Fix
A height chain instead of a sum (`AppShell` `fill`, desktop only): the shell is exactly the window's height, and each wrapper down to `<main>` is a `min-h-0` flex column, so whatever sits above the conversation takes room from it rather than pushing the composer down. HomeTalk's column is `flex-1` on desktop. The "Needs you" list is capped at 40% of the window there and scrolls inside itself, so a long list never squeezes the conversation to nothing. The composer stays in flow (not `position: fixed`), so its width follows the content column beside the sidebar, and the newest message is never behind it. Phone and tablet classes are unchanged (the same values; only the desktop bottom padding moved into the branch it belongs to). Only `/ai` uses `fill`.

## Verified
- New `e2e/hometalk-composer.spec.ts` (signed-in household with 30 messages): at 1280×600, 1280×900 and 1440×900 the page cannot scroll, the composer's box is the same before and after scrolling the conversation and the page, the newest message ends above it, a 20-line draft grows the box upward with its bottom in place; a 240 px block inserted above the conversation (standing in for "Needs you") leaves the composer where it was; at 360 px it sits above the tab bar.
- Before the fix: page overflow 1 px with no list, **241 px** with the 240 px block; composer bottom 553 → 552 after scrolling at 1280×600. After: overflow 0; composer 448–576 at 1280×600 and 748–876 at 1280×900/1440×900, identical before and after scrolling. Phone: composer bottom 653, tab bar top 671.
- Spec repeated 4×: every layout test passed each time; two repeats of the phone test hit the sign-in limit (30 per address per 10 minutes) after many sign-ins, not a layout failure.
- Typecheck, ESLint on the touched app files, shell unit tests.

## Cleanup
The spec creates and deletes its own household and account (`afterAll`); no QA data left.

## Code
`packages/core/src/components/shell/app-shell.tsx`, `apps/web/app/ai/assistant.tsx`, `apps/web/app/ai/page.tsx`, `e2e/hometalk-composer.spec.ts`.
