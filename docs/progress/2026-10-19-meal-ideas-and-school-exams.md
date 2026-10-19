# Meal ideas from what is at home, and a child's timetable and exams

**Stories:** 25-018 and 08-015 Done; 25-016 confirmed on the owner's phone; 04-025 and 08-016 added. **PR:** #243.

## What was done, and why

The owner asked on 2026-10-19 for two things: 25-018 (suggest a meal from what is at home, and save it as a recipe) and 08-015 (a school timetable and exams). They also reported:
- the sheet flicker fix works on their phone;
- Gemini's voice still does not float on its own when they switch apps.

### Ideas from what is at home (25-018)

Suggest, on the Meals plan, has a new section: Ideas from what's at home. It works even with no recipes; before, Suggest said "Add a recipe first". A person picks the meal and how many it serves. WonderHome then:
- **Asks the model** (`ai/dish-idea-model.ts`). The household's provider gets the names of the tracked items (at home, or kept with no amount), what the family avoids, and the recipes already kept. It is asked for up to three dishes.
- **Lets the rules decide** (`meals/dish-ideas.ts`, `checkDishIdeas`):
  - Each ingredient is matched to a tracked item by name, or marked to buy, whatever the model claimed.
  - Salt, oil and the everyday spices are "Check you have it", and count neither for nor against a dish.
  - A dish with anything anyone avoids is dropped.
  - A dish with fewer than half its other ingredients at home is dropped, and so is one that repeats a kept recipe.
- **Respects the data-use agreement** (`avoidedSubjects`). An allergy or a medical rule is always enforced, but is only told to the model when the household lets health reach a provider. The call passes `routeToProvider` and is spent from the HomeTalk message allowance (`conversation.text`).
- **Shows each idea as a folded row** (rule 21). Open it to see each ingredient marked At home, Check you have it or To buy, and the method. From there: Plan it (optionally Save as a recipe too), or Save as a recipe. `app/(auth)/dish-idea-actions.ts` links every item again on the server, and a saved recipe's nutrients are worked out as 25-017 does.

A fix in passing: "Add to the plan" on a recipe suggestion read the ready-by time on the server's clock. It now reads it on the household's clock.

### A child's timetable and exams (08-015)

Migration `20261019100000_school_timetable_and_exams.sql` adds four tables:
- `school_timetable_periods`
- `school_exam_types`: the household's own kinds of exam; any adult adds one.
- `school_exams`
- `school_exam_papers`: one subject on its day and time, with syllabus and links. Web addresses only, enforced by a trigger as well as by the app.

Access follows a child's classes: the child, their guardians and Admins read; guardians and Admins write. Nothing is deleted; a record is stood down. Every write marks HomeBrain's stored context stale.

Where it shows:
- **Kids & School:** each child's card now has School timetable (a folded row per school day) and Exams (a folded row per exam, opening to its subjects). `_components/child-school-week.tsx` renders them and `school/school-week-sheets.tsx` holds the sheets.
- **Calendar:** each subject is on its day (`school/exams.ts`'s `examEntries`).
- **HomeTalk:** HomeBrain reads exam papers and timetable days (`exam_paper` and `timetable_day` items in `context/builders.ts`). The night-before inference fires for an exam paper too.

A sheet that refuses a save, such as "not a web address", now keeps everything typed: it submits by hand rather than as a form action.

### A tracker fix

The story rows edited in #241 (14-026 to 14-031 and 25-017) had lost their closing `|`. So `scripts/build-progress.mjs` skipped them, and `docs/PROGRESS.md` left them out (276 of 295). They are restored, and the page now counts 283 of 304.

## What was verified

- Typecheck for core and web, and ESLint on the changed files.
- Unit tests:
  - `meals/dish-ideas.test.ts` 8;
  - `school/exams.test.ts` 5;
  - school, homebrain, context, calendar and meals 372.
- `scripts/test-school-exams-rls.mjs` 6/6. The full `test:db` ran before the push.
- The migration was applied to the live project through the Supabase MCP. `npm run verify:live` gave 302/302, with the four new tables and their anonymous checks.
- `npm run eval`, the security suite, the build, the bundle check, help links and the tracker check ran before the push, and CI ran on the PR.
- Browser QA on the live project, as a QA household with the QA Gemini key as the platform key:
  - **Kids & School (360px):**
    - a period and a Mid-term saved;
    - a bad link was refused and the rest of the form kept, then the corrected subject saved;
    - the subject was on the Calendar's day view;
    - HomeTalk answered "When is Asmi's maths exam and what does it cover?" with the date, time and syllabus.
  - **Meals (360px and 1280px):**
    - with paneer at home and a paneer allergy on record, no idea used paneer;
    - an idea was planned and saved as a recipe;
    - a second dinner on the same day was refused plainly;
    - a lunch was planned with "Added to the plan, with its ingredients."

## What is open

- **04-025:** Gemini's voice does not float on its own on the owner's phone. This needs a real Android phone to diagnose.
- **08-016:** the timetable and exams in Family's child details, and the day's lessons in Calendar's day view.

## QA cleanup

Ran after #243 merged (2026-10-19):

- QA account `2bffa573-bbac-49e3-b544-1ea425fa700e` deleted with `node scripts/qa-test-user.mjs delete`.
- QA household `693b38c1-7091-4a2b-a36d-2264b56d26fa` ("QA School Home", whose only signed-in member was that account) deleted with a household-scoped service-role delete; its rows went with it by cascade.
- Confirmed by SQL: 0 households, 0 auth users, 0 members, 0 exams and 0 stored files left for those ids.
- Screenshots in the session scratchpad removed; no dev server left running.
