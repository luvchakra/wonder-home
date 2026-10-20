# The cat's colour, facts and reminders; Groceries; HomeTalk opens what it changed (2026-10-20)

## What was done
- **The child picks the cat's colour** (08-018 follow-up). The naming form now spans the whole card and has six coats: ginger, grey, black, white, brown and calico. They are a radio group, and each one is a small cat beside its word (rule 20). The big cat tries each coat on before the child saves. The colour is stored in `child_companions.coat` (migration `20261020190000_child_companion_coat.sql`, applied live) and is checked against that set. The coats are `--wh-cat-*` token overrides under `.wh-cat[data-coat]`.
- **Facts for the child's age and reminders** (the owner: "tell some really interesting stuff for the child as per their age, keep reminding them about their homework, classes, responsibilities from time to time, load a new message every time the page or tab opens"):
  - **Facts.** `companionLines` adds true facts for the child's age band: `kids.cat.fact.<young|older|teen>.N`, 12 per band, 4 a day.
  - **Reminders.** It adds reminders for the next open school work (due today or coming up), the next class still to come today (`nextClassToday`, from activities and the school timetable) and the child's responsibilities (up to two).
  - **Order.** Lines are dealt in turn: a reminder, something fun, then a reminder again.
  - **A new line on every open.** The card starts one line further along on each page or tab open: a per-device counter in localStorage, which is a convenience only, and the card is keyed by the tab.
- **Groceries** (25-024, the owner from phone screenshots, in two rounds):
  - Add item on the left and Go to cart at the far right, with a gap between them.
  - Above the To buy list, three cards in one row: At home, Not counted yet and Mark as bought. The last one is the action itself (`MetricCard`'s `onClick`, `MarkBoughtButton`'s `trigger`), and the separate full-width button is gone. This is recorded as an owner's exception to rule 19 in CLAUDE.md and DESIGN-NOTES.
  - One list, with no category headings. The pills still filter it, and they scroll without a visible scrollbar.
  - Every row has In stock and To buy as two equal cells, each with its label above its own − amount +. `StockStepper` sets what is at home: a `stated` write through `changeStockAction`, the same as Update stock on the item page, for adults only. Taps settle into one write, and the middle opens a sheet for any amount.
  - The Groceries help (body ¶1–2) is updated in all eight languages, and the stock stepper's words are in every catalog.
- **HomeTalk opens the screen that shows a change** (04-027). After an action is carried out, typed or spoken in the app, the reply's first WonderHome link becomes `navigate` (`navigation/app-path.ts`'s `screenShowing`). The browser goes there, or refreshes in place when it is already on that screen. `appPath` is now the one path check for the turn, `hometalk/contract.ts` and `live-talk.tsx`, and it allows a plain query. Alexa never navigates. Help `help.guide.voice.body.7` is updated in all eight languages.
- **"your recipes" is a link** (25-025): the saved note on a catalog dish links to Meals → Recipes. While the note shows, the separate button waits.
- Help `help.guide.school.body.10` is updated in all eight languages. All new words are in all eight catalogs.

## Verified
- `school/companion.test.ts`: 8 pass (dealing order, age band, no repeated fact in a day, next class).
- The school, i18n and help unit tests pass.
- `scripts/test-child-companions-rls.mjs` passes, including the new coat checks.
- Typecheck passes for web and core.
- Browser QA on the live project:
  - As a QA child at 360px and 1280px: six reloads showed six different lines, including "Maths worksheet" due today and "Piano is today at 10:25 pm". Black was picked and saved. Opening a tab started a new line. The colour words wrap whole at 360px. No horizontal scroll.
  - As a QA adult on `/groceries?view=to-buy` at 360px and 1280px: the layout is as asked and there is no horizontal scroll. Two taps on Atta's In stock + saved 2 pcs, which was still there after a reload. The Mark as bought card opened its sheet. There are no category headings.

- Typed "Add tomato to the grocery list" on /ai: the browser landed on `/groceries?view=to-buy` with Tomato listed. Save my version on Idli: the note's "your recipes" link opened `/meals?tab=recipes`. The test household was put on the Max plan for this; it is removed with the household.
- **Why Anthropic showed no usage** (investigated, read-only). The owner's household key is an Anthropic key (`sk-ant-`, 106 characters). Since it was saved on 2026-10-17, about 39 understandings and 48 composed answers went through it. Every assistant message was `transmitted` with no understanding failure, so the calls succeed. The likeliest reasons for zero in the Console:
  - the key belongs to another organisation or workspace;
  - the usage is under a dollar and the Console is slow to show it;
  - earlier turns used the platform key.

## Open
- Nothing on these. Translating the facts was done by hand per language. "Flamboyance" (a flamingo fact) is kept as the English word, with a gloss where needed.

## Cleanup
- The QA household `71fe432d…` and its two QA accounts are removed after the merge (see the PR).
