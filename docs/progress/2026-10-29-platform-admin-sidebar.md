# Platform admin: sidebar menu and Back to WonderHome (2026-10-29)

Owner request: replace the top tab strip of `/platform-admin` with a menu, and add a way back to WonderHome.

## Done
- `apps/web/app/platform-admin/menu.ts`: one typed `PLATFORM_MENU` (Overview, Performance, Careers connection); the next staff page is one more entry (plus its icon in `menu-shell.tsx`). `platformMenuFor(can)` filters by capability and returns items without the capability.
- `menu-shell.tsx`: left sidebar on desktop; on a phone a hamburger opening a slide-in drawer (Radix Dialog, the main drawer's pattern, the one `Wordmark`). Tinted `IconTile` rows; current page via the shared `currentNavHref`, so `aria-current` is right on nested routes. "Back to WonderHome" (arrow-left, links to `/`) leads the sidebar and the drawer on every platform-admin page. Staff role shown under the title.
- `layout.tsx`: staff gating unchanged (server-side `platformStaff`, 404 otherwise); still one await.

## Verified
- `npx vitest run apps/web/app/platform-admin` (menu config, capability filtering, current highlight for each and nested route, Back target): 10 passed.
- tsc and ESLint clean for the area; `npm run build -w apps/web` and `npm run check:bundle` green (the menu imports no server-only code).

## Open
- Not checked in a browser: this container has no `apps/web/.env.local` / Supabase credentials, so no signed-in staff session. The owner checks it on a phone (open Platform admin, open the menu, tap each item and Back to WonderHome).
- The pages' words are English-only today, so the menu follows suit; no catalog entries added.
