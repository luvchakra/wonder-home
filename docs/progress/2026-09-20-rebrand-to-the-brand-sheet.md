# The brand sheet, applied: new mark, lockup, palette, landing copy

**Date:** 2026-09-20
**Scope:** `packages/core/src/brand/mark.ts`, `packages/core/src/components/ui/brand.tsx`,
`scripts/build-brand-assets.ts`, `apps/web/public/icon*.{svg,png}`,
`packages/core/src/ui-theme.css`, `apps/web/app/_screens/landing.tsx`,
`packages/core/src/components/shell/nav-drawer.tsx`, `CLAUDE.md`,
`design/DESIGN-NOTES.md`, nine `text-[…]` call sites, `e2e/landing.spec.ts`,
`e2e/identity.spec.ts`

## What was done

The user confirmed the brand sheet at `design/WonderHome-brand-guidelines.png`
as the direction and asked for the logo, the pages and the landing page to
follow it. The earlier refresh (2026-09-19) had moved the tokens toward the
sheet's palette but deliberately kept the old roof-and-wave mark. That
decision is now reversed.

- **The mark is redrawn to the sheet.** `brand/mark.ts` now describes a
  house made of two thick strokes with flat feet: blue up the left wall and
  over the apex, running into teal and green at its tip; warm yellow down the
  right slope and wall, deepening to orange at the ground. A 2×2 window sits
  in the body and a leaf with a cut-out vein grows over the bottom-right
  corner, haloed in the surface colour so it stays separate from the wall.
  Both renderers (`brand.tsx` for JSX, `build-brand-assets.ts` for the icon
  files) read the same paths; `npm run brand` regenerated all nine icons and
  `npm run brand -- --check` passes. The dark tile is now the brand's Navy.
- **The wordmark follows the lockup**: "Wonder" in navy, "Home" in the blue
  gradient, and the tagline set small, upper-case and letter-spaced beneath
  (`--wh-foreground-muted`). The nav drawer now shows the tagline too.
- **Tokens tightened to the palette.** `--wh-primary` keeps its 4.5:1
  lightness but takes the sheet's full chroma at hue 237; `--wh-handled`,
  `--wh-attention` and `--wh-tone-care` likewise; `--wh-foreground` is Navy
  `#0F172A` in OKLCH; the window and "Home" gradient tokens are the sheet's
  hexes. Warm surfaces and the domain tones are unchanged, as the design
  notes already reasoned.
- **Landing copy from the sheet**: eyebrow "Smarter homes · Happier
  families", hero "WonderHome takes care, so you can *live more.*" (the last
  words in Accent Green, as drawn), the solution section's five pillars
  (Manage households, Plan & organize, Care for family, Save time, Live
  better) as rows with a line each, and a four-promise strip above the footer
  columns (Simple, Secure, Thoughtful, Sustainable).
- **CLAUDE.md** gains a "The brand is the sheet" paragraph under the design
  principles; **DESIGN-NOTES** records the mark decision reversal.

## Two bugs found by looking

Screenshotting the result exposed two defects that predate this work:

1. **Every hero, display and title heading was rendering at body size.**
   Tailwind v4 reads `text-[var(--wh-text-hero)]` as a *colour* utility, so
   the fluid type scale in `ui-theme.css` was never applied anywhere. All
   nine call sites now use `text-[length:var(--wh-text-…)]`, the token's
   comment says so, and the hero's ceiling is 4.5rem so the four-line lockup
   fits a desktop column.
2. **The sign-in page's mark drew only its window panes.** The page carries
   the mark twice (the illustrated panel, hidden on phones, and the phone
   header); both used the same gradient ids, and the browser resolved
   `url(#…)` to the copy inside `display: none`, whose gradients paint
   nothing. `BrandMark` now takes its ids from `useId()`.

## Verified

- Playwright screenshots of `/` at 390 and 1280 and `/sign-in` at 390
  against the production build: mark, lockup, hero size, pillars and footer
  strip all as intended.
- `npm run typecheck`, `npm run lint` — clean.
- `npm run test` — 43 pass; `vitest` on `mark.test.ts` — 9 pass (rewritten
  for the new geometry: seam order at the apex, flat feet, leaf halo,
  window inside the body).
- `npm run brand -- --check` — current.
- `npm run build` — clean.
- `npm run test:e2e` — 252 pass (the two h1 assertions updated).

## Still open

- The landing header shows the wordmark without the tagline; at 390px there
  is no room beside "Get Started" and the menu button. Desktop could carry
  it if wanted.
- Rule 3 says green is "handled"; the hero's "live more." in Accent Green is
  the one deliberate exception, because the sheet draws it that way.
