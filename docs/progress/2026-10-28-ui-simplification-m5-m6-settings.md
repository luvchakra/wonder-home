# UI simplification, part 4: Settings with You and Household tabs, one setup (00-016)

**Date:** 2026-10-28 · **Design:** `design/UI-SIMPLIFICATION-v1.md` M5 and M6. This completes the design.

## What was done
- **Settings → Household** (`/settings?tab=household`), a second tab for Admins only, holds what Manage Household, its Address and Activity pages, and the setup walk-through held:
  - where setup stands;
  - the household's links;
  - the playbook, policies and AI autonomy, now with their **add forms beside their lists** (before, these lived only in the walk-through);
  - **Teach WonderHome**;
  - the home address;
  - the activity record.
- The tab is never rendered for anyone else; every action still checks again on the server.
- **Redirects:**
  - `/household`, `/household/address` and `/household/activity` redirect (308) to the tab and its anchors.
  - `/household/setup` redirects each `?step=` to that step's editor: Family, Responsibilities, the playbook, policies or teach anchors, or Connections.
  - `/onboarding` is the one guided setup.
- **Navigation:**
  - Manage Household leaves the menus; More now has only its three domain groups.
  - HomeTalk's "manage household" and HomeBrain's place list point at the Household tab.
  - The setup progress card's door and every revalidation follow it there.
- **Kept, decided while building:** AI Assistant and Voice stay two pages. They hold different keys (Gemini Live and Google speech), and AI data sharing already had one editor. This is recorded in the design.
- **Help:** "Manage Household" in all eight languages now reads Settings → Household (Activity under it), and "Manage Household → Responsibilities" now reads Responsibilities. Each touched section's `updated` date is bumped. `docs/design-principles.md` rule 23 lists the new Settings rows and tab.

## Verified
- Typecheck and lint pass; 116 unit test files (1720 tests) pass; `lint:help-links` passes; the production build passes.
- Browser check on a QA household on the live project, at 360 px and 1280 px, with no overflow:
  - Both tabs render.
  - The Household tab shows setup, the four link groups, the playbook, policies, autonomy, Teach WonderHome, the address and the activity record.
  - More shows only Family & People, Home & Food, Smart tools and Help.
  - `/household`, `/household/address`, `/household/activity` and `/household/setup` (with and without a step) land where they should.

## Cleanup
- The QA account and household made for this work are deleted after the merge. The outcome is recorded in the session's final report.
