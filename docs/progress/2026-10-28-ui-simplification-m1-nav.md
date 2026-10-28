# UI simplification, part 1: doors, the More menu, one Notifications page (00-013)

**Date:** 2026-10-28 · **Design:** `design/UI-SIMPLIFICATION-v1.md` (approved by the owner the same day, D1–D6 as recommended)

## What was done
- **More menu (M8):**
  - The groups went from Family & People, Food & Essentials, Home & Lifestyle, AI & Smart Tools and Manage to **Family & People, Home & Food, Smart tools and Manage**, in all eight languages.
  - Notifications is no longer a menu item; the header bell is its door.
- **Doors (M7):**
  - More's profile card is Settings' door, so Settings is no longer also listed under Manage or in the phone drawer.
  - The account menu no longer links to HomeBrain; More does.
- **Notifications (M1):**
  - Settings → Notifications now ends, for Admins, with **Household notifications**, the form that was at `/household/notifications`, and **Notification delivery**, the report that was at `/household/delivery`, as one row that opens in place.
  - Both old URLs redirect permanently (`next.config.ts`).
  - Manage Household's Notifications row links to the new section.
  - HomeTalk's "open notifications" still works: the screen is listed directly, since it left the menu.
- **Help:** the notifications section and the FAQ now say Settings → Notifications → Household notifications / Notification delivery, in all eight languages.

## Verified
- Typecheck and lint pass; the touched unit tests (navigation, screens, i18n, help, shell) all pass; the production build passes.
- Browser check on a QA household on the live project, at 360 px and 1280 px, with no horizontal overflow:
  - More shows the four headings.
  - Settings → Notifications lists the household sections, and the delivery row opens to the per-channel counts.
  - Both old URLs return 308 to their anchors.

## Open
- 00-014 to 00-016 follow (people and calendar, Connections, Settings tabs and a single setup wizard).
- The QA account and household are deleted when the last part merges.
