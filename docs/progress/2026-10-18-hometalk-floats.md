# HomeTalk floats over other apps (04-020), and the unit-change migration for the owner (25-013)

**Date:** 2026-10-18 · **Stories:** 04-020 (Done), 25-013 (code shipped; the migration waits on the owner)

## What the owner asked

1. "While a user is talking to HomeTalk, he can actually work with other applications on the phone… WonderHome should appear as a picture-in-picture mode, where the voice commands of WonderHome are still going on while the user is working on other apps."
2. "If you have SQLs to run, create a SQL file and give it to me. I will run it directly in the database. First, try to run these queries using the service role key."

## What was built

### Float: the conversation in the phone's picture-in-picture window

A web app cannot draw its own floating window, but a phone's browser will float a *video*. So:

- **The picture is painted.** `packages/core/src/components/ui/live-float.ts` paints the live state onto a canvas: the orb with its pulsing ring, what HomeTalk is doing (listening, thinking, speaking, paused — the composer's own words, in the viewer's language), then "You" and the last thing heard, "HomeTalk" and the last thing said. The colours are read from the theme's tokens (`--wh-background`, `--wh-primary`, …), so the window is the app's cream and indigo and follows dark mode. Long text shrinks a step before it is ever cut (rule 15). All of it is pure and tested without a browser.
- **The browser floats it.** `LiveTalkProvider` (`live-talk.tsx`) turns the canvas into a stream (`captureStream`), plays it in a hidden muted video, and asks for picture-in-picture — the standard `requestPictureInPicture`, or Safari's `webkitSetPresentationMode` on an iPhone. The window repaints eight times a second and the moment the state or the exchange changes.
- **The conversation never moves.** The engines keep running from the page underneath; the window is a view of the one session at the app's root (rule 13). Closing the window leaves the conversation running; ending the conversation closes the window.
- **Where it is.** Float sits beside End in the composer and on the live bar on every other screen, and only where the browser reports it can float a window (`floatSupport`, rule 10). Where the window will not open, the composer's hint line says so and nothing else changes.
- **The phone's own controls.** While a conversation runs, the media session carries HomeTalk's name and `play`/`pause`/`stop` handlers, so the floating window's own pause button and the lock screen pause, resume and end the same session; where the browser supports it, `enterpictureinpicture` floats it.
- **Listening in the background.** A recogniser that gives up while the page is hidden is asked to listen again after a short breath (never a hot loop), and again the moment the page is seen.
- **Help.** The Voice section, paragraph 8, in all eight languages.

### 25-013: the unit-change migration, handed over

The service-role key cannot run DDL: Supabase's Management API refused it (401, "JWT failed verification") and PostgREST has no SQL RPC. So the migration `supabase/migrations/20261018240000_grocery_unit_change.sql` (6.9 KB, one file) was given to the owner to run in the SQL editor. The code behind it — `commerce/unit-change.ts`, "Counted in" in the amount sheet, the item page's save, history rows, `verify:live` probes — is in this PR and inert until the function exists. The browser check of pieces → grams and the story's Done wait for that run.

## Verified

- **Unit tests.** `live-float.test.ts`, 17 tests: support detection (standard, Safari, none), the frame's words, wrapping, the palette, painting. Components, i18n and help suites: 135. Commerce and i18n: 192.
- **Gates.** Typecheck, lint and help links pass.
- **Browser, 360px and 1280px**, signed in as this session's QA household with live voice on and a scripted recogniser standing in for the microphone. Headless Chromium reports picture-in-picture as available, so this was a real run:
  - Float showed beside End. Tapping it made the hidden video the document's picture-in-picture element, streaming at 480×360.
  - The painted frame read "Thinking…", "HomeTalk · WonderHome", "YOU / What's for dinner tomorrow?"; after "Take me to the grocery list" it read "Listening…", the question, and "HOMETALK / Opening Groceries."
  - Groceries opened while floating; the bar there carried pause, Bring HomeTalk back and End.
  - The media session carried "HomeTalk", playing. End on the bar closed the window and removed the video.
  - With picture-in-picture switched off in the browser, no Float button and no errors.
  - No page errors and no horizontal scroll.

## Needs a person

- **A real phone.** Headless Chromium floats the window but has no microphone, so what a phone does with the microphone behind another app is the owner's check: Chrome on Android keeps it listening with the window up; an iPhone goes through Safari's own presentation mode, which this session could not exercise.
- **Run the SQL file** for 25-013, then `npm run verify:live` and the pieces → grams check in the browser.

## Where the code lives

- `packages/core/src/components/ui/live-float.ts`, `live-float.test.ts`, `live-talk.tsx`, `talk-composer.tsx`, `use-live-voice.tsx`
- `apps/web/app/ai/hometalk-labels.ts`; `hometalk.composer.floatLive`/`unfloat`/`floatFailed`/`you` in the eight catalogs
- `design/DESIGN-NOTES.md` (the floating window's rule)
- 25-013: `supabase/migrations/20261018240000_grocery_unit_change.sql`, `packages/core/src/commerce/unit-change.ts`, `apps/web/app/groceries/_components/to-buy-stepper.tsx`, `apps/web/app/(auth)/grocery-actions.ts`

## QA cleanup

Done after #230 merged, on 2026-10-18. These PRs (#226 to #230) all used one QA account, `52b0dda2-aaaa-48eb-a863-298bbd8fd1ea`, and its household "Cards QA Home" (`0a6a54d8-3e1c-4ddd-8fe3-a77ce65923fb`). The household's only member was that account, so it was deleted with everything in it: the seeded pasta items and the unit-change record, the QA birthday party and its two guests, the conversation, the Pro subscription, the address and the stored context row. Then the account was deleted. A count of all 132 household tables found no rows left, the account lookup found nothing, and no stored files were under the household. The local credentials, saved session, screenshots and QA scripts are gone, and no dev server is running.
