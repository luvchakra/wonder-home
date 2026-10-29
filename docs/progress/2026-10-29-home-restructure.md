# Home restructure (2026-10-29)

Owner request, one PR:
- Removed the "Your household" domain grid from Home.
- Moved the green "WonderHome handled" card to the bottom of Home, just above the closing quote.
- Removed Family status, Pets and Househelp from Home. The Family tab already had those cards; it now also shows each member's responsibilities count and each househelper's "Expected today / Away / Not today" badge.

Code: `apps/web/app/_screens/home-dashboard.tsx`, `apps/web/app/family/page.tsx`, shared reads in `apps/web/app/_lib/family-reads.ts`. Home now reads pets, responsibilities and helper availability only for Admins, for guided setup.
Help: `today-and-home` body 5 rewritten in all eight languages; section `updated` bumped.

Verified: typecheck, ESLint on changed files, `_lib` and family unit tests, `npm run build -w apps/web`. Not run: `ui-check.mjs` at 360 px, because this container has no `apps/web/.env.local` and so no QA sign-in. The owner should check Home and Family on a phone. No migration.
