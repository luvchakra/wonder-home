# A second brand sheet: indigo/emerald palette, a new house-and-heart mark

## What happened

A new brand-guidelines image was supplied as the base, replacing the first
one (`design/WonderHome-brand-guidelines.png`, archived as `-v1.png`):
a different palette (Primary `#6366F1` indigo, Secondary `#10B981` emerald,
Accent `#F59E0B` amber, Warm `#F472B6` pink, Neutral `#1F2937`, Light
`#F8FAFC` — which turn out to be Tailwind's own indigo/emerald/amber/pink/
gray/slate-50 swatches exactly), a solid-ink wordmark instead of the earlier
rainbow, and a new app icon: a rounded gradient tile, a white house
silhouette, and a heart cut from its centre. The sheet also names and gives
iconography for three "Core Experiences" — HomeTalk (purple speech bubble),
HomeBrain (teal brain), HomeSend (orange paper plane) — which line up with
the naming already landed in the HomeTalk/HomeBrain rename (PR #75) and the
still-to-build HomeSend intake channel (Phase C).

## What shipped

- **`packages/core/src/brand/mark.ts`** rewritten: `HOUSE_PATH` (a single
  filled silhouette, not the old two-stroke roof-and-leaf), `HEART_PATH`
  (cut from the house's centre), one `GRADIENTS.tile` spec (indigo into
  emerald) replacing the old three-gradient set. `WordmarkTone` collapsed to
  one value (`"ink"`) — `WORDMARK_LETTERS` keeps its per-letter shape so
  `Wordmark` and the share-card generator needed no structural change, just
  a one-entry palette instead of four.
- **`components/ui/brand.tsx`** rewritten to match: `BrandMark` now draws its
  own opaque tile (gradient rect, white house, heart in the same gradient)
  instead of reading `--wh-brand-surface` from whatever it sits on — the new
  mark needs nothing from its background, so `Card`'s `--wh-brand-surface`
  redeclaration was removed as dead weight.
- **`scripts/build-brand-assets.ts`** rewritten to render the new geometry;
  `npm run brand` regenerated all 10 on-disk assets (icons, maskable
  variants, apple-touch-icon, the OG share card). The light/dark icon pair
  (`icon.svg` / `icon-dark.svg`) now renders identically — the new tile is
  opaque and self-contained, so it no longer needs a surface-aware variant —
  but the pair stays because `layout.tsx` still picks between them by
  `prefers-color-scheme`.
- **`packages/core/src/ui-theme.css`**: `--wh-primary` moved to indigo
  (`--wh-primary`/`-hover` use indigo-600/700, not the sheet's own indigo-500
  — computed and checked at 6.08:1 / 7.65:1 against the cream page, since
  `--wh-primary` is used as direct text/icon colour for the active nav state
  as well as a button fill, and the sheet's own indigo-500 is 4.47:1 against
  white, just under AA; the exact sheet hex is used only in the mark's own
  gradient, which carries no text). `--wh-attention` moved to amber-700,
  `--wh-handled` to emerald-700, same reasoning. `--wh-tone-ai` (the
  assistant/HomeTalk violet used on the Help page's "Ask the guide" tile,
  the FAQ icons) was already close to this palette's family and left alone.
  `--wh-gradient-primary`/`-orb`/`-hero`/`-page` hues nudged from the old
  blue (237) to the new indigo (277) for visual cohesion with the mark.
- **`packages/core/src/brand/mark.test.ts`** rewritten for the new
  invariants (house stays in the viewBox, heart sits inside the house and
  centred under the roof, gradient stops still run 0→1 in hex) — the old
  file asserted properties of the two-stroke geometry (seam alignment, halo
  width) that no longer apply.
- **CLAUDE.md** and **`design/DESIGN-NOTES.md`**'s "The brand mark" section
  updated to describe the current mark and palette; DESIGN-NOTES gained a
  new "A second brand sheet" entry documenting this pass the same way the
  first rebrand's own entry documents that one, rather than rewriting
  history.

## Two things deliberately left alone

- **The tagline's exact wording and punctuation.** `Less mental load. More
  family time!` stays as-is — the new sheet's casing differs only trivially
  (`Less Mental Load, More Family Time!`), and the string is hand-typed in
  around eight files (landing, nav drawer, auth layout, `more/page.tsx`,
  `script-accent.tsx`, the landing mockups) plus asserted in e2e tests. A
  punctuation-only sweep across that surface was not worth the risk for a
  cosmetic difference nobody would notice side by side.
- **The warm-cream page/surface system (design rule 1).** The sheet's
  "Light" swatch (`#F8FAFC`) is a UI-chrome reference the same way the first
  sheet's Light Gray was — not a licence to cool the page background down.
  `--wh-background`/`--wh-surface`/etc. are untouched.

## Verified

- `npm run verify`'s full gate: typecheck, lint, boundaries/embeds/secrets/
  migrations lint, tracker check, security suite (9/9 areas), 1336 unit
  tests (including the rewritten `mark.test.ts`), `npm run brand -- --check`
  (10 files current), production build, 239 DB/RLS tests, 256 e2e — all
  green.
- **Live-browser-verified** at 360px and desktop, signed out and signed in
  (QA household, deleted afterward): the landing page, the sign-in screen's
  illustrated panel and lockup, the authenticated app shell's sidebar and
  mobile bottom tab bar (active state correctly indigo per design rule 3),
  and the Help page's "Ask the guide" tile (correctly a distinct violet, not
  primary indigo — confirming rule 3's "domain/assistant colour stays its
  own, only the active/committing colour is Primary" held through the swap).

## What's still open

- HomeTalk/HomeBrain/HomeSend's own dedicated tile colours (purple/teal/
  amber per the sheet's "Core Experiences" panel) are not yet CSS tokens —
  HomeTalk already has a real consumer (`--wh-tone-ai`, left alone as it
  already reads violet); HomeBrain and HomeSend have no dedicated UI surface
  yet to carry a colour, so no tokens were invented speculatively. When
  Phase C (HomeSend) ships a real UI surface, it should reach for amber
  (`--wh-attention`/`--wh-tone-meals` family) to match the sheet; a future
  HomeBrain surface should reach for emerald (`--wh-handled`/`--wh-tone-care`
  family).
- The sheet's phone mockups show a "Health" domain and a "Today at a glance"
  quick-action grid that do not match this app's actual five-tab IA or
  domain list — those are illustrative marketing renderings, not a request
  to add a Health module or restructure navigation, and neither was touched.

## Where the code lives

- `packages/core/src/brand/mark.ts`, `mark.test.ts`
- `packages/core/src/components/ui/brand.tsx`, `card.tsx`
- `packages/core/src/ui-theme.css`
- `scripts/build-brand-assets.ts`
- `apps/web/public/{icon*,apple-touch-icon,og}.{svg,png}` (generated)
- `design/WonderHome-brand-guidelines.png` (replaced), `-v1.png` (archived)
- `design/DESIGN-NOTES.md`, `CLAUDE.md`
