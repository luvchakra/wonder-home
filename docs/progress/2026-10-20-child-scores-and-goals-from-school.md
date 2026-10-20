# Each child's score, goals from classes and school work, and a child's school rows that open

**Story:** 08-019 (backlog `backlogs/08-Kids-and-School-Intelligence.md`). The owner, 2026-10-20.

## What was asked
- "Show the gamified scores here for each child", on Kids & School.
- Adults define goals from the existing school work and classes outside school, with a reward. The child sees them, and both see progress.
- On a child's Home, "nothing happens when I click on Show me or Field trip to Bounce".

## What was done
- **Score per child.** The Overview shows each child's level and progress to the next, stars (how many from goals and how many from school work), streak, goals met now, and every reward earned.
  - The card is `ChildScore`, and `kidProgress` feeds it from `childProgress`, the same count the child's Home uses. Both live in `apps/web/app/school/goals-tab.tsx`.
  - The Goals tab shows the same card above each child's goals.
  - The Overview now reads goals and check-ins too (in the same `Promise.all` wave).
- **Start from.** When adding a goal, the sheet lists the child's classes and open school work (`goalStarts` in `packages/core/src/school/goals.ts`, tested).
  - **A class** fills in a weekly goal, as many times a week as the class meets, with a picture by the kind of class.
  - **School work** fills in a one-off goal ending on its due date. It is met the day the work is marked done: `childProgress` turns that day into the goal's tick (`schoolDone`).
  - Every field stays editable, and a reward can be added.
  - The goal keeps its source in `child_goals.source_kind` / `source_id`, from migration `20261020210000`, which is applied live.
  - `saveGoalAction` checks, under the reader's own RLS, that the source belongs to that child.
- **The child's side.**
  - A school-work goal says "Met when you finish this school work". It has no tick of its own and is not a second mission beside the work.
  - Each school row opens under its chevron (`ExpandableRow`) to show its kind, subject, when, time it takes, status (for work) and the teacher's note. "I did it!" stays one tap beside it.
- **Show me.**
  - **Why it did nothing.** The cat's link often named the tab already open, or only switched tabs and left the page where it was.
  - **The fix.** Links now carry a section anchor (`#missions`, `#due-today`, `#coming-up`, `#goals`, `#fun`). `scrollWhenShown` in `companion-card.tsx` scrolls there once the section exists, and `ScrollToSection` does the same on a fresh load. Both honour reduced motion.
- **Words and help.** Words in all eight languages; help School ¶11 in all eight.

## Verified
- **Tests:** `school/goals.test.ts` 7. School, help and i18n tests: 207 pass.
- **Static checks:** typecheck, ESLint on the changed files, and help links all pass.
- **Browser QA on the live project, QA household, at 360px and 1280px:**
  - **Parent:** set "Finish Volcano model" (reward Extra park time) and "Go to Piano this week" through Start from. Rows checked in the database: once/1/school_item ending 24 Oct, and week/1/activity.
  - **Child:** saw both goals, marked the Volcano work done, and the goal then read met with "Reward earned".
  - **Overview:** read Level 1, 2 stars (1 from goals, 1 from school work), 1 day in a row, 1 of 2 goals met, and Earned: Extra park time.
  - **School row:** "Field trip to Bounce" opened to its details.
  - **Show me:** scrolled to its section, including on the tab already open.
  - **Layout:** no horizontal scroll.

## Open
- QA rows created for this, in household `71fe432d-…`: two school items ("Field trip to Bounce", "Volcano model") and the two goals. They go with the household cleanup.
