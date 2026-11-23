# Every link stays on WonderHome's own site

**2026-11-23.** Fixes the red nightly E2E `landing › every footer link goes somewhere that exists`
(mobile and desktop). The footer linked to https://wonderapps.biz, which returns 402
DEPLOYMENT_DISABLED because the `wonder-apps` Vercel project is disabled. The owner: "don't
depend on WonderApps site, maintain all links on WonderHome own site". The test stays strict;
the product changed.

The first version of this PR added a "Company website" Platform admin setting. The owner's
revised brief drops it, so it was removed before merging.

## What changed
- Landing footer (`apps/web/app/_screens/landing-classic.tsx`): "WonderHome is a product of
  WonderApps" links to `/legal#who-we-are` ("Who runs WonderHome, and how to reach us").
- Terms (`apps/web/app/legal/page.tsx`): that section names WonderApps without linking it.
- Guard: `apps/web/wonderhome-links.test.ts` fails when `apps/web/app`, `apps/web/public` or
  `packages/core/src` carries an address on wonderapps.biz other than `home.wonderapps.biz`.
  One allowed exception: the WonderJobs API host in `careers/wonderjobs.ts`, which the server calls
  and nobody follows as a link. Checked against `main`'s Terms page: it fails as expected.

## The full inventory (grep across app, packages, public, docs)
- **Links to the company site:** the two above, the only ones. None in emails, the PWA manifest
  (it names only `home.wonderapps.biz`), `robots.ts`, structured data (job postings use
  WonderHome's own `/careers/<id>` address) or redirects. No new page was needed: Terms, privacy
  and contact already live on WonderHome (`/legal`, the landing page's `#contact`).
- **Help words:** they mention only the mail address `connect@wonderapps.biz` (the invite sender),
  not the site, so they are unchanged in all eight languages.
- **Mail-domain items, unchanged and left to the owner:** the invite and email sender
  `connect@wonderapps.biz` (SMTP user, "From" example in Platform admin, help words, comments);
  the web push contact `mailto:support@wonderapps.biz` (`WONDERHOME_VAPID_SUBJECT` default,
  `notifications/web-push.ts`); the HomeSend inbound mail domain `in.wonderapps.biz`; the contact
  address in the Open Food Facts user agent (`commerce/catalog-import.ts`,
  `scripts/catalog-pictures.ts`).
- **Not links, unchanged:** hosting records (`README.md`, `docs/hosting.md`, `CLAUDE.md`), the
  `LICENSE` copyright line (legal text is not changed without the owner), and an old migration
  comment.

## Owner to-do
- Decide on the mail-domain items above. They keep working only while mail for `wonderapps.biz`
  works, which is separate from the website.
- Careers calls WonderJobs at `jobs.wonderapps.biz` (an API, server side). If WonderJobs is off
  too, `/careers` says it is unavailable; it never links there.

## Verified
- `apps/web/wonderhome-links.test.ts` passes; typecheck; ESLint on the touched files;
  `npm run build -w apps/web`; `npm run check:bundle`.
- `npm run test:e2e -- e2e/landing.spec.ts`: 26 passed (mobile and desktop).
