# Platform admin in the avatar menu (2026-10-29)

**Ask (owner):** "add Admin menu here for allowed users", in the avatar dropdown.

**Done:** a "Platform admin" row (Lucide `ShieldCheck`, 44 px) after Get Help in the avatar menu, linking to `/platform-admin` (the staff area from #492, whose page title is "Platform admin"). It is labelled "Platform admin", not "Admin", so it cannot be mistaken for the household Admin role in the menu header.

**How it is gated**
- The server decides. `buildSession` (`apps/web/app/_lib/session.ts`) asks `isPlatformStaff()` (`_lib/platform-staff.ts`, React `cache()`, `operations.read`, the same gate as the area's layout) inside its existing `Promise.all` wave: no extra serial await, no household data cached.
- Staff get `viewer.platformAdmin = { href, label }`; everyone else gets no such field. The client menu (`viewer-menu-content.tsx`) holds neither the URL nor the label, only renders what the server sent, so a non-staff page carries nothing about it. `check:bundle` is green and `/platform-admin` is in no client chunk.
- Hiding the link is convenience: `/platform-admin` still 404s for non-staff (layout + per-page capability checks).
- Label `nav.platformAdmin` is in all eight catalogs.

**Verified:** `platform-staff.test.ts` (staff, no `platform_admins` row i.e. member/child/household Admin, signed out, no leakage in the client menu or session shape), i18n tests, typecheck, lint, build, `check:bundle`. No QA sign-in or 360 px browser pass was run in this container, so the row's look on a phone is for the owner to confirm.

**Open / needs a person:** the `platform_admins` row for the owner must exist first (the SQL the coordinator gave them); then open the avatar menu and confirm "Platform admin" appears and opens the admin page.
