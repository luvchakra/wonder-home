# Home's family and househelp rows open in place, and say more

**Date:** 2026-09-20
**Area:** Home (`/`)

## What was done

The chevron on every row in "Family status" and "Househelp" now points
**down**, not right, and clicking a row opens it in place to show that
person's own responsibilities — instead of navigating to `/family?member=…`,
a query the Family screen has never actually read (flagged as a follow-up in
the previous Home redesign's progress note). The chevron was promising
navigation it did not deliver; now it promises exactly what happens, and the
info that navigation was supposed to lead to is one tap away instead of a
dead end.

Both cards are also enriched, all from data already fetched by other
screens rather than anything invented:

- **Family status** — a row now says the role, whether the person has not
  yet joined or is inactive, and how many responsibilities they carry
  (`"Head of Family · 2 responsibilities"`). Opening it lists what they own
  (icon, title, autonomy level, cadence — the same three facts the
  Responsibilities screen shows) and what they back up.
- **Househelp** — a row now shows the engagement type and start date
  collapsed, plus an "Expected today" / "Away today" / "Not today" badge —
  the same computation `/househelper` makes from `member_availability` and
  `availability_exceptions`. Opening it shows the weekly day strip, what
  they look after, and the next planned absence if there is one.

## Where the code lives

- `packages/core/src/components/ui/expandable-row.tsx` (new) — the shared
  disclosure row: `summary` and `children` are already-rendered JSX, so a
  Server Component can hand it finished markup without crossing the
  server/client function-prop boundary. `aria-expanded` / `aria-controls`
  are wired properly; the chevron's rotation respects
  `prefers-reduced-motion` (`motion-reduce:transition-none`).
- `apps/web/app/_screens/home-dashboard.tsx` — reads the same
  `responsibilities` (joined to `playbook_items` for the title and cadence)
  and `helper_profiles` / `member_availability` / `availability_exceptions`
  tables the Responsibilities and Househelper screens already read, and
  renders each row through `ExpandableRow`. The helper-specific queries only
  run when the household actually has a helper.
- `apps/web/app/_lib/cadence.ts` (new) — `cadenceLabel`, extracted out of
  `household/responsibilities/page.tsx` so Home and Responsibilities read a
  cadence's `unit`/`frequency`/`every` shape the same way instead of two
  copies drifting.
- `design/DESIGN-NOTES.md` — `ExpandableRow` added to the shared kit table.

## Verified

- `npm run typecheck`, `npm run lint` — clean.
- `npm run test` — 1250 unit tests across 91 files, plus 43 node tests.
- `npm run build` — clean; confirmed the temporary preview route used below
  is not in the route list.
- `npm run test:e2e` — 256 pass.
- **Measured in a real browser** (Chromium, since `/` needs a session this
  environment has no credentials for): built a temporary route with fixture
  data shaped like the real cards, then confirmed — chevron points down by
  default and rotates 180° on open; `aria-expanded` toggles correctly;
  opening reveals the responsibilities/activities content and collapsing
  removes it again; no horizontal overflow at 360px, and a wrapping value
  ("since 12 Jan 2025" beside a badge) wraps to a second line rather than
  clipping (rule 15); under `prefers-reduced-motion: reduce` the chevron's
  transition duration collapses to effectively instant. The route was
  deleted immediately after and is not part of the shipped app.

## Still open

- `/` itself is still only verifiable against a live session, same as every
  Home change in this session's notes.
