# Landing refresh: what's new, HomeSend and languages, with depth and motion

**Date:** 2026-09-24
**Asked for:** "update landing page with latest additions, keep it family
friendly, modern and include animation and parallax."

## What was done

The landing page now covers the work of the last few weeks. It keeps the
page's rule that nothing on it is fabricated.

- **New in WonderHome** (`#new`, and "What's new" in the header nav).
  - *Ready today* covers what works in the product as shipped:
    - talking in your own language;
    - sending things instead of typing them;
    - one reminder for a child's school day, with the backup told only if
      nobody answered;
    - guided setup;
    - family health;
    - sharing the load;
    - receipts that become purchase history;
    - settings kept in one place.
  - *Coming soon* says in words what is built but waits on an account a
    person has to open: WhatsApp, forwarded email, Alexa and Gemini voice, and
    paying with UPI, cards or netbanking.
- **HomeSend moment** (`#homesend`): "Snap it. Send it. Done.", in three
  steps (send, WonderHome reads it, you say yes). Alongside is an inbox drawn
  with the product's own row shape. A notice, a bill, a voice note and a link
  arrive one after another, each waiting on Confirm. The content is marked
  illustrative.
- **Language strip.** Greetings in every language the product supports,
  taken from `LANGUAGES` in `i18n/locales.ts`, each item with its own `lang`
  and `dir`.
- **Features grid.** HomeSend and Health & Fitness join it, and it becomes
  four columns on desktop.
- **Depth and motion.**
  - Hero leaves, soft colour fields, sparks and floating tiles drift at their
    own `data-parallax` depths, driven by the existing `Reveal` script.
  - New CSS in `ui-theme.css`:
    - `wh-marquee`, for the language strip;
    - `wh-arrive`, which plays once as the inbox reveals;
    - `wh-twinkle`, a slow breath on the sparks.
  - All of it is transform and opacity only, and all of it is removed under
    `prefers-reduced-motion`.
- **Header.** "What's new" pushed the inline nav past its width, and every
  label wrapped. The inline links now show only from `xl`, with
  `whitespace-nowrap`. Narrower screens use the menu (rule 15).
- **Phone cards.** On a phone the "Ready today" cards put the icon beside the
  text, so eight of them read as a list rather than a long scroll.

## Verified

- Typecheck and lint are clean.
- Browser QA on the dev server, with Chromium at 360px and 1280px and with
  reduced motion:
  - no horizontal overflow at 360px, 1024px, 1280px or 1440px;
  - no page errors;
  - every reveal visible after a scroll pass;
  - all 17 parallax layers moving with motion on and none under reduced
    motion;
  - the marquee's animation is `none` under reduced motion;
  - the header is one 64px row at 1024px, 1280px and 1440px.
- The screenshots were reviewed for the new sections at both widths.
- `e2e/landing.spec.ts`:
  - the section list now includes `new` and `homesend`;
  - new tests check that exactly the four unconnected channels say "Coming
    soon", and that the language strip carries Hindi, Arabic right-to-left,
    and stops under reduced motion.
  - Against the dev server, everything passed except the mobile header-menu
    test. That test fails the same way on `main`'s unchanged code there: the
    menu is tapped before dev-mode hydration. CI runs it against a production
    build.

## Still open

- Nothing needs a person. When WhatsApp, email, voice or payments go live,
  move that item from *Coming soon* to *Ready today*.

## Where the code lives

- `apps/web/app/_screens/landing/whats-new.tsx` (`WhatsNew`,
  `SendItToWonderHome`, `LanguageStrip`)
- `apps/web/app/_screens/landing.tsx`
- `apps/web/app/_screens/landing/header.tsx`
- `packages/core/src/ui-theme.css`
- `e2e/landing.spec.ts`
- `design/DESIGN-NOTES.md` (landing motion)

## Cleanup

No accounts, households or rows were created. The dev server this session
started and the scratch QA scripts and screenshots were removed.
