# A link that unfurls, and a Home you can actually tap

## The share card

Sharing a WonderHome link into WhatsApp showed a bare URL. The reason was
simple: **the site had no Open Graph metadata at all.** Nothing to unfurl.

Now `apps/web/public/og.png` is a 1200×630 card — the mark, the wordmark in
its two brand colours, and the tagline — and the root layout declares it,
along with an absolute `metadataBase`, `openGraph` and a Twitter
`summary_large_image`.

**The card is generated, not drawn.** `npm run brand` renders it from the
same geometry module the header draws from, so it cannot drift from the
mark, and `npm run brand -- --check` in CI fails if it has. That is the
discipline the icons already had; the share card is now under it too.

**Sora is vendored** in `assets/fonts` (two weights, ~46KB each, SIL OFL,
licence included). The app gets Sora through `next/font`, but the card is
rendered by sharp outside Next, where no font exists unless one is on
disk. Vendoring makes the card deterministic: a build that fetched from
Google Fonts would render a different card the day that request failed.

**The tagline is now "Less mental load. More family time."**, changed in
`brand/mark.ts` and everywhere that stated the old one, CLAUDE.md included.

## Home, made tappable

Seven changes, all the same underlying complaint — things that *were* links
did not look like links, and one thing that looked like an action was not
one.

| Change | What it was |
|---|---|
| Setup is one chevron row | A prominent block to read, even for households past their first week |
| The four counts link out | Read-only numbers. Now: Need you → Notifications, Handled → Today, Upcoming → Family, Checked → Certification |
| Family status is rows with chevrons | An avatar scroller — a picture of the family rather than a way into it |
| Househelp is its own card below | Helpers were filtered out of Home entirely |
| "Plan something" plans | It linked to the Family screen, leaving a person on a page still hunting for the form |
| Household tiles show arrows | They were already links, but nothing said so |
| Metric and domain cards gained hover colour and a focus ring | No affordance at all |

`NewEventForm` gained a `label`, so Home asks for the same sheet in its own
words rather than growing a second, navigating button (rule 14: one path
per job).

## What was verified

- `npm run typecheck`, `npm run lint` — clean.
- `npm run test` — 91 files passing.
- `npm run build` — succeeds.
- `npm run test:e2e` — 256 passing.
- `npm run brand -- --check` — assets current, 10 files.
- **In a browser at 360px**, measured: both grids still report exactly 2
  cards per row (rule 19), no horizontal overflow, nothing clipped, and 11
  of the 12 linked cards carry a chevron — the twelfth is a "See all" pill,
  which does not need one.

## What is still open

- **The share card has not been unfurled by WhatsApp itself.** The metadata
  is correct and the image is served, but WhatsApp caches aggressively and
  only fetches from a public URL. Worth pasting the production link into a
  chat once this deploys; if it shows the old bare URL, that is the cache
  and not the markup.
- **Home was not viewed signed in**, same limit as the previous Home
  change: `/` needs a real session and this environment has no credentials.
  The cards were verified with fixture data; the assembled page is covered
  by typecheck and build.
- The family rows link to `/family?member=…`. The Family screen currently
  ignores that parameter, so it lands on the list rather than that person.
  Honest and useful today, and a small follow-up to make it deep-link.

## Where the code lives

- `scripts/build-brand-assets.ts` — `shareCard()`.
- `assets/fonts/` — vendored Sora and its licence.
- `apps/web/app/layout.tsx` — `metadataBase`, `openGraph`, `twitter`.
- `packages/core/src/brand/mark.ts` — the tagline.
- `packages/core/src/components/ui/{metric-card,domain-card}.tsx` — the
  chevron and the clickable look.
- `apps/web/app/_screens/home-dashboard.tsx` — the screen.
- `apps/web/app/_components/new-event-form.tsx` — the `label`.
