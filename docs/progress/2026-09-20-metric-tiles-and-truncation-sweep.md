# Stat tiles stop cramming three into a row, and a wider truncation sweep

## What was done

The user sent a screenshot of Kids & School on a phone: three `MetricGrid`
tiles ("Need you", "Live work", "Checked") each cut to "Nee…", "Live …",
"Che…" because `MetricGrid` forced them into three columns
(`grid-cols-3`, no mobile override) on a 360–390px screen with no room for
the label. They asked for the fix, a new standing rule in `CLAUDE.md`, and
a wider check of the app for the same failure — checking the account for
`kunalc.iit@gmail.com` (an early, since-corrected guess at the user's own
email from earlier in this session; that address has no account in
production) against real data. The real seeded household is
`luvchakra@gmail.com`'s "Asmi Family": Kunal Chakrabarty (head), Asmi
Chakraborty (child), Rekha (helper), Upasana Chakraborty (administrator,
added in the previous activity) — used as the realistic-name yardstick for
this sweep.

### The MetricGrid fix

`packages/core/src/components/ui/metric-card.tsx` — `MetricGrid` now
starts at `grid-cols-1` (a full-width row per stat tile) on a phone, and
only widens into the previous multi-column layout at `sm:` and up
(`sm:grid-cols-3` for 3 metrics, `sm:grid-cols-2 lg:grid-cols-4` for 4+,
matching the original breakpoints). `MetricCard`'s label also dropped its
`truncate` class as a second line of defense. `StatChips` is a thin
wrapper over `MetricGrid` and needed no change of its own.

### CLAUDE.md rule 18

Added, in the user's own words about the underlying decision, not just
the one screen: a stat tile takes the width its label needs, and any new
row of small cards should fail the same test — if fitting them side by
side on a phone cuts a label, they don't go side by side on a phone.

### The wider sweep

Went through every remaining `truncate` in the codebase (the earlier
"still open" item from the previous activity's progress note) against
real entity data rather than guessing. Fixed genuine name/entity/value
truncation:

- `person-card.tsx` (name, role — this is the exact card the Family page
  uses for the strip of household members)
- `outcome-card.tsx` (`HandledList` item title/meta, `ResponsibilityCard`
  title/owner/AI-mode line)
- `calendar-item.tsx` (event title, the protected-time label alongside it)
- `timeline.tsx` (item title/meta)
- `setup-progress.tsx` (the compact milestone strip, and a completed
  step's title)
- `nav-drawer.tsx` and `viewer-menu.tsx` (viewer's own name and
  role/household line — a real person's name in both)
- `home-dashboard.tsx`'s "Family status" section (person name/role, and a
  responsibility title)
- `household/page.tsx` (each Manage-household section's `meta` line,
  which can carry the real household name and timezone; a policy's own
  `name`)
- `more/page.tsx` (viewer name/role line, the Manage-list rows' label and
  purpose text, and the Help row for consistency with the same row shape)
- `settings/page.tsx` (the signed-in user's own email; each
  preferences/privacy row's `meta`)
- `_components/pending-invitations.tsx` (an invitee's name and email —
  directly the shape of the invitation just approved for Upasana)
- `meals/page.tsx` (a recipe's name in the recipe grid, a planned meal's
  name)

Left alone, deliberately: `mobile-header.tsx`'s page title and
`primary-nav.tsx`'s sidebar label (both fixed, developer-authored short
vocabulary, never a person's or entity's name), `person-card.tsx`'s "now"
status pill (documented as a short phrase — "On leave", "Vet
appointment"), the landing page's illustrative mockup screenshots
(already established as a separate, marked-illustrative category, not
live product surface), and Groceries' horizontal-scroll suggestion
carousel chip (a fixed `w-24` item in a scroller, not a row competing for
width the way everything above is).

## Verified

`npm run typecheck`, `npm run lint`, `npm run lint:boundaries`: pass.
`npm run test` (workspaces): 82 files / 1129 tests pass. `npm run
test:e2e`: 252/252 pass. `npm run build`: clean production build. No test
asserted on any of the truncated markup, so nothing needed updating for
the removals themselves.

## Still open

Nothing outside the exceptions listed above still truncates a name,
label or value in the shipped app, based on this pass — a future addition
should hold itself to rule 18 (and the existing rule 11/15) rather than
needing another sweep.

## Where the code lives

`packages/core/src/components/ui/metric-card.tsx`,
`packages/core/src/components/ui/{person-card,outcome-card,calendar-item,timeline,setup-progress}.tsx`,
`packages/core/src/components/shell/{nav-drawer,viewer-menu}.tsx`,
`apps/web/app/_screens/home-dashboard.tsx`,
`apps/web/app/{household,more,settings,meals}/page.tsx`,
`apps/web/app/_components/pending-invitations.tsx`, `CLAUDE.md`.
