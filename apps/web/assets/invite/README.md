# Invitation postcard fonts

The postcard a chat app shows for an event's invite link
(`app/e/[token]/opengraph-image.tsx`) is drawn at request time, where
`next/font` is not available, so its faces are on disk here and traced into
that route (`next.config.ts`, `outputFileTracingIncludes`):

- `Sora-Regular.ttf`, `Sora-Bold.ttf` — the brand's typeface (copies of
  `assets/fonts/`), SIL Open Font License 1.1 (`OFL-Sora.txt`).
- `Caveat-Bold.woff` — the handwritten "You're invited!", Latin subset from
  the `@fontsource/caveat` package, SIL Open Font License 1.1 (`OFL-Caveat.txt`).

Other scripts (Devanagari, Arabic, Chinese…) are fetched from Google Fonts
for just the characters on the card; if that fails the card still renders.
