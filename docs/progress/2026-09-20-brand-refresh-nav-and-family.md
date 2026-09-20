# The rainbow wordmark, a pictorial bottom bar, a colour-coded sidebar, and Family redone

**Date:** 2026-09-20
**Area:** Brand (`brand/mark.ts`, `ui-theme.css`), bottom tab bar, nav drawer, desktop sidebar, `/family`

## What was done

A new brand sheet replaced the previous one (`design/WonderHome-brand-guidelines.png`),
and this pass carries it through the wordmark, the bottom bar, the sidebar and
the Family screen — the four surfaces asked for by name, in the order they
were asked for.

### 1. The wordmark

"WonderHome" no longer reads as two colour blocks ("Wonder" in ink, "Home" in
blue). It now runs through the brand's rainbow letter by letter — blue,
yellow, blue, green, blue, yellow, then "Home"'s H and final e pulled to a
new Deep Navy (`#0F2D6B`) so the word still reads as one name rather than a
scatter of colour. `WORDMARK_LETTERS` in `brand/mark.ts` is the one list both
the live `Wordmark` component and the generated share card read, so the two
can never drift the way the old hand-duplicated Pango markup could have. The
colours themselves live as new `--wh-brand-letter-*` CSS tokens (light and
dark), replacing the now-unused `--wh-brand-home-from/to` gradient. The
tagline gained its exclamation mark — "Less mental load. More family time!"
— updated at its one source (`TAGLINE`) and in the handful of places that
restated it verbatim (`more`, the landing hero's script line, `layout.tsx`'s
metadata, now reading from `TAGLINE` directly instead of a fourth hand-typed
copy).

`Deep Navy` is a **wordmark accent only**, never a UI colour — the existing
body-text Navy (`#0F172A`, `--wh-foreground`) is untouched. Chasing the sheet's
`Sky Blue #0EA5FF` into the existing Primary Blue token was deliberately not
done: the two are a single hex step apart, almost certainly the same blue
rendered slightly differently by whatever produced the sheet, and the
existing token is already tuned to hold 4.5:1 contrast — not worth the
regression risk for an imperceptible difference.

### 2. The bottom tab bar

Two of the five icons are now genuinely pictorial rather than a single flat
Lucide outline: **Today** is a calendar with a handled-green checkmark that
stays green whether the tab is active or not (the day being planned is a
fact independent of which tab you're looking at), and **Family** is two
people and a small pink heart, composed from three separate glyphs since no
built-in icon draws it in more than one colour. **More**'s icon changed from
an ellipsis to a 2×2 grid, matching what the sheet actually shows. Whichever
of the five is current now sits inside a soft rounded pill behind the icon
and label, not only a colour change — the raised Talk button is unchanged,
since it already had its own distinct treatment.

### 3. The sidebar (phone drawer and desktop rail)

`SidebarLink` gained an optional `tone` prop: every household-domain row now
shows a tinted `IconTile` instead of a bare glyph, using each domain's
**existing, already-established** tone — the same colour that domain's own
screen already uses elsewhere, not a new one invented to match the sheet
pixel-for-pixel. (Where the sheet's own swatch differs — Bills & Finance,
Househelper, Home & Upkeep, Notifications, Manage Household — repainting
those would mean changing that domain's colour everywhere it appears, not
just here, which is a bigger call than "update the sidebar" and wasn't
made.) Labels' capitalisation was brought in line with the sheet throughout
the app ("Home & Upkeep", "Manage Household", "Settings & Profile") —
metadata titles, page headings and the account menu, not only the drawer.

The drawer itself gained: a chevron on the profile row; a green "A happier
home together" pill linking to Certification (`/certification` — "what
WonderHome believes" was the closest existing surface to "how is the
household doing", chosen over pointing at Manage Household a second time,
which the Manage section below already does); the app's own `HomeIllustration`
alongside the one handwritten line this menu now carries; and a real
sign-out row. The sign-out itself moved to `identity/session-actions.ts` (a
shared server action) so the drawer's own form can post to the exact same
action `apps/web`'s sign-in flow already used, rather than a link that could
never legally do this (signing out is a POST, per the existing session
tests). No version number is shown — the workspace's own `package.json`
carries `0.0.0`, and showing that or a made-up `v1.0.0` would both be the
invented figure rule 9 forbids.

### 4. Family (`/family`)

- The header gained the same `HomeIllustration` corner, sized to fit at
  360px rather than hidden below a breakpoint (the ask included the
  illustration, so it needed to actually show up on a phone).
- A green banner opens the page: "A happier home starts with all of us!"
  with the day's one handwritten line, "Together Brighter Days!" — the
  **only** script accent on this screen (rule 2), which meant retiring the
  closing `QuoteCard` that would otherwise have been a second one.
