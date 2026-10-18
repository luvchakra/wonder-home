# What's new on Home, and HomeTalk answers from the Calendar

## What was done

**What's new** (the owner asked for a temporary section showing what has come up since the app was last opened).
- **Where it lives:** a card at the top of Home, under the greeting (`_components/whats-new-card.tsx`).
- **What it shows:** what reached production since this browser last opened WonderHome. Each row has a tile, a title and one line, and opens the place the feature lives. "Show N more" reveals the rest beyond three.
- **The list** (`packages/core/src/help/whats-new.ts`):
  - Every entry is something that shipped, dated by its merge to `main`. Entries are #202–#212, plus HomeTalk's calendar answers.
  - An entry is never shown before its `at`, and leaves on its own after 30 days, so the section is temporary by construction.
  - An Admin-only destination is listed only for Admins.
- **Remembering what you saw:** the last-open time is kept in this browser's `localStorage`, and the list for the current visit in `sessionStorage`, so a refresh does not empty it. "Got it" hides it for this visit, and the next visit lists only what is newer.
  - This is a per-device reading convenience, not a record. Blocked storage simply shows the recent list again, and no migration was needed.
- **Words:** in all eight languages (area `whatsnew`). Help "Home and Today" gains a paragraph, and the section's keywords include "what's new".

**HomeTalk answers calendar questions from the Calendar** (the owner reported "Do you see any events scheduled in December?" → "There are no events currently scheduled for December", in a household with several December birthdays and an anniversary).
- **Root cause:**
  - The rules did not recognise a month or "the next few months", so the model read the question.
  - HomeBrain's facts only reach 7 days ahead (`HORIZON_DAYS`) and hold raw events only, with no birthdays and no holidays.
  - The builder line "Nothing is on the family calendar for the next 7 days" was reworded by the model into "nothing in December".
- **Fix:**
  - `conversation/temporal.ts`'s new `resolveCalendarSpan` reads month-sized spans: a month by name (this year's, or next year's once it has passed), this or next month, the next N or few months, the months ahead, and the rest of the year.
  - A rule in `rules.ts` reads a question naming such a span as `ask_status` with scope `schedule`, and only when it is a question, so "plan a dinner in December" stays a plan.
  - The understanding prompt lets `when` hold a month or span.
  - `hometalk-turn.ts` answers any `ask_status` whose `when` is a month-sized span by reading `calendarRange` through the speaker's own session, then `calendar/answer.ts`'s `calendarSpanReply` lists entries by date: events, birthdays and occasions, and holidays. No model is involved. It lists up to twelve, then "…and N more", and says when part of the calendar could not be read.
  - A voice channel needs `calendar.read`.
  - Day and week questions keep HomeBrain's answer, which also covers meals and bills.
- **Status:** the read half of HomeEvents 26-003. Its planning half (participants, free time, move and cancel) is still to do.

## Verified
- **Unit tests:** core 225 files / 3204 tests, including:
  - `calendar/answer.test.ts` (3);
  - spans in `temporal.test.ts` (3 new);
  - rules (2 new);
  - `help/whats-new.test.ts` (3).
- **Eval:** golden HT-26 and HT-27; `npm run eval` functional 57/57, 0 unsafe, voice gate pass.
- **Static checks:** `tsc` in core and web, ESLint on the changed web files, and `lint:boundaries`, `lint:secrets`, `lint:help-links`, `security` and `tracker --check`.
- **Build:** `npm run build -w apps/web` and `check:bundle`.
- **Not driven in a browser:** the session has no sign-in credentials. The owner checks the card on Home and asks HomeTalk about December after the merge.

## Still open
- The duplicate synced birthday rows seen in one household (`member_birthday` occasion rows appearing twice) do not reach the calendar, which projects birthdays from members' own dates. Their origin is not investigated here.
- HomeEvents 26-003's planning half, and C2's other modules (school, meals, bills, health) on the calendar, and so in these answers.
- No test data was created.
