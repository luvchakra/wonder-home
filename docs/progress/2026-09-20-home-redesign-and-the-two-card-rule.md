# Home, rebuilt to the sheet — and a hard two-card rule

## The rule first, because it outlives the screen

CLAUDE.md gained **rule 19**, a hard constraint on every grid of cards on
every screen, not just this one:

- **Two cards per row on a phone, never three.** Whatever the desktop does,
  and however short the labels look in a mockup.
- **Roughly 48% each, one consistent gap**, so a pair reads as a pair.
- **Stack vertically the moment content needs more width.** Rule 15 decides
  and always wins.
- **Primary information is full-width.** The thing somebody came for is
  never half a row.
- **Secondary shortcuts use the two-column grid.**
- **Touch targets and type never shrink to make a row fit.** If they would
  have to, it was not a two-up row.

Rule 18 was reconciled with it rather than left to contradict it: a stat
tile is full-width *or one of two*, never one of three.

In the kit: `DomainGrid` and `HandledList` are pairs; `MetricGrid` stays
full-width by default and takes a new `pairs` prop to opt in. **The opt-in
is deliberate.** Rule 18 exists because four tiles crammed into one phone
row once truncated "Need you" into "Nee…", so the default has to stay
safe — a screen that adds a longer label later must not silently
re-create that. `pairs` means "I have checked these labels fit at half
width".

## The screen

Rebuilt to the attached sheet, in its order: greeting and a date chip,
the setup ring, four counts, your family, what WonderHome handled, today's
focus beside the family moment, your household, and the closing script
line.

**Where it departs from the sheet, and why.** Each of these is a case of
the sheet showing something the product does not actually know, and
CLAUDE.md forbidding the invention:

| Sheet | Built | Why |
|---|---|---|
| "Mumbai, 28°C" weather chip | Date and household name, linked to Today | There is no weather provider. A temperature nobody measured is the invented number rule 9 forbids. |
| Green "at home" presence dots | Avatars and names, no dots | Nothing tracks presence. A green dot would claim something untrue about where a child is. |
| Checkbox list on Today's focus | Real items with a status badge, no checkboxes | The product manages outcomes, not micro-task checklists, and nothing should ask a family to tick off normal household work. |
| Family photograph | `HomeIllustration` | Design principle 8: illustrated warm family life in the household's own tones, never stock photography. |
| "Tasks" and "Chores" counts | "Need you", "Handled", "Upcoming", "Checked" | The same reason: those are the counts the engine actually computes, and each is arithmetic somebody can explain. |

The per-person responsibility roll-up that used to sit on Home is gone.
The Responsibilities screen owns it, the sheet has no room for it, and it
was the longest thing on the page.

## What was verified

- `npm run typecheck`, `npm run lint` — both clean.
- `npm run test` — 90 files passing.
- `npm run build` — succeeds.
- `npm run test:e2e` — 256 passing.
- **In a browser at 360px**, measuring rather than eyeballing: every grid
  reports exactly **2 cards per row**, `scrollWidth === clientWidth` (no
  horizontal overflow), and a sweep of every leaf text node found **nothing
  clipped**. That check is what caught the handled tiles still stacking
  one-up when the sheet pairs them.

## What is still open

**The composed page was not viewed signed in.** The layout primitives were
verified in a browser with fixture data, but `/` needs a real session and
this environment has no credentials for one — the repository's RLS
harnesses build a local test database rather than touching the deployed
project, and creating an account in production was not something to do
uninvited. So the grids are verified; the assembled page with live
household data is covered by typecheck and build only. Worth a look on the
preview deployment.

## Where the code lives

- `CLAUDE.md` — rule 19, and rule 18 reconciled with it.
- `design/DESIGN-NOTES.md` — why `pairs` is opt-in.
- `apps/web/app/_screens/home-dashboard.tsx` — the screen.
- `packages/core/src/components/ui/metric-card.tsx` — the `pairs` layout.
- `packages/core/src/components/ui/outcome-card.tsx` — handled items, now
  two-up.
- `packages/core/src/components/ui/card.tsx` — takes a `style`, for the
  stagger delay a rising card sets.
