# Help, added to the landing page's own navigation

**Date:** 2026-09-19
**Scope:** `apps/web/app/_screens/landing/header.tsx`, `e2e/help.spec.ts`
**Status:** Done

## What was missing

The landing page already linked to `/help` twice — in the "Read the guide"
contact card and in the footer's More column — but the header navigation
carried none of it: `NAV` was six in-page anchors (`#why`, `#features`, …) and
nothing that left the page. A visitor who did not scroll to the footer had no
way to find the guide from the header at all.

## What changed

`Help` joins the header nav, kept structurally apart from the anchor list
(`GUIDE`, not folded into `NAV`) because it behaves differently: every other
item scrolls within the page, this one navigates away, and it needs a real
`<Link>` rather than an `<a href="#…">`. It is styled in the primary teal
rather than the neutral nav colour, so it reads as the one item that takes you
somewhere rather than to another part of the same page. It appears in both the
desktop nav and the mobile menu (above Sign In), matching where every other nav
item already appears in each.

## Confirming it needs no login

This was mostly confirming work already done stood up under an actual click,
because the interesting risk was not the link — it was whether `/help` still
silently required a session by the time a visitor reached it. `/help` was
already made public in the previous session (removed from
`AUTHENTICATED_PREFIXES`, given an optional-session render path). What this
pass adds is the end-to-end proof that clicking through from the marketing
surface itself, not just navigating to `/help` directly, never touches
`/sign-in`.

Two new specs in `e2e/help.spec.ts`:

- Clicking **Help** in the landing header (desktop nav or, on mobile, the
  opened hamburger menu) lands on `/help` with the guide rendered, and no
  main-frame navigation to `/sign-in` occurs in between. Checked via
  `framenavigated` on the main frame rather than every network response,
  because Next prefetches other on-screen links (Sign In among them)
  regardless of what was actually clicked — counting all responses produced a
  false positive from that prefetch alone.
- Clicking **User guide** in the footer does the same.

## What was verified

- `npm run typecheck`, `lint` — clean
- `npm run lint:secrets` — passed, 464 files
- `npm run test` — 1021 passing, unchanged (this pass added no unit tests)
- `npm run security` — 9/9
- `npm run build` — succeeded
- `npx playwright test` — 240 passing (2 new, both projects)
- **Driven in a browser**: screenshotted the desktop header (Help visible,
  styled distinctly) and the opened mobile menu (Help above Sign In)
