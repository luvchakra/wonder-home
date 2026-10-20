# A child's Done waits for a grown-up; the cat's sayings list; Remove from the list

2026-10-20 · stories 08-020, 08-021, 25-027 · follows PR #276 (one cat card per tab)

## What was done, and why

The owner asked for three things on the same afternoon.

1. **"Send this to adult for verification before making done."** A child's
   tick on a goal is now a request:
   - It is stored with no `verified_at` (migration `20261020230000`). It earns
     no stars, streak or reward until a guardian or an Admin says **Yes, done**
     under **Waiting for you** on Kids & School → Goals.
   - **Not yet** takes the tick back, and the child sees **Waiting for a
     grown-up** in the meantime.
   - The guardian (else an Admin) gets a notice built by `goalCheckInNotices`,
     which resolves once it is answered.
   - A grown-up's own tick counts at once.
   - RLS decides who may verify, and a verified tick is no longer the child's
     to take back.
2. **"Store a long list of such quotes in a table, tag with age, gender etc.,
   never repeat these for a child."**
   - `companion_sayings` holds 154 facts, sayings, ideas, jokes and riddles in
     all eight languages. Each is tagged with the ages it suits, a gender when
     it was chosen for one, and its topics.
   - `companion_sayings_for` picks lines this child has not heard, using the
     age and gender on their own member row.
   - Each line the cat shows is recorded in `companion_sayings_heard`, so it
     never comes back.
   - The English list was written for this. The seven translations were drafted
     by parallel agents and checked for completeness.
3. **"Add option to remove from cart."**
   - **Remove** under every To buy amount sets To buy to nothing.
   - The item leaves the To buy view at once, because the view follows the
     steppers, and stays under All.

## Where the code lives

- **Verification**
  - `school/goals.ts`: `verified`, `waitingToday`, counting.
  - `school/goal-repository.ts`: `answerCheckIn`, and the fallback for a
    database without the column.
  - `notifications/notices.ts`: `goalCheckInNotices`, wired into the sweep.
  - `apps/web/app/_components/kid-done-button.tsx` and `school/goals-tab.tsx`:
    the screens.
- **Sayings**
  - `school/sayings.ts` and `school/companion-sayings.json`.
  - `school/companion.ts`: `sayings` in `companionLines`.
  - `_components/companion-card.tsx`: records each line shown and skips repeats.
- **Remove**
  - `groceries/_components/to-buy-stepper.tsx`.
  - `grocery-list.tsx`: the To buy filter.

## Verified

- **Unit tests**: goals, notices, companion and sayings (the JSON equals the
  migration's seed).
- **Database tests**: `test-child-goals-rls.mjs` 10/10 and
  `test-companion-sayings-rls.mjs` 4/4, run locally against both migrations.
- **Static checks**: typecheck, lint and migration lint.
- **Browser, 360px, QA household**:
  - Remove took Atta off To buy (5 → 4); it stayed under All with the cart
    button and was put back.
  - One cat card across Today → School → Goals → Fun → Today → School
    (PR #276).

## Open, and what needs a person

- **Both migrations are not yet on the live project.** The database tool's
  calls from this session were cancelled. Until they run:
  - ticks count at once, as before;
  - the cat keeps its built-in daily lines.

  Once applied, browser-check the Waiting for you flow and the sayings, then
  move 08-020 and 08-021 to Done.
- The duty line still quotes a responsibility's raw name ("kids room tidy …").
  That is the household's own wording, not a sayings issue.
