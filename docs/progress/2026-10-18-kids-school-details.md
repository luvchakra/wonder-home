# Kids & School: teachers, classes outside school, today's classes on the Calendar (08-010 to 08-012)

**Date:** 2026-10-18 · **PR:** #234

## What the owner asked

On Kids & School, the owner asked for these, per child:
- the school with its Google Maps address;
- the class teacher and every subject teacher;
- extracurricular classes (music, piano, karate, any learning class) as folded items.

A folded class shows the class, a short description and its timings. Opened, it shows everything: the teacher, learning classes, upcoming competitions and medals won. Today's classes appear on the Calendar by default.

Later in the session the owner added two asks:
- the school's start and end times should match the child's profile;
- a long email ran off a child's details in Family.

## What was built

- **Migration `20261018260000`** (run by the owner in the SQL editor; verify:live 287/287):
  - `school_teachers`, `child_activities` and `child_activity_notes`;
  - `wh.may_change_child` (guardians and Admins) and `wh.is_child_of`.

  The child, their guardians and Admins read. Guardians and Admins write. Nothing is hard-deleted.
- **`packages/core/src/school/activities.ts`**: reads and writes for teachers, classes and notes. `sessionDates` and `activityEntries` turn each class's weekly schedule into Calendar entries through a new `activity` source in `calendar/repository.ts`.
- **Kids & School** (`apps/web/app/school/page.tsx`, `child-details.tsx`, `child-school.tsx`). One card per child holds:
  - the school row, with class and section and the school day (the same `setSchoolHours` record Family edits);
  - the teachers;
  - the classes, as folded `ExpandableRow`s.
- **Family details** (`_components/member-detail.tsx`): facts are grouped by subject. Email and phone take a whole row, and every value wraps.
- **Words and help:** all words in eight languages; Help ("School and children's work" ¶5–6) in eight languages.

## Verified

- **Database:**
  - `test-child-activities-rls.mjs` passes 7/7: child reads but cannot write; a non-guardian adult sees nothing; another household is refused; only a child has classes.
  - `test:db` passes 643/643.
  - Tenant isolation passes.
- **Gates:** typecheck, lint, unit tests, eval, help links, tracker, build and bundle check all pass.
- **Browser**, at 360px and 1280px on the live project with a QA household:
  - teachers were added, changed and removed;
  - Piano every day 5–6 pm, at a place picked from Maps, read "Every day · 5:00 PM – 6:00 PM" folded;
  - a December festival showed under Coming up;
  - a distinction was added, then removed, and is kept in the database with `active = false`;
  - the Calendar's day view showed Piano today;
  - school hours set on Kids & School read back in Family;
  - a 60-character email wraps.
- **Gemini transcription, end to end, with the owner's QA key:** Gemini TTS spoke a sentence with family names, and `transcribeLiveTurn` wrote it back exactly in 1.7 seconds.

## Still open

A real Gemini Live conversation and a real on-screen keyboard still need checking on the owner's phone.

## QA cleanup

Checked on 2026-10-18 after the later merges (through #237): no `wonderhome-qa-verify.internal` account remains on the live project and no QA household this work created is left; the count was taken with `select … from auth.users where email like '%wonderhome-qa-verify.internal'`. Two older QA households from 2026-10-17 (`QA Welcome Home` b942c154…, `QA Hours Home` 7ab6da76…) could not be proven to be this work's and were left in place.