- `PersonCard` now carries its person's tint as the whole card's background
  (`cardTintFor`, indexed identically to the avatar's own tint so a person
  is always the same colour), and the members list is a 2-column grid capped
  at two per row on a phone (rule 19) rather than a horizontal scroller —
  three or more members wrap to a new row instead of squeezing in.
- "Invite member" moved down to sit beside "Manage" under the section it
  belongs to, instead of the page's own header.
- Househelp rows gained a real "Add helper" pill (linking to
  `/household/members`, where `AddHelperForm` already lives) and an empty
  state for a household with none yet.
- "Family moment" is now a pink card with a heart tile, matching the sheet,
  but **keeps its real data** — the actual protected event's title and
  time — rather than the sheet's generic placeholder copy. The sheet's own
  quoted line ("It's not just a house, it's our happy place.") is shown only
  in the empty state, as an italic aside rather than a second script accent.
  It is not a link: there is nothing further on this screen to go to, and a
  chevron with nowhere to go would be exactly the dead control rule 10
  forbids.

## Where the code lives

- `packages/core/src/brand/mark.ts` — `WORDMARK_LETTERS`, `WORDMARK_COLORS`, `TAGLINE`.
- `packages/core/src/ui-theme.css` — `--wh-brand-letter-*` tokens, light and dark.
- `packages/core/src/components/ui/brand.tsx` — `Wordmark` rewritten.
- `scripts/build-brand-assets.ts` — the share card's wordmark now reads the same `WORDMARK_LETTERS`.
- `packages/core/src/components/shell/primary-nav.tsx` — `TodayTabIcon`, `FamilyTabIcon`, the active pill, `SidebarLink`'s `tone` prop.
- `packages/core/src/components/shell/nav-drawer.tsx` — profile chevron, the Certification pill, the closing banner, sign-out.
- `packages/core/src/identity/session-actions.ts` (new) — the shared `signOut`; `apps/web/app/(auth)/actions.ts` now re-exports it.
- `packages/core/src/components/ui/home-illustration.tsx` (moved from `apps/web/app/_components/`) — now shared, since the drawer needed it too.
- `packages/core/src/components/ui/person-card.tsx`, `avatar.tsx` (`cardTintFor`) — the tinted Family cards.
- `apps/web/app/family/page.tsx` — the banner, the grid, the restyled Household help and Family moment sections.
- `packages/core/src/navigation/secondary-navigation.ts`, `identity/views.ts`, `components/shell/viewer-menu.tsx`, and the `household`/`settings` page titles — label casing.
- `design/WonderHome-brand-guidelines.png` — replaced with the new sheet.

## Verified

- `npm run typecheck`, `npm run lint`, `npm run lint:boundaries`, `npm run tracker -- --check` — all clean.
- `npm run test` — 1250 unit tests across 91 files, plus 43 node tests.
- `npm run build` — clean.
- `npm run test:e2e` — 256 passing, including the sign-out-is-a-POST test.
- `npm run brand -- --check` — the regenerated share card matches what's on disk.
- **Measured in a real browser** (Chromium, since every screen touched needs a session this environment has no credentials for): built temporary routes with fixture data mirroring the real header, drawer, desktop sidebar and Family cards. Confirmed — the rainbow wordmark renders correctly in the header and the desktop sidebar; the bottom bar's Today/Family icons render two-tone as designed with no overflow; the active tab's pill shows correctly; the drawer opens with the chevron, pill, tinted domain tiles, closing banner and a sign-out that is genuinely inside a `<form>`; the desktop sidebar carries the same tinted tiles; the Family cards grid holds exactly two per row at 360px and 390px with no horizontal overflow, and the corner illustration is visible at both widths. All temporary routes were deleted immediately after and are not in the built route list.

## Still open / flagged deviations

- Five domains' sidebar tile colours (Bills & Finance, Househelper, Home &
  Upkeep, Notifications, Manage Household) use their existing app-wide tone
  rather than the new sheet's exact swatch — see above. A full tone
  reassignment, if wanted, touches those domains' own screens too, not just
  the sidebar.
- The sheet's five-icon marketing strip (Organise Daily Life / Keep Everyone
  in Sync / Never Miss What Matters / A Happier Home / More Family Time) and
  its "Happier Homes. Brighter Lives." corner script were not added anywhere
  — nothing asked for new landing copy, and the "one handwritten line per
  screen" budget was already spent by each screen's own accent.
- No screen in this pass was verified signed in, for the reason given above
  in every note this session — the harnesses stand in for it.
