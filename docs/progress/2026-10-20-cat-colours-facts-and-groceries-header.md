# The cat's colour, facts and reminders; the Groceries header (2026-10-20)

## What was done
- **The child picks the cat's colour** (08-018 follow-up). The naming form now spans the whole card and has six coats: ginger, grey, black, white, brown and calico. They are a radio group, and each one is a small cat beside its word (rule 20). The big cat tries each coat on before the child saves. The colour is stored in `child_companions.coat` (migration `20261020190000_child_companion_coat.sql`, applied live) and is checked against that set. The coats are `--wh-cat-*` token overrides under `.wh-cat[data-coat]`.
- **Facts for the child's age and reminders** (the owner: "tell some really interesting stuff for the child as per their age, keep reminding them about their homework, classes, responsibilities from time to time, load a new message every time the page or tab opens"):
  - **Facts.** `companionLines` adds true facts for the child's age band: `kids.cat.fact.<young|older|teen>.N`, 12 per band, 4 a day.
  - **Reminders.** It adds reminders for the next open school work (due today or coming up), the next class still to come today (`nextClassToday`, from activities and the school timetable) and the child's responsibilities (up to two).
  - **Order.** Lines are dealt in turn: a reminder, something fun, then a reminder again.
  - **A new line on every open.** The card starts one line further along on each page or tab open: a per-device counter in localStorage, which is a convenience only, and the card is keyed by the tab.
- **Groceries header** (25-024, the owner from a phone screenshot):
  - Add item on the left and Go to cart at the far right, with a gap between them.
  - The three To buy counts in one row of stacked cards (`MetricGrid`'s new `row`, recorded as an owner's exception to rule 19 in CLAUDE.md and DESIGN-NOTES).
  - The category pills scroll without a visible scrollbar.
- Help `help.guide.school.body.10` is updated in all eight languages. All new words are in all eight catalogs.

## Verified
- `school/companion.test.ts`: 8 pass (dealing order, age band, no repeated fact in a day, next class).
- The school, i18n and help unit tests pass.
- `scripts/test-child-companions-rls.mjs` passes, including the new coat checks.
- Typecheck passes for web and core.
- Browser QA on the live project:
  - As a QA child at 360px and 1280px: six reloads showed six different lines, including "Maths worksheet" due today and "Piano is today at 10:25 pm". Black was picked and saved. Opening a tab started a new line. The colour words wrap whole at 360px. No horizontal scroll.
  - As a QA adult on `/groceries?view=to-buy` at 360px and 1280px: the button order and the row of three are as asked, with no scrollbar line and no horizontal scroll.

## Open
- Nothing on these. Translating the facts was done by hand per language. "Flamboyance" (a flamingo fact) is kept as the English word, with a gloss where needed.

## Cleanup
- The QA household `71fe432d…` and its two QA accounts are removed after the merge (see the PR).
