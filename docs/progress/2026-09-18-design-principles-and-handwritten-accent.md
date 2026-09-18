# Design principles in CLAUDE.md, and the handwritten accent

**Date:** 2026-09-18 · **Kind:** design / rule

## What was done

The user supplied four mockup sheets (splash and onboarding, the app screens,
the device sheet, the landing page) and asked that the UI stay close to them.

**The rule.** `CLAUDE.md` gains a "Design principles" section with the ten
things every sheet shares: warm and never clinical; one handwritten line per
screen; teal commits while domains colour and state speaks in words; every row
opens with a tinted icon tile; botanical framing on warm surfaces; five
primary areas with the assistant raised in the middle; a human sentence
opening and a warm one closing; warm illustrated imagery, never stock office
photography; numbers that are explainable arithmetic; mobile-first at 360px
with the three states and no dead buttons. It also says to use the shared kit
rather than inventing a card, row, pill or tile per screen.

**The two missing signatures.** Everything else in the sheets was already
built; two things were not, and both carry the warmth:

- `ScriptAccent` — the handwritten line. Caveat, self-hosted through
  `next/font` so the CSP's `font-src 'self'` still holds. One per screen,
  decorative, never a control, never the only place something is said. Applied
  to the signed-out frame, the three onboarding screens, the landing hero and
  the closing section; `QuoteCard` was rebuilt on it, which carries it to the
  ten app screens that already used it.
- `LeafDecor` — the botanical corner the sheets frame warm surfaces with. One
  inline SVG drawn from new leaf tokens, faint, behind the content.

## Also fixed: E2E was silently half-running

The sandbox ships Chromium build 1194 while this Playwright release expects
1243, so every spec that needs a browser failed to launch — while the
request-only specs still passed, so a run could report green having opened no
browser at all. `playwright.config.ts` now finds a pinned build under
`PLAYWRIGHT_BROWSERS_PATH` when `PLAYWRIGHT_CHROMIUM_PATH` is unset. On a
machine with a normal install there is nothing to find and it costs one
directory read.

## Verified

Typecheck, lint, 679 unit tests, production build, and the **full** Playwright
suite: 164 passed with no environment variable set, including "no horizontal
overflow at phone width", which is what guards the new accent and decoration
on a 360px screen.

## Still open

- No dark design has been reviewed; dark tokens apply only under an explicit
  `data-theme="dark"`.
- The sheets show illustrated family photography in the landing problem
  section; the page uses illustration and icon tiles instead, since no
  licensed imagery is configured.

## Where

`packages/core/src/components/ui/script-accent.tsx`, `leaf-decor.tsx`,
`quote-card.tsx`, `packages/core/src/ui-theme.css` (script and leaf tokens),
`apps/web/app/layout.tsx` (Caveat), `_components/auth-layout.tsx`,
`_screens/landing.tsx`, `CLAUDE.md`, `design/DESIGN-NOTES.md`,
`playwright.config.ts`.
