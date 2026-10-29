# Nav "current page" is one helper (2026-10-29)

**Bug (owner, phone):** on `/settings/profile` (reached only from the avatar) the drawer and desktop sidebar highlighted Settings, because each matched by path prefix.

**Fix:** `navigation/current-nav.ts` `currentNavHref(pathname, items)`: longest matching href wins, query strings ignored, and an item may list `excludes` (Settings excludes `/settings/profile`). The drawer (`nav-drawer-panel.tsx`) and sidebar (`primary-nav.tsx`) use it, so `aria-current` follows the same answer. The bottom tab bar already uses `activeNavKey` (deepest match wins) and has no Settings tab, so it was not affected. Pathnames never carry a query, so `/meals?tab=recipes` and `/settings?tab=household` resolve to Meals and Settings.

**Verified:** `npx vitest run packages/core/src/navigation/current-nav.test.ts` (table: settings, profile, query forms, nested routes, siblings, longest-match). Typecheck and `ui-check.mjs` could not run: this container has no installed dependencies (`next`, `@types/node` missing; `use-primary-swipe-nav.test.ts` fails the same way on `main`).

**Open:** the owner checks the avatar → Profile view on a phone; no menu item should be highlighted.
