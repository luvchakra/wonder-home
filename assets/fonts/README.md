# Sora, vendored

Sora is the brand's typeface (`design/WonderHome-brand-guidelines.png`). The
app loads it through `next/font/google`, which downloads it at build time —
but the share card (`apps/web/public/og.png`) is rendered by
`scripts/build-brand-assets.ts` with sharp, outside Next, where no font is
available unless one is on disk.

So these two files are committed. It makes the card deterministic: CI runs
`npm run brand -- --check`, and a build that reached out to Google Fonts
would be a build that renders a different card the day that request fails.

Sora is licensed under the SIL Open Font License 1.1 (`OFL.txt`), which
permits redistribution. Only the two weights the card uses are here.
