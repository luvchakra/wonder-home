# Brand and design tokens

Reference detail moved verbatim from CLAUDE.md (2026-10-24, token-economy pass). The one-line rules stay in `CLAUDE.md` under *Design principles*. Read this file when you change brand marks, colours or tokens.

**The brand is the sheet at `design/WonderHome-brand-guidelines.png`.** The
name is WonderHome, one word, its wordmark set once in the brand's ink —
solid, not per-letter colour — (`WORDMARK_LETTERS` in
`packages/core/src/brand/mark.ts` is the one source for this, read by both
the live wordmark and the generated share card). The mark beside it is a
rounded-square tile carrying the brand's Primary-to-Secondary gradient
(indigo into emerald), a white house silhouette, and a heart cut from the
house's centre so the gradient shows through — its geometry lives in the
same module (the header renders it, `npm run brand` writes the icons from
it, CI checks they match). The tagline is "Less mental load. More family
time!" The palette is Primary `#6366F1` (indigo — every committing action
and the active nav state), Secondary `#10B981` (emerald — handled/success),
Accent `#F59E0B` (amber — attention), Warm `#F472B6` (pink, decorative/
available for a future domain accent), and Neutral `#1F2937` (body text),
expressed as the tokens in `packages/core/src/ui-theme.css` (the interactive
tokens use slightly deepened steps of Primary/Accent/Secondary for
guaranteed contrast against the cream page — the exact sheet hexes are
reserved for the mark's own gradient); the typeface is Sora. Never hand-draw
a second logo, paste a raster of it, or reach for a hex the tokens don't
carry.

Use the shared kit in `@wonderhome/core/ui/*` — no screen invents its own card,
row, pill or tile. A new pattern belongs in the kit, with a note in
`design/DESIGN-NOTES.md` saying which rule it encodes.
