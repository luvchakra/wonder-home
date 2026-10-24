# HomeSend: a class outside school and an event are their own kinds

## Why
Asmi's karate exam arrived by WhatsApp. HomeSend read it as one item, with the right child, day and time, but filed it as "School work". The owner asked for more kinds, so that things are filed where they belong: "this particular activity is actual Extra Curricular not school work".

## What was done
- **A class's own entries** (Kids & School, story 08-027):
  - Besides competitions, awards and notes, a class can now hold an **exam** (a grading or belt test) and an **event** (a show or a match).
  - Each of these can have a start and end time.
  - Every dated entry still to come is on the Calendar once, on its day (`activityEntries`).
  - Each is also a HomeBrain fact that includes its time (`context/builders.ts`, entity type `activity_note`).
  - Migration: `20261024130000_activity_note_exams_events.sql`.
- **Two new HomeSend kinds** (`ai/classify-intake.ts`):
  - **"A class or activity outside school"** (`activity_item`, with `activityKind`: exam, competition, event or note, and `subject` as the class's name). It is filed under the child's class of that name (`sameActivityName`). If the child has no such class, the class is added in the same step and is undone with the entry.
  - **"An event or invitation"** (`event`). It goes on the family calendar through `addFamilyEvent`, so the calendar's duplicate check applies.
  - Both keep their day and time (`TIMED_INTAKE_KINDS`).
  - Both are reconciled against what is already on record.
  - Both ask who the item is for in the same way a school item does.
  - Both are reviewed by a person; neither applies on its own.
  - Both can be undone: the entry and the class are stood down, and the event is cancelled.
  - WhatsApp's reply says what each one is.
  - Migration: `20261024140000_homesend_activity_event_kinds.sql`.
- **The classifier's instructions** now say that a karate exam is an `activity_item`, never a `school_item`, even when it is called an exam.
- **Records updated:**
  - golden cases HS-20 (now an activity) and HS-21 (a birthday invitation);
  - unit tests for times, cleaning up the reading, the class-name match, the Calendar entries and the WhatsApp replies;
  - help text in eight languages;
  - CLAUDE.md and backlog 08.

## Verified
- core and web `tsc` are clean.
- 4,447 core tests pass.
- `npm run eval`: 164/164 golden cases pass, and the Unsafe Action Rate is 0.
- Both migrations are applied to the live project.
- Repository gates and the production build: see the PR.

## Still open
- The class name in the review is typed, prefilled from what was read. A picker of the child's existing classes would need the classes passed to every review surface; that is a follow-up.
- The item already in HomeSend was read before this change. Pick "A class or activity outside school" in its review.
