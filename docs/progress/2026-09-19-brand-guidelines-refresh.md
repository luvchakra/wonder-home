# The brand guidelines, applied through the token system

**Date:** 2026-09-19
**Scope:** `packages/core/src/ui-theme.css`, `apps/web/app/layout.tsx`, `packages/core/src/brand/mark.ts`, design docs
**Status:** Done — scoped deliberately; see "What was not changed" below

## What this is

A full brand-guidelines sheet was supplied directly by the user: the
WonderHome logo, app icon, an exact colour palette (Primary Blue `#0EA5E9`,
Accent Green `#22C55E`, Warm Yellow `#FBBF24`, Navy `#0F172A`, Light Gray
`#E5E7EB`), typography (Sora, for every type role — heading, body, caption),
mockups and brand-usage examples — with the instruction to apply it
everywhere. Kept at `design/WonderHome-brand-guidelines.png`, the same way
the earlier logo source was, so any value below can be checked against it or
redone.

This is the third time this identity has arrived in this repo. The logo
itself — a house in two strokes, a leaf past the roofline, a four-pane
window — was already traced into vector geometry in an earlier session
(`docs/progress/2026-09-19-brand-mark.md`) from a different, lower-resolution
composite. This sheet is the same identity, now with the exact palette and
typeface spelled out as hex values and a named font rather than implied by a
mockup screenshot.

## What was built

**Colours moved through the token system, not file by file.** WonderHome's
whole visual system is ~30 CSS custom properties in
`packages/core/src/ui-theme.css` that every component reads — that is what
"update everywhere" means for a token-driven design system: change the
token, not the 300 files that reference it. Converted:

| Token | Was (hue) | Now | Source swatch |
|---|---|---|---|
| `--wh-primary` (+ hover/soft/glow, both themes) | teal, H190 | `oklch(0.5 0.12 237)` | Primary Blue `#0EA5E9` |
| `--wh-attention` (+ soft, both themes) | amber-orange, H60 | `oklch(0.72 0.16 82)` | Warm Yellow `#FBBF24` |
| `--wh-handled` (+ soft, both themes) | green, H155 | `oklch(0.62 0.13 150)` | Accent Green `#22C55E` |
| `--wh-foreground` (light) | navy, H255 | `oklch(0.25 0.05 262)` | Navy `#0F172A` |
| `--wh-gradient-primary`, and the primary-hued stop in `--wh-gradient-page` / `--wh-gradient-hero` (both themes) | H180–200 | rotated to H237–247 | Primary Blue |

Every value was converted from the supplied hex to OKLCH by an actual
sRGB→OKLab→OKLCH transform (not eyeballed, not a colour picker's rounding),
and every semantic token's *lightness* was chosen by measuring contrast
against the surface it is actually used on — `--wh-primary` against white
(it fills buttons with white text), `--wh-attention` and `--wh-handled`
against the cream page (they are almost always icon or text colour, not a
fill) — and matched to within a few hundredths of what the *existing* token
already scored, rather than importing the swatch's own marketing lightness
verbatim. A brand board's swatch is tuned to look right in a palette chip;
a button needs the *hue* from that swatch and whatever lightness holds
4–6:1 contrast, which is sometimes a very different number. Both were
computed with the same conversion math, checked programmatically, not
picked by eye.

**Typography moved from Inter to Sora**, wired exactly the way Inter was:
self-hosted through `next/font/google` (the CSP allows `font-src 'self'`
only, so no external font request was ever an option), one CSS variable
(`--font-sora`, was `--font-inter`), `display: swap`. `--wh-font-sans` in
`ui-theme.css` now resolves to Sora first. Because the whole product reads
that one variable for its sans-serif stack, this is a one-line change with
full reach — no component sets its own font-family.

**The tagline changed.** The sheet shows `A happier home. Everyday.` under
the lockup and again in a footer mockup; the product's old tagline
(`Happier Homes. Brighter Tomorrows.`) is gone from every place it lived:
`brand/mark.ts`'s `TAGLINE` constant (which `components/ui/brand.tsx`
already renders under the wordmark, so this one edit reaches the header,
the signed-out frame and the landing page), the manifest's `description`,
the root layout's `<meta description>`, and both places
`design/UI-UX-REQUIREMENTS-v3.md` names it as the approved copy.

