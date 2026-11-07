# New one-page landing, and the Landing page setting (2026-11-07)

**Owner request:** a one-page landing like WonderWorks' for signed-out visitors, with a portal switch back to the old one.

## What was done
- **New landing** (`apps/web/app/_screens/landing-new.tsx`): server-rendered, no client JS of its own. Header, hero with one call to action and the one handwritten line, how it works (3 steps), what it does (8 features that exist today), trust, FAQ (native `<details>`), closing call to action, footer. All words in `areas/landing/*` in eight languages, in the visitor's language (`visitorLocale`). Title/description come from the catalog (`generateMetadata` in `app/page.tsx`); Open Graph still comes from the root layout. No invented testimonials, prices or numbers; bills copy says WonderHome never pays.
- **Classic landing** moved unchanged to `landing-classic.tsx` (export renamed `ClassicLanding`; service-role baseline path updated).
- **Setting `landing.variant` (`new` | `classic`, default `new`)**: `public.platform_settings` (+ append-only `platform_setting_events`), migration `20261107200000_platform_settings.sql`. Public read (only presentation switches), written only through `platform_setting_set` (service role), called after `platformStaff("settings.manage")` (operator and owner). Read through `packages/core/src/platform/settings.ts` and the per-server platform cache (`platform_settings`, TTL 30 s; a save clears the instance at once). Portal page: **Platform admin → Landing page**.
- `?landing=classic|new` on `/` previews either page without changing the setting (used by the e2e suite).
- `scripts/ui-check.mjs` accepts `PLAYWRIGHT_CHROMIUM_PATH`.

## For the portal-redesign session (session_01R5Xz6Zp6Af3YRBi7khGsgQ)
The typed registry had not merged when this was built, so this is the smallest equivalent. To fold it in: register `landing.variant` (enum `new|classic`, default `new`, capability `settings.manage`) in the registry, make `landingVariant()` in `app/page.tsx` read through its accessor, move the editor into the Configuration section, then delete `platform/settings.ts`, `platform-admin/landing/`, and (after copying existing rows) the two tables. Do not build a second settings system.

## Verified
Typecheck, ESLint on changed files, `lint:migrations`, `lint:service-role`, `check:bundle`, `budget:bundle`, build, unit tests (settings, staff-only audited action, both variants chosen, i18n completeness in 8 languages, platform-cache policy proof), Playwright landing-new/landing/install-banner/shell specs. `ui-check`: no overflow at 360 px, call to action above the fold at 360 and 1280 for both variants. `e2e/help.spec.ts:124` (HomeSend guide words) fails on guide words this change does not touch (not verified on `main`).

## Open
Owner to open the page signed out on a phone and judge the look. The WonderWorks repo could not be attached in this session, so structure follows the request's section list, not a side-by-side with that page.
