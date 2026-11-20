# Desktop sidebar: the WonderWorks layout in WonderHome's own look

**Asked (owner, 2026-11-20):** "for desktop view use sidebar design from wonderworks", with a screenshot of the WonderWorks sidebar. Layout, density and structure were taken from the screenshot; the WonderWorks repo could not be attached from this session, so no code or spacing was copied from it. Brand, fonts and colours stay WonderHome's own tokens.

## What changed (desktop, `lg` and up only)
- **Header:** the wordmark (tagline wraps under the name) with the notifications bell beside it.
- **Five areas:** Home, Calendar, HomeTalk, Family, More: outline icon and label, a soft tinted pill when current (no left bar any more).
- **Household list:** a thin divider, the "HOUSEHOLD" label, then compact rows (32 px) with 28 px tinted `IconTile`s in each domain's colour and a soft pill when current. Labels wrap, never ellipsise (rule 11).
- **Pinned foot:** Settings, then the user card (avatar, name, role · household). The card opens the same avatar menu as before, upward.
- **Scrolling:** only the household list scrolls between the five areas and the pinned foot (#558's behaviour kept), so every area stays on screen (rule 6).
- **No duplicates (rule 14):** the bell and the avatar menu are hidden from the desktop top bar, which keeps search (and a child's star count). One bell and one menu per size.

Phone and tablet (below `lg`), the nav drawer's rows and the platform-admin sidebar are unchanged.

## Code
- `packages/core/src/components/shell/primary-nav.tsx`: sidebar layout, `SidebarAreaLink`, `SidebarModuleLink`; `SidebarLink` (used by the phone drawer) unchanged apart from a shared `NewBadge`.
- `viewer-menu-face.tsx` (new): the menu's trigger face, `avatar` or `card`; `viewer-menu.tsx`, `viewer-menu-content.tsx` take `variant`.
- `mobile-header.tsx`: bell and avatar `lg:hidden`; `notificationsLabel` shared with the sidebar.
- `app-shell.tsx`: passes `viewer` to the sidebar.

## Verified
- `typecheck` for `packages/core` and `apps/web`; shell and navigation unit tests (64 passed).
- `scripts/ui-check.mjs` against a local, uncommitted preview page (no `.env.local` in the container, so no signed-in live check): 1280×600, 1280×900, 1440×900 no horizontal overflow; the bell sits in the sidebar header; the user card is pinned at the foot; at 1280×600 the household list scrolls (434 px of content in a 184 px region) and HomePlaces is reached by scrolling it; the menu opens above the card. At 360 px the header still has the bell and avatar and the tab bar the five areas.
- No E2E spec selects sidebar elements (`e2e/shell.spec.ts` only checks the signed-out page has no Primary nav), so none needed changing.

## Open
- The owner should look at the live sidebar on a real household at desktop width, especially a long name in the user card.
