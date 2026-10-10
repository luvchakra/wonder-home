# Install banner on phones and tablets (story 00-011)

**Date:** 2026-10-10

## What was done
A band at the very top of the page invites somebody on a phone or tablet to
install WonderHome — in one tap where the browser allows it — and only when the
browser can really install it and it is not installed on that device.

- **Who sees it** (`packages/core/src/pwa/install-eligibility.ts`, a pure
  function with a unit test per platform):
  - Chromium on Android phones and tablets (Chrome, Edge, Samsung Internet…):
    only after `beforeinstallprompt` fires. Install calls `prompt()` and awaits
    `userChoice`.
  - iOS and iPadOS — Safari, and Chrome/Firefox/Edge on iOS 16.4+, which offer
    "Add to Home Screen" in their share sheet: "How to" opens the two steps in
    place (Share glyph drawn inline, then "Add to Home Screen").
  - Nobody else: desktops (touchscreen or not), Firefox on Android, in-app
    browsers (Instagram, Facebook, LinkedIn, Android WebView…).
  - Never while running installed (`display-mode` standalone, fullscreen,
    minimal-ui or window-controls-overlay, or iOS `navigator.standalone`), never
    when `getInstalledRelatedApps` reports this app (and not while it is still
    answering, so it never flashes).
- **Remembered** under `wonderhome:install-banner` in `localStorage`, every
  access wrapped: installed (`appinstalled`, an accepted prompt, or iOS "I've
  added it") → never again on that browser; "Not now" or a declined prompt →
  14 days. Blocked storage still shows and closes the banner, it just cannot
  remember.
- **Capturing the event early.** `use-install-prompt.ts` listens at module
  load, and the root layout renders `InstallPromptCapture` so that module runs
  on every page before any screen mounts. No inline script was added.
- **Where it shows.** Above the header and in the flow (pushes the page down,
  takes the top safe-area inset): `AppShell` (every signed-in screen),
  `AuthLayout` (sign-in, sign-up, password reset, welcome, invitation), the
  landing page, Help signed out and the legal page. Not on the voice-assistant
  linking consent (`offerInstall={false}`), the auth callback (no page), the
  setup wizard (one task at a time, no chrome) or in print.
- **Design.** The brand mark (same geometry as the manifest icons), the name,
  one line of benefit ("Open it from your home screen — full screen, one tap
  away." — nothing about offline or notifications, which the app does not
  offer), Install in Primary Blue (or "How to"), and a 44px close. Slides open
  once per page load (`wh-banner-in`), not at all under reduced motion.
  `role="region"` with a name, `lang`/`dir` of the reader, never takes focus.
- **Words** in all eight catalogs (`i18n/messages/areas/install/*`); Arabic
  lays out right to left. Hindi and Marathi quote "Add to Home Screen" in
  English, as the existing HomeSend install steps do.
- **The existing hook, fixed.** `useInstallPrompt` kept its API but now treats
  every installed display mode as installed, recognises an iPad posing as a Mac
  as iOS, lets the event go after one prompt whatever the answer (a second
  `prompt()` on the same event throws), and records an install.
- **Manifest.** Added `id` (`/`, the same identity Chrome already derived from
  `start_url`), `scope`, `lang`, `dir`, `related_applications` naming its own
  absolute manifest URL (`https://home.wonderapps.biz/manifest.webmanifest`)
  and `prefer_related_applications: false`. Icons were already complete (192,
  512 and a maskable 512). No screenshots: the repo has no real captures of the
  app, only mockups. The root layout now writes `apple-mobile-web-app-capable`
  as well as Next's `mobile-web-app-capable`; title, status-bar style and
  apple-touch-icon were already there. No service worker was added.

## Verified
- `npm run typecheck`, `npm run lint`, `npm run lint:boundaries`, `npm run test`
  (206 files, 3018 tests, including 18 eligibility and 3 label tests).
- `npm run build`, then Playwright against the production server:
  `e2e/install-banner.spec.ts` 10 passed (synthetic `beforeinstallprompt` on a
  Pixel 7 → banner above the header → Install → stubbed prompt → hidden and
  remembered; Not now snoozes 14 days; declined prompt snoozes; blocked
  storage; Arabic right to left; iPhone Safari two steps and "I've added it";
  desktop shows nothing; manifest), plus shell, landing, auth and help specs.
- Screenshots at 390px of the Android, iOS (closed and open), Arabic and Hindi
  banners, looked at by eye.

## Open / needs a person
- The signed-in placement was checked in code and by type, not in a browser:
  this session had no Supabase project to sign in to.
- A native speaker should read the new strings in hi, mr, es, fr, de, ar, zh.
- iOS cannot report an install from a Safari tab; "I've added it" is taken at
  its word. `getInstalledRelatedApps` only answers on the production origin
  (the manifest names `home.wonderapps.biz`), so previews always ask.
- Help still says the app is installed from the account menu or HomeSend; it
  could mention the banner too.

## Where the code lives
`packages/core/src/pwa/` (eligibility, hook, labels),
`packages/core/src/components/shell/install-banner.tsx` and
`install-prompt-capture.tsx`, `wh-banner-in` in `ui-theme.css`,
`apps/web/public/manifest.webmanifest`, `e2e/install-banner.spec.ts`.
