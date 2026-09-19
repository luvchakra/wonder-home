# The real logo, everywhere (brand mark)

**Date:** 2026-09-19
**Scope:** Design system — `packages/core/src/brand`, the shared kit, every icon on disk
**Status:** Done

## What was done

The placeholder mark — a house with a heart in it — is gone. The product now
uses the supplied WonderHome logo: a house drawn in two strokes, a roof chevron
running blue through teal to a warm green and a wave beneath it that reads as a
W, running blue through deep navy to coral and amber, with a four-pane window
under the apex and a leaf on a short stem growing past the roofline.

It replaces the old mark in the app header, the signed-out frame, the landing
page, the loading screen, the legal pages, the landing device mockups, and every
favicon and PWA icon.

## Traced, not eyeballed

The supplied art is a composite mockup: the main lockup sits on black with a
glow halo and compression artefacts, and the two app-icon tiles beside it are
only ~322px. Cropping any of it would have given fuzzy assets that cannot scale,
and the codebase already draws its mark as inline SVG.

So the mark was rebuilt as vector geometry, and rebuilt from measurements rather
than by eye. Every centreline, stroke width and gradient stop was read off the
light app-icon tile pixel by pixel — the roof's two arms meet at (31.55, 18.6)
because that is where the measured left and right edges intersect, not because
it looked about right. The rebuilt mark was then rendered back at 322px and
compared against the source until they matched.

The supplied artwork is kept at `design/WonderHome-logo-source.png` so the
tracing can be checked or redone.

## One geometry, three consumers

`packages/core/src/brand/mark.ts` holds the paths, widths and gradients.
`components/ui/brand.tsx` builds the JSX from it; `scripts/build-brand-assets.ts`
writes the files `apps/web/public` serves. Icons are the assets most likely to
rot — binary, far from the component they should match, and nobody notices a
stale one until it is on somebody's home screen — so `npm run brand -- --check`
re-renders everything and fails if disk and mark disagree. CI runs it.

Nine files are generated: light and dark `.svg` tiles, 192 and 512 PNGs in both
schemes, maskable 512s in both (carrying the padding the Android safe zone
needs, without which a launcher crops a circle through the roof), and the
`apple-touch-icon.png` Apple takes instead of reading the manifest.

## Light and dark

Two things flip with the theme, and only two.

**The halo.** Three of the mark's shapes are painted over a halo, which is what
produces the clean separations where the leaf, the stem and the wave cross the
roof. A halo has to be the colour of whatever the mark sits on, so it reads
`--wh-brand-surface` — the page background by default, with `Card` re-declaring
it as the card's own surface, so a mark inside a card gets the right halo
through CSS inheritance rather than a prop threaded through every screen.

**The window.** A deep blue pane on a dark background is a hole, not a window.
On dark it becomes the light blue the supplied dark tile uses.

Every gradient is unchanged between themes: they hold up against cream and
against navy alike. Verified by screenshotting the running app in both.

## Two judgement calls

**The landing feature cards no longer carry the mark as a watermark.** They had
a `BrandMark` at 40% opacity over the hero gradient. That worked when the mark
was a single-colour outline; a full-colour logo faded to 40% over a gradient
reads as a printing mistake. Those cards now carry `LeafDecor`, which is what
design rule 5 says a warm surface should be framed with.

**No Open Graph image.** The app has none, and generating one here would either
use DejaVu instead of Inter — sharp rasterises with whatever fonts the machine
has — or make the `--check` gate fail on any machine with different fonts. The
right home for it is a Next.js `opengraph-image.tsx` route using the app's own
font at build time. Left undone deliberately rather than shipped off-brand.

## Where the code lives

| Piece | Path |
|---|---|
| The geometry | `packages/core/src/brand/mark.ts` |
| Its invariants | `packages/core/src/brand/mark.test.ts` |
| The React mark and wordmark | `packages/core/src/components/ui/brand.tsx` |
| The asset generator | `scripts/build-brand-assets.ts` (`npm run brand`) |
| Theme tokens | `packages/core/src/ui-theme.css` |
| Generated icons | `apps/web/public/` |
| The rules it encodes | `design/DESIGN-NOTES.md`, "The brand mark" |

## What was verified

- `npm run typecheck`, `npm run lint`, `npm run lint:boundaries` — clean
- `npm run lint:secrets` — passed, 427 files
- `npm run test` — 861 passing across 64 files; 7 new in `brand/mark.test.ts`
- `npm run brand -- --check` — 9 assets current
- `npm run build` — succeeded
- `npx playwright test` — 202 passing
- The running app screenshotted at `/` and `/sign-in` in both themes, and the
  generated icons rendered at 16, 18, 24, 28, 32 and 48px

## Still open

- **An Open Graph image**, as above.
- **The wordmark is live text, not the supplied lettering.** "Wonder" takes the
  page's ink and "Home" carries the brand gradient, which matches the artwork
  closely in Inter but is not the same drawn letterforms. If the drawn wordmark
  matters, it needs the original vector file rather than a trace.
- **At 16px the mark is mushy**, as any mark with this much detail would be.
  The favicon is served as SVG so most browsers render it at device resolution;
  a simplified small-size variant is the usual answer if it ever matters.
