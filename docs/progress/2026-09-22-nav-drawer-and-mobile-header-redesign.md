# Nav drawer and mobile header redesign

**Date:** 2026-09-22
**Trigger:** Two reference sheets from the user — the nav drawer/"More" menu, and the mobile header + bottom tab bar — with an explicit "redesign the sidebar exactly like this" plus a follow-up "make the navbar and bottom bar like this, raise the tagline font size by 1 point."

## What was done

**Nav drawer** (`packages/core/src/components/shell/nav-drawer.tsx`):

- Opens with a warm hero banner — `wh-gradient-hero` + `LeafDecor` + `HomeIllustration` + the brand `Wordmark` (with its tagline) + a `ScriptAccent` line — the same recipe `auth-layout.tsx`'s signed-out panel and the landing hero already use, reused rather than re-invented.
- The old pill-shaped "A happier home together" link to Certification became a proper card: `IconTile` + title + subtitle ("Plan. Organize. Share. Enjoy.") + chevron, matching every other row's shape.
- Regrouped from two sections (Household, Manage) into five, matching the reference: Family & People, Food & Essentials, Home & Lifestyle, AI & Smart Tools, Manage. New `groupSecondaryNavigation()` in `navigation/secondary-navigation.ts` (a new `group` field on every `SecondaryNavItem`, plus `SECONDARY_GROUP_ORDER`/`SECONDARY_GROUP_LABELS`) buckets an already-filtered list into these labelled sections in a fixed order, dropping any section that's empty for the current viewer.
- `/more/page.tsx` now also reads `groupSecondaryNavigation()` instead of its own ad hoc `domains`/`admin`/`personal` split, so the drawer and the full page can never disagree about which item lives in which section (DESIGN-NOTES already documented this as an invariant — it just wasn't code yet for more than two groups).
- Dropped the standalone avatar/identity row the drawer used to open with — the reference has no equivalent, and `Settings & Profile` is still one tap away inside Manage, so nothing became unreachable.

**Mobile header** (`packages/core/src/components/shell/mobile-header.tsx`):

- The centred wordmark now shows its tagline (previously icon-only — `<Wordmark size={26} />` with no `tagline` prop at all).
- Per the explicit ask, the tagline is sized up from the shared default (0.5625rem) to 0.65rem in this one place, and rendered sentence-case rather than the shared uppercase/tracked style, both via a new `taglineClassName` override on `Wordmark` (see below) — sentence case reads closer to the reference and is also meaningfully narrower for the same visual weight, which mattered once the fitting problem below turned up.
- Switched the centred mark from absolute positioning to in-flow flex centering. The absolute approach ("centre on the whole bar regardless of what the neighbours weigh") predates the tagline; once the tagline made the mark wider, it had no awareness of the bell/avatar cluster beside it and rendered on top of it — confirmed live, not guessed. In-flow centering within the flexible middle column can't overlap a sibling by construction; a `max-w-[…] truncate` cap on the tagline is the remaining safety net for a genuinely too-narrow phone.

**`Wordmark`** (`packages/core/src/components/ui/brand.tsx`) gained an optional `taglineClassName` prop, merged over the default classes via `cn()` (`twMerge` under the hood, so `normal-case` genuinely replaces `uppercase` rather than losing a source-order fight) — lets one call site resize/reflow its tagline without touching every other `Wordmark` in the app (the drawer's own banner tagline, and the landing/auth-layout ones, are untouched).

## What was found and fixed along the way

Two real bugs, both caught only by actually rendering the pages, not by reading the diff:

1. **The drawer's hero banner was collapsing to a ~36px sliver**, with the tagline and the script line invisibly clipped. Root cause: the banner is a flex item inside the drawer's `flex flex-col` column, sitting above a `<nav>` with `flex-1`. Per the flexbox spec, a flex item's *automatic* minimum size is `0` the instant its own `overflow` isn't `visible` — so the `overflow-hidden` banner had no floor, and the sibling's `flex-1` won the fight for space every time. Fixed with `shrink-0` on the banner. Left a comment in the component explaining the mechanism, since it's a non-obvious trap any future `overflow-hidden` box in a flex column in this kit can fall into the same way.
2. **The mobile header's tagline overlapped the avatar/bell cluster** once it started rendering at all — the absolute-centering trick (see above) had no way to know the tagline made the mark wider than the icon-only version it was built for. Fixed by moving to in-flow flex centering plus a bounded, truncating tagline width.

A separate, unrelated build-breaking bug surfaced and was fixed first: an early draft of the banner's doc comment contained the literal text `` `pt-[env(...)]` `` (describing a Tailwind class in prose) — Tailwind's content scanner picked that comment text up as a real candidate utility and tried to compile `padding-top: env(...)`, which is invalid CSS and crashed the whole dev server with a 500. Rewritten to describe the change in plain English instead of a fake class-shaped string.

## What was verified

- `npm run verify` — typecheck, lint, security suite, unit, database/RLS, build, 344 e2e — green.
- `secondary-navigation.test.ts` (4 tests, unchanged assertions) still passes — the new `group` field and `groupSecondaryNavigation()` helper are additive, and nothing in the existing permission-filtering tests depends on the old two-section grouping (confirmed via a targeted repo search before making the change: no unit or e2e test exercises the drawer's rendered structure, section labels, item order, or the identity row at all).
- Live browser verification with a QA household at 360px and 390px: opened the drawer via the hamburger, confirmed the hero banner (wordmark, tagline, script line, illustration) renders at full height with no clipping, confirmed all five grouped sections and their items match the reference sheet exactly (including which items land in which group), confirmed the Manage section (Notifications, Manage Household, Settings & Profile), Get Help and Log out. Checked the mobile header at both widths: tagline visible and fully readable at 390px, ellipsis-truncated (not overlapping) at 360px. Confirmed the bottom tab bar (raised gradient HomeTalk mic, active-tab pill, all five primary destinations) already matched the second reference sheet closely from earlier work and needed no changes. QA household and auth user removed afterward; dev server stopped.

## What's still open

- `apps/web/app/more/page.tsx` now groups the same way the drawer does, but its own visual treatment (domain-card grid per section, a separate list-style Manage card) wasn't changed to match the drawer's row style — that wasn't asked for and the two screens have always looked different from each other.
- The desktop sidebar (`PrimaryNav`'s `variant="sidebar"` in `primary-nav.tsx`) still shows one flat "Household" section rather than the five new groups — neither reference sheet was of the desktop sidebar, and it has different space constraints (always visible, no need to collapse), so it was left alone rather than assumed.

## Where the code lives

- `packages/core/src/components/shell/nav-drawer.tsx` — the redesigned drawer.
- `packages/core/src/navigation/secondary-navigation.ts` — `SecondaryNavGroup`, `SECONDARY_GROUP_ORDER`, `SECONDARY_GROUP_LABELS`, `groupSecondaryNavigation()`, the `group` field on every item.
- `apps/web/app/more/page.tsx` — reads the same grouping helper.
- `packages/core/src/components/shell/mobile-header.tsx` — the in-flow centred, tagline-bearing mark.
- `packages/core/src/components/ui/brand.tsx` — `Wordmark`'s new `taglineClassName` prop.
- `design/DESIGN-NOTES.md` — "The nav drawer" section, extended with the new banner, the grouping helper, the flexbox `shrink-0` gotcha, and the tagline-width/absolute-vs-flex-centering notes.
