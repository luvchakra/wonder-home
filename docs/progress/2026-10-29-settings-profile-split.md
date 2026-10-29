# Settings split into Profile (personal) and Settings (app/household), and the drawer shows Settings again

**Date:** 2026-10-29
**Owner request.** Two linked changes: (1) split the one Settings landing into
a personal **Profile** page and an app/household-level **Settings** page, one
editor per setting (design rule 23); (2) make the drawer's **Settings** item
visible as the last menu item, with the botanical imagery beneath the complete
list, not over it.

## What changed

### Change 1 — Profile / Settings split
The single `/settings` landing used to carry everything (profile card plus
Language & Region, Notifications, Voice, AI, Privacy, Location, Connections,
Plan, and — for Admins — a "You / Household" tab with Manage Household). It now
splits in two, by the rule *personal to the signed-in person → Profile;
configures the app or the household → Settings*:

- **`/settings/profile`** (new route; door = avatar menu). Only the person's own
  things: the identity card (name, nickname, date of birth, gender, photo, work)
  and the preferences that are theirs alone — **Language & Region**,
  **Notifications**, **Privacy & security** (their data use, export and
  deletion), **Location sharing** — plus sign out.
- **`/settings`** (door = sidebar foot / drawer). Everything that configures the
  app or the household: **AI Assistant** and its autonomy, **Voice**,
  **Connections**, **Plan**, and — for Admins — the household sections
  (Manage Household, address, activity) rendered inline. The old `You/Household`
  tabs are gone; the household sections render directly for Admins.

Section editors were **moved, not rewritten** — each sub-page
(`/settings/notifications`, `/settings/privacy`, …) is unchanged and is linked
from exactly one of the two landings, so rule 23 (one editor per setting) holds.
The avatar menu's "Profile" now points at `/settings/profile`; the "edit my
profile" pill on a Family member card and HomeTalk's `profile` screen point
there too. HomeTalk gained a `profile` screen (`/settings/profile`) and its
`settings` screen now describes the app level; `reply-format` lists both.

No route-policy change was needed: everything outside the public allowlist is
`authenticated` by default, so `/settings/profile` is gated like the rest.
Old deep links keep working — `/settings?tab=household#…` still lands on
`/settings`, whose household sections carry the same anchors.

### Change 2 — Settings back in the drawer, imagery beneath
The drawer (`nav-drawer-panel.tsx`) had **filtered the Settings item out**
entirely (its old door was the account menu, M7). Since the account menu is now
Profile, Settings had no door in the drawer — the list ended at HomePlaces and
the `flex-1` imagery filled the space where Settings belonged. Fixes:
- The filter is removed, so Settings is the last item of the **Manage** group.
- The imagery footer changed from `min-h-0 flex-1` to `min-h-24 flex-1`: it
  still grows to fill leftover space when the menu is short, but it no longer
  competes with the list — when the menu is tall the list keeps its height and
  scrolls to the last item (Settings), and the imagery holds a modest ~96px band
  at the foot instead of squeezing a menu item off screen.

## Verified
- core + web `typecheck`; ESLint on changed app files; `lint:help-links`;
  `check:bundle`; `npm run build -w apps/web` (route table shows
  `/settings/profile`).
- Unit tests: i18n parity (`translate.test`, new keys in all 8 languages),
  `screens.test` (new `profile` screen href allowlisted), full `conversation`
  suite, `navigation` + `components/shell`.
- Live render at 360 px, signed in as a QA household (deleted after): the
  drawer shows **Manage → Settings** as the last item with the imagery beneath
  it and no horizontal overflow; the avatar → Profile page shows only the
  personal sections; the sidebar → Settings page shows the app/household
  sections; no section appears on both. Measured across viewport heights
  560–950 px: Settings always visible or reachable by scroll, imagery always
  below the list.

## Open / follow-ups
- `design/UI-SIMPLIFICATION-v1.md` M6 (You/Household tabs) and M7 (avatar =
  Settings) are superseded by this split; annotated inline.
- The now-unused `settingsHome.tab.you` / `settingsHome.tab.household` keys are
  left in place (harmless; removing them is churn across 8 languages).

## Where the code lives
- `apps/web/app/settings/page.tsx`, `apps/web/app/settings/profile/page.tsx`
- `packages/core/src/components/shell/nav-drawer-panel.tsx`,
  `viewer-menu-content.tsx`, `packages/core/src/navigation/secondary-navigation.ts`
- `packages/core/src/conversation/screens.ts`, `reply-format.ts`
- i18n: `nav.item.profile`, `profileHome.lede`, `settingsHome.group.privacy`,
  `settingsHome.group.assistant` (base + `areas/settings`, all 8 languages)
