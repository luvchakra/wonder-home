# The full menu, as a drawer — a hamburger, and a "More" that no longer leaves the page

**Date:** 2026-09-20
**Scope:** `packages/core/src/components/shell/nav-drawer.tsx` (new), `primary-nav.tsx`, `mobile-header.tsx`, `app-shell.tsx`, `ui-theme.css`
**Status:** Done — verified by typecheck, lint, build and the full E2E suite; **not** verified in a live authenticated browser session (see below)

## What this is

Direct user request: "create a sidebar to show all menus, submenus, auto
collapsed by default. hamburger menu should appear at top left. should also
open on tap of more at bottom right."

Read literally against what already existed: the desktop sidebar
(`PrimaryNav variant="sidebar"`) already shows every primary area and every
household domain, permanently, at every desktop width — there has never been
anything to collapse there, and no "More" button exists on desktop at all
(the "bottom right" More the request names is specifically the mobile bottom
tab bar's fifth item). So this is a mobile feature: the phone gets the
sidebar's equivalent — the full menu — as a drawer that starts closed, opens
from a new hamburger at the top left of the header, and also opens when
"More" is tapped, instead of "More" navigating to the separate `/more` page
it always has.

## What was built

`packages/core/src/components/shell/nav-drawer.tsx` (new):

- **`NavDrawerProvider`** — a small client-side context (`open`/`setOpen`)
  wrapping `AppShell`'s content. `useState(false)` is the entire
  "collapsed by default" guarantee: nothing calls `setOpen(true)` on mount,
  so the very first paint is always closed, on every device.
- **`NavDrawerTrigger`** — the hamburger. Dropped into `MobileHeader`'s
  leading slot, replacing the brand mark there (the drawer's own header
  carries the wordmark instead) — `lg:hidden`, since desktop's sidebar is
  unaffected and has nothing to collapse.
- **`MoreTabButton`** — replaces the bottom tab bar's "More" `<Link
  href="/more">` with a button that opens the same drawer. Every other tab
  is unchanged; `/more` itself is untouched and still a real, directly
  linkable route (still reachable from `ViewerMenu`'s "Everything else" and
  by direct URL) — only the tab bar's own entry point to it changed.
- **The drawer itself** — a Radix `Dialog`, anchored to the left edge, full
  height, sliding in via a new `wh-slide-in-left` keyframe (`ui-theme.css`,
  registered in the same `prefers-reduced-motion` block every other motion
  primitive in this kit already is). Content: every primary area (Home,
  Today, AI, Family — not "More" itself, since opening it is what More just
  did), then "Household" (the domain list), then "Manage" (admin,
  notifications, settings), then Help — the exact same `secondary` list and
  the exact same grouping `/more` already uses, filtered server-side before
  either ever sees it (rule 9: presentation only, never authorization).

Reused rather than duplicated: `SidebarLink` (already proven in the desktop
sidebar; gained an optional `onClick` so a drawer link can close itself on
navigate, and a `size="lg"` variant for a full 48px touch target on a
touch-only surface), and the `ICONS`/`SECONDARY_ICONS` maps already built
for the sidebar (now exported instead of re-declared).

## What was verified

- `npm run typecheck`, `npm run lint`, `npm run lint:boundaries`,
  `npm run lint:secrets` — clean
- `npx vitest run --root packages/core` — 1066/1066 passing, unchanged (no
  pure logic changed — this is composition and markup)
- `npm run security` — 9/9 P0 areas passing (unaffected; no new
  authorization surface, no new data read — the drawer renders the same
  already-filtered `secondary` prop `AppShell` already received)
- `npm run build` — succeeds
- `npx playwright test --project=desktop` **and** `--project=mobile` —
  126/126 passing on both, unaffected (every existing test is a signed-out
  scenario — gating, headers, the landing page — none of which touch
  `AppShell`, so this is evidence of "nothing broke," not evidence the
  drawer itself opens and closes correctly)

## What was not verified, and why

**The drawer's own interactive behaviour — opening from the hamburger,
opening from "More", the correct nav tree rendering, closing on
navigate — was not exercised in a live browser against a real signed-in
session.** Every route that renders `AppShell` is gated behind sign-in, and
this session's local Postgres has no seeded test household; the only way to
reach one is a real sign-up against this project's actual, live Supabase
instance. That was attempted, and hit a real `over_email_send_rate_limit`
partway through (after an earlier attempt was rejected outright for an
invalid-looking email domain) — a genuine external constraint, not a defect
in the change. Continuing past that would have meant either retrying
against a live auth provider already signalling back off, or forging a
confirmed session by writing directly into `auth.users` on a live,
shared project — both judged disproportionate to a UI verification and
were not done.

What stands in place of that: every element the drawer is built from was
already proven correct elsewhere in this exact codebase before this change —
`Sheet` already runs the identical Radix `Dialog` pattern (portal, overlay,
content, focus/escape/scroll-lock) for every other overlay in the kit;
`SidebarLink` already renders correctly in the desktop sidebar with the
identical props this reuses; `IconTile`/`Avatar`/`Wordmark` are all
long-proven. The new surface area is the composition and the open-state
wiring, not new interaction primitives.

**If this needs to be confirmed properly, the fastest path is a seeded test
household** — a fixture user with a confirmed `auth.users` row and a real
household, created once and reused, rather than a fresh sign-up per
verification. That doesn't exist anywhere in this repo today (grepped for a
seed script; there is none) and is worth having independent of this change.

## Where

`packages/core/src/components/shell/nav-drawer.tsx` (new),
`primary-nav.tsx` (`SidebarLink` exported with `onClick`/`size`, `ICONS`/
`SECONDARY_ICONS` exported, tab bar's "more" branch), `mobile-header.tsx`
(hamburger replaces the brand mark), `app-shell.tsx` (`NavDrawerProvider`
wraps the shell), `ui-theme.css` (`wh-slide-in-left`),
`design/DESIGN-NOTES.md` ("The nav drawer").
