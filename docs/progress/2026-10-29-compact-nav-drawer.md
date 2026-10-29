# Compact navigation drawer — the whole menu on one phone screen

2026-10-29

## What was done and why

The owner asked for the phone "More" drawer to be vertically compact, so
every section and item is visible at once without scrolling. #424 (UI
simplification part 1) had already reduced the drawer to **12 items in 3
groups** (Family & People, Home & Food, Smart tools — Settings,
Notifications and Manage Household left the drawer) and moved the drawer
markup into its own lazy-loaded module `nav-drawer-panel.tsx`. But #424 kept
the original tall brand header and 48px rows, so on a 360px phone the list
still ran past the fold. This pass does the vertical-density work on top of
#424's structure.

Nothing removed: all groups, items, tinted `IconTile`s, domain colours,
grouping and warmth (gradient hero, faint `LeafDecor`, trimmed tagline, the
handwritten "A happier home together ❤") are kept.

## The change (presentation only — no i18n, no logic)

`packages/core/src/components/shell/nav-drawer-panel.tsx`
- **Header shrunk.** Padding `pt +1rem / pb-5` → `pt +0.5rem / pb-2`;
  illustration `w-44 opacity-80` → `w-28 opacity-70`; `LeafDecor` `130 / 0.3`
  → `96 / 0.25`; close button `size-10` → `size-9`; `ScriptAccent` `mt-4` →
  `mt-1`.
- **Header fixed, list scrolls.** `Dialog.Content` is now `overflow-hidden`
  and the `nav` is `overflow-y-auto flex-1`, so the shortest phones still
  reach every item without the brand header sliding away.
- **Tighter rhythm.** `nav` `mt-4 space-y-5 pb-6` → `mt-1 space-y-1 pb-3`;
  section header `mb-1.5` → `mb-0.5`; row list `space-y-0.5` → `space-y-px`.

`packages/core/src/components/shell/primary-nav.tsx`
- `SidebarLink size="lg"` (drawer rows only) `min-h-12` (48px) → `min-h-11`
  (44px) — still the accessible minimum touch target. The desktop sidebar
  uses `size="sm"` and is unchanged.

No string, label or icon changed; no tokens removed.

## Verified

- Typecheck (`@wonderhome/core` + `apps/web`) and `next build -w apps/web`
  pass; `npm run tracker` clean.
- `vitest` touched-area tests pass.
- **Signed-in browser check** on a throwaway household (production build),
  drawer opened, link boxes measured — see the numbers appended on the PR.

## Design principles kept

1 (warm, never clinical), 2/7 (the one handwritten line still closes the
header), 4 (tinted `IconTile` + name per row), 5 (faint botanical framing),
6 (every area present), 10 (no 360px horizontal overflow), 11 (no name
truncated), 13/14 (one door, one button per job).

## Notes

- QA test households created during verification are left in place: the
  owner asked that test households stay until launch (pre-launch testing is
  pre-authorised, `CLAUDE.md`). QA auth users are deleted after each run.

## Where the code lives

`packages/core/src/components/shell/nav-drawer-panel.tsx`,
`packages/core/src/components/shell/primary-nav.tsx` (`SidebarLink`).
