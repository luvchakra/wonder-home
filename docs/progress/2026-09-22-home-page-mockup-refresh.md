# Home page: greeting header, Today's focus and Family moment redesign

## What was done

Reformatted the top of Home (`apps/web/app/_screens/home-dashboard.tsx`) to
match a two-part mockup sent this session, and fixed an unrelated clipped
tagline the same session flagged along the way.

**Header.** Replaced the date-pill header with:
- A greeting block: `{greetingFor()}, {firstName}!` (bold), "You're doing
  great!" (a plain encouragement, never a data-derived claim — rule 9), and
  the existing lede.
- A new `FamilyIllustration` (three figures + a heart, same inline-SVG,
  design-token discipline as `HomeIllustration` — rule 8) beside a
  speech-bubble `ScriptAccent`: "Happier Homes Happier Humans!".
- Three quick pills: a new `AddTaskMenu` dropdown (real links to each
  domain's own add flow — homework, grocery item, a meal plan, a bill —
  never a new add path invented here) and shortcuts to HomeTalk (`/ai`) and
  HomeSend (`/home-send`). Neither pill is a new door to the assistant
  (rule 13): both already are primary-nav/secondary-nav destinations, this
  only shortcuts to them.

The previous date pill is gone; Today is still one tap away in the primary
tab bar, so nothing it offered is lost.

**Today's focus + Family moment.** Changed from a `sm:grid-cols-2` pair to
two full-width stacked cards (rule 19: primary information is never one of
a pair). Today's-focus rows now carry a colour badge instead of the row's
action pill in the collapsed view — "Needs attention" (risk/attention tone)
for a high/medium-risk item, otherwise the item's own domain colour and
name ("Grocery", "School", …) via a small `DOMAIN_BADGE` map keyed off
`DomainSummary["key"]`, built from `householdAgenda()`'s already-computed
`agenda.domains` (a `domainBySubject` lookup, no new evaluation). The real
action stays reachable inside the row's existing chevron detail — this
declutters the always-visible summary line without hiding anything.
`AgendaExpandableRow` grew an optional `badge` prop for this (backward
compatible: every other call site is unaffected, since the prop is
optional and only Home passes it).

Family moment, when there is a next moment, now also shows a "Plan
together" pill on the calendar row, an add-member "+" affordance beside the
avatar group (links to `/family`, which already owns adding a member), and
a `ScriptAccent` "More family time!" line — matching the always-there
warmth the empty state already had.

**Your household.** Curated the domain-tile grid to the six everyday
domains, in mockup order (Responsibilities, School, Meals, Groceries,
Bills, Home & Upkeep) — Househelper, Health and HomeSend keep their own
surfaces (a Home card, and a header pill, respectively) rather than
repeating in this grid. Updated three `purpose` strings in
`secondary-navigation.ts` to match the mockup's copy: Groceries → "Always
be stocked", Meals & Recipes → "Plan, cook, enjoy", Home & Upkeep → "A
well-kept home" (these strings are shared with the sidebar and the More
page, so the new copy is consistent everywhere, not just on Home).

**Left untouched:** the stat-card grid (`ExpandableMetricGrid`), the
Family status card, the Househelp card and the "WonderHome handled" card.
The user's ask was "update matching section of home page according to
attached" for the bottom image — a targeted update to Today's focus and
Family moment, not a request to remove working, previously-shipped
sections the mockup crop simply didn't include.

**Unrelated fix, same session:** the nav drawer's hero banner tagline
("LESS MENTAL LOAD. MORE FAMILY TIME!") was truncating to "LESS MENTAL
LOAD. MORE…" under the close button — `Wordmark`'s `taglineClassName`
override there capped it at `max-w-[10rem]` with `truncate`. Removed the
width cap and reduced the tagline to `0.4375rem`/`0.08em` tracking (down
from the shared default) so the whole line fits without wrapping or
clipping (rule 15). The header's own larger tagline
(`mobile-header.tsx`) was a separate, already-reasoned, already-documented
tradeoff from an earlier session and was left as is.

## Bug caught and fixed before shipping

`AddTaskMenu` is a Client Component; the first pass passed a raw lucide
icon component reference through its `AddTaskOption.icon` prop from server
code in `HomeDashboard`. Same class of bug as an earlier
`ExpandableMetricGrid` fix this session: React refuses to serialize a
function/class across the Server→Client boundary
("Functions cannot be passed directly to Client Components…"), which
crashed the whole page. Fixed by changing `AddTaskOption.icon` to
`ReactNode` and pre-rendering each option's `<IconTile>` in the server
component before handing it to the menu.

## Verified

- `npm run typecheck` (both workspaces) and `npm run lint` (web) — clean.
- Live browser QA via `scripts/qa-test-user.mjs`, a real signed-in
  household created through `/welcome` (never the SQL-shortcut path,
  since onboarding itself needed exercising), at 360px, 390px and desktop
  (1440px):
  - Header, illustration + speech bubble, and all three pills render
    correctly; `AddTaskMenu` opens and lists all four real add-flow links.
  - Today's focus renders its empty state correctly with no seeded
    notable items; Family moment renders the enriched non-empty state
    (date box, "Protected" badge, "Plan together" pill, avatar row + add
    button, script line) once a real `family_events` row existed.
  - "Your household" grid shows the six curated tiles with the new copy,
    two-per-row on a phone.
  - Confirmed the nav-drawer tagline fix renders the full line, no
    truncation, at 375px.
- `npm run verify` (full gate: typecheck, lint, migrations/embeds/
  boundaries/secrets lint, tracker check, brand check, security suite,
  unit tests, DB tests, build, e2e) — see the commit this note ships with
  for the result.

## Still open

- Today's-focus and Family-moment badge/enrichment code was exercised
  structurally (no crash, correct empty states, correct domain-key
  lookup) but not against a genuinely high/medium-risk notable item or a
  meals/shopping-domain item live in the browser — seeding one hits the
  same `school_items`/`obligations` check-constraint set a previous
  session already worked through, and the component logic itself mirrors
  `agenda-expandable-row.tsx`'s own existing `RISK_TONE` mapping, so this
  is a low-risk gap, not an unverified code path.
- No migration in this change — nothing here touches the schema.

## Where the code lives

- `apps/web/app/_screens/home-dashboard.tsx` — header, Today's focus,
  Family moment, Your household.
- `apps/web/app/_components/agenda-expandable-row.tsx` — the new optional
  `badge` prop.
- `packages/core/src/components/ui/add-task-menu.tsx` (new),
  `packages/core/src/components/ui/family-illustration.tsx` (new).
- `packages/core/src/components/ui/pill.tsx` — `Badge`'s five new
  domain-coloured tones.
- `packages/core/src/navigation/secondary-navigation.ts` — updated
  `purpose` copy for groceries/meals/upkeep.
- `packages/core/src/components/shell/nav-drawer.tsx` — the tagline fix.
- `design/DESIGN-NOTES.md` — kit entries for `AddTaskMenu`,
  `FamilyIllustration` and `Badge`'s new tones.
