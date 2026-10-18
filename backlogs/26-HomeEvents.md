# WonderHome — HomeEvents

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 26-001 | Family Calendar foundation | In Progress | Formerly 12-009. C1 (design/FAMILY-CALENDAR-PHASE0.md, D1–D7 approved 2026-10-18) built: migration `20261018120000` (visibility, all-day, repeat rules, exceptions, DoP&T holidays, preferences, family events on every plan), `packages/core/src/calendar/`, `/calendar` Month/Week/Day/Year, the Today tab is Calendar. Migration live 2026-10-18 (applied by the owner in the SQL editor, verified by query). Waiting on: signed-in browser QA at 360px and 1280px |
| 2 | P0 | 26-002 | Calendar module adapters | Not Started | Formerly 12-010. C2: school, meals, bills, health, helpers, upkeep, outcomes and orders on the calendar, each through its own visibility rules; "Busy" for health; dedupe by source |
| 3 | P1 | 26-003 | HomeTalk plans with the calendar | In Progress | Formerly 12-011. Read half done (2026-10-18): a question over a month-sized span ("any events in December?", "the next few months") is answered by rules from `calendarRange` for the speaker (`calendar/answer.ts`, `resolveCalendarSpan`, golden HT-26/HT-27); day and week questions keep HomeBrain's answer. Still to do: C3: plan_event with participants and conflicts, find_free_time, moving and cancelling events, answers read from the projection |
| 4 | P1 | 26-004 | Calendar reminders and holiday region | Not Started | Formerly 12-012. C4: reminders to every participant, a daily digest option, holiday region in Settings → Language & Region |
| 5 | P2 | 26-005 | Calendar notices over WhatsApp | Not Started | Formerly 12-013. C5: only if wanted; the official template, shared with Groceries' Send to Cook |
| 6 | P2 | 26-006 | Google and Outlook calendars | Not Started | Formerly 12-014. C6: only after a separate approval |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
HomeEvents is the owner's name for everything about the household's calendar: family events and who can see them, birthdays and occasions, public holidays, the Calendar tab's Month, Week, Day and Year, and — in later phases — every other module's dates, HomeTalk planning, reminders and outside calendars. It started as the Family Calendar stories in module 12 and was named HomeEvents on 2026-10-18; stories 12-009 to 12-014 moved here with their old ids kept in the notes. The design is `design/FAMILY-CALENDAR-PHASE0.md` (D1–D7 approved 2026-10-18), and C1 shipped in #211.

## Dependencies
- `CLAUDE.md`
- `design/FAMILY-CALENDAR-PHASE0.md`
- `packages/core/src/calendar/`, `packages/core/src/family/`
- Module 12 (Family Time & Social) for the events themselves

## Stories

### Story 26-001 — Family Calendar foundation
**Epic:** HomeEvents
**Priority:** P0
**Goal:** One calendar the whole household reads, built as a projection of the records that already exist: family events (with visibility, all-day, recurrence and single-occurrence exceptions), birthdays and occasions on the household's own clock, and curated public holidays, in Month (default), Week, Day and Year views with the day's agenda, filters, an add/edit sheet that checks conflicts, and pinch zoom. The Today tab becomes Calendar (D1).

### Story 26-002 — Calendar module adapters
**Epic:** HomeEvents
**Priority:** P0
**Goal:** School, meals, bills, health, helpers, upkeep, outcomes and orders appear on the calendar through their own readers and visibility rules, each opening its own screen; someone else's health appointment is hidden or "Busy" (D4).

### Story 26-003 — HomeTalk plans with the calendar
**Epic:** HomeEvents
**Priority:** P1
**Goal:** HomeTalk puts events on the calendar with participants and conflicts, finds free time, moves and cancels events through approval, and answers "what do we have next week?" from the same projection.

### Story 26-004 — Calendar reminders and holiday region
**Epic:** HomeEvents
**Priority:** P1
**Goal:** Event reminders reach every participant, not only the owner; an optional daily digest; the holiday region is chosen in Settings → Language & Region.

### Story 26-005 — Calendar notices over WhatsApp
**Epic:** HomeEvents
**Priority:** P2
**Goal:** Only if wanted: event notices to a consenting helper or member through the official WhatsApp template.

### Story 26-006 — Google and Outlook calendars
**Epic:** HomeEvents
**Priority:** P2
**Goal:** Two-way sync with Google and Outlook calendars, only after a separate approval.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.
