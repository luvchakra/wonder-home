# The company site is a Platform admin setting, empty by default

**2026-11-23.** Fixes the red nightly E2E `landing › every footer link goes somewhere that exists`
(mobile and desktop): the footer linked to https://wonderapps.biz, which answers 402
DEPLOYMENT_DISABLED because the `wonder-apps` Vercel project is disabled (owner: "Wonder-Apps
will remain disabled for now"). The test stays strict; the product changed.

## What changed
- New Platform admin setting **Company website** (`WONDERHOME_COMPANY_SITE_URL`, Integrations →
  Email, https only, operator-editable, no default). Reader: `companySiteUrl()` in
  `packages/core/src/config/contact.ts`.
- Landing footer (`apps/web/app/_screens/landing-classic.tsx`): "WonderHome is a product of
  WonderApps" links to the setting when set, otherwise to the in-app equivalent,
  `/legal#who-we-are` ("Who runs WonderHome, and how to reach us").
- Terms (`apps/web/app/legal/page.tsx`): WonderApps is linked when set, plain text otherwise; the
  sentence reads the same either way, with no gap or stray separator.
- Grep of pages, emails, help words and the PWA manifest found no other link to the company site
  (the rest is `home.wonderapps.biz`, `connect@wonderapps.biz` or the WonderJobs host check). The
  help guide only names `connect@wonderapps.biz`, so no help words changed.
- Settings search: none added. `settings-search/registry.ts` indexes household Settings only and
  states that nothing there is a platform-admin screen.

## Verified
- `packages/core/src/config/company-site.test.ts`: the setting's shape, the reader, and a gate that
  no page hard-codes `href="https://wonderapps.biz…"`. Platform settings tests pass.
- Typecheck, ESLint on the touched files, `npm run build -w apps/web`, `npm run check:bundle`.
- `npm run test:e2e -- e2e/landing.spec.ts`: 26 passed (mobile and desktop).

## Open
- When WonderApps is back, save its address under Platform admin → Integrations → Email →
  Company website; the links return without a deploy.