## What was not changed, and why

Three deliberate scoping decisions — stated here so a future session does
not silently redo or second-guess them:

1. **The mark's own geometry and gradients (`brand/mark.ts`) are
   untouched.** That trace was pixel-measured off real artwork at 322px
   already (see the earlier brand-mark note). This sheet's own renditions
   of the logo are smaller and more compressed than that source. Re-tracing
   against a worse source risks producing a *less* faithful mark than the
   one already on disk, for a mark that already visually matches this
   sheet's identity (same house-in-two-strokes-plus-leaf concept, same
   rough colour family). Confirmed unaffected: `npm run brand -- --check`
   still reports all 9 generated assets current, because nothing the
   generator reads changed.
2. **The Light Gray swatch (`#E5E7EB`) was not adopted for any surface.**
   `CLAUDE.md`'s design principle 1 and `DESIGN-NOTES.md`'s visual-language
   table are explicit and were written for exactly this situation: warm
   cream, never grey, never pure white for the page. The sheet's own mockups
   render on a warm cream background too — a brand board's neutral swatch is
   for print and generic UI chrome, not licence to cool down the one thing
   this product is deliberately warm about. `--wh-background`,
   `--wh-surface`, `--wh-border`, all unchanged.
3. **Domain accents (`--wh-tone-*`: money, school, people, home, care,
   meals, ai) are unchanged.** They are WonderHome's own internal
   categorisation system — a bill is money-coloured, a lesson is
   school-coloured, wherever it appears — and this brand sheet does not
   speak to them at all. Refreshing the *brand* palette and leaving the
   *domain* palette alone keeps them visually distinct from the primary
   action colour, which if anything is a small improvement: before this
   change `--wh-tone-home` (H200) and `--wh-primary` (H190) were close
   enough to be confusable; now they are not.

## What was verified

- `npm run typecheck` — clean
- `npm run brand -- --check` — 9/9 generated assets still current (mark
  geometry untouched)
- `npx vitest run --root packages/core` — 1036/1036 passing, unaffected
  (no logic changed, only CSS tokens and a font import)
- `npm run lint`, `npm run lint:boundaries`, `npm run lint:secrets` — clean
- `npm run security` — 9/9 P0 areas passing
- `npm run build` — clean build from an emptied `.next`, so the new font
  import was actually exercised, not served from a stale cache
- `npx playwright test --project=desktop` — 126/126 passing, including the
  sign-in screen's own brand assertions (they check structure, not the
  literal tagline string, so they were never coupled to the old copy)
- The running app screenshotted at `/` and `/sign-in`: Sora renders (visibly
  distinct geometry from Inter), the new blue is on every commit action
  ("Get Started Free", "Sign In"), the new tagline is under the wordmark,
  the warm cream page and the mark's own multi-hue gradient are both
  unchanged, exactly as scoped

## Still open

- **Small-scale contrast spot-checks beyond primary/attention/handled** —
  every token that changed was checked against its actual, most common
  usage surface, but a handful of rarer combinations (e.g. attention text
  directly on a coloured card rather than cream) were not individually
  re-audited pixel by pixel.
- **No re-trace of the mark against this sheet.** If the sheet is later
  confirmed to be a materially better source than
  `design/WonderHome-logo-source.png` (higher resolution, no compression
  artefacts, isolated from the poster composite), that trace is real,
  scoped work of its own — see the earlier brand-mark note's own
  "Traced, not eyeballed" section for what it takes.
- **No Open Graph image**, unchanged from before — still deliberately left
  for a `opengraph-image.tsx` route using the app's own font at build time.

## Where

`packages/core/src/ui-theme.css`, `packages/core/src/brand/mark.ts`,
`apps/web/app/layout.tsx`, `apps/web/public/manifest.webmanifest`,
`CLAUDE.md`, `design/DESIGN-NOTES.md`, `design/UI-UX-REQUIREMENTS-v3.md`,
`design/UI-MOCKUP-IMPLEMENTATION-SPEC.md`,
`design/WonderHome-brand-guidelines.png` (new, checked in).
