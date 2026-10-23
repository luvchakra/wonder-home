# The notifications page, redesigned around what to do

**Date:** 2026-10-23 · **Ask (the owner):** "redesign the notification page, make it easy to understand. give actionable options upfront"

## What was wrong
- The day-summary card repeated the list beneath it, and four tabs plus two rows of category pills sat above any reminder.
- Each row showed a bare "Medium" priority pill, and its facts and actions were hidden behind a chevron.
- A health appointment reminder read only "Health appointment", even to the person it was for.
- A notice such as a chat, a HomeSend item, an event change or a helper away had no button to open it.

## What it is now
- **`apps/web/app/notifications/page.tsx`:** one page, read top to bottom (rule 17).
  - Requests come first.
  - **Needs you now** lists everything due, most pressing first, each as its own card.
  - **Coming up** covers later today and tomorrow, by day. It is the day summary, so "Today's summary" in Settings → Notifications turns it off.
  - **Done this week** is folded away at the bottom.
  - The lede counts what needs you. Category pills show only when more than one category is present.
  - The tabs and the separate summary card are gone.
- **`apps/web/app/_components/reminder-row.tsx`:** an action card. It shows the category tile, the title, an "Urgent" badge only when urgent, and the time, then the body and the record's facts in a panel, all in view. Below them are the actions:
  - the one thing to do (Mark as paid, Mark as done);
  - a button to open the record;
  - "Remind me later", with one tap per time (each time is its own submit button carrying its preset) and a picked day and time;
  - "Not needed".
- **`apps/web/app/_lib/reminder-views.ts`:**
  - A health appointment shows its type, time, who it is with, where, and what to prepare. These are read through the viewer's own session, so health RLS still decides.
  - A chat notice opens its thread from the stored `action.target`, accepted only when it is an in-app path (`/…`, never `//…`).
  - HomeSend, event, weather, helper, order and goal notices open their screens.
- **`notifications/notices.ts`:** order notices pointed at `/grocery`, which does not exist. They now point at `/groceries`.
- Words are in all eight catalogs. Help: the notifications section's paragraph 3 now describes the page, and the section's `updated` date is 2026-10-23.

## Verified
- **Checks:** `tsc` for apps/web and packages/core, ESLint on the changed files, `npm run lint:help-links`, `npm run check:bundle`, `npm run lint:secrets`, and a production `npm run build -w apps/web`.
- **Tests:** 385 notification and view tests pass, including the new `reminder-views.test.ts` (where each card leads, and refusing an off-app target). The i18n catalog tests pass.
- **Browser, 360px and 1280px:** a QA household with a monthly bill due today, a bill due tomorrow, homework, and a dentist appointment, on a production build. There is no horizontal scroll at either width.
  - A one-tap "In 1 hour" moved the bill to Coming up and said when it comes back.
  - Mark as paid moved Electricity to Done this week and named the next due date.

## Cleanup
The QA account, its household and every row seeded in it were deleted after the merge (see the PR thread).
