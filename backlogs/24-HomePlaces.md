# WonderHome — HomePlaces

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 24-001 | HomeTalk answers place questions | Done | #204: intent `find_places`, a read. Rules read the request (`homeplaces/request.ts`), the anchor is the saved home address or the child's picked school (`homeplaces/service.ts`), places come from `places/google.ts`'s `findNearby`, are checked against their hours for the whole window and ranked; the reply is deterministic (`homeplaces/answer.ts`) and carries place cards; 30 searches an hour per household |
| 2 | P1 | 24-002 | The family's place book | Done | #204: save and "not for us" from a place card (`apps/web/app/ai/place-actions.ts`, re-read from the stored reply, never the browser) into `household_places`; every member reads, adults and Admins write; saved places rank first, turned-down places never return |
| 3 | P1 | 24-003 | School and office hours | Done | #210: `school_enrolments.starts_at/ends_at` and `household_members.work_starts_at/work_ends_at` (migration `20261018090000`, live); "after school" uses the recorded end time and "after work" is read; an assumed time is said in the reply |
| 4 | P1 | 24-004 | The place book screen | Done | #210: `/places` lists saved and turned-down places, with undo |
| 5 | P1 | 24-005 | Places near the office | Not Started | The office is free text today, so "near my office" cannot be searched. Needs the office location picked like a school's (coordinates), then an anchor in `homeplaces/service.ts` |
| 6 | P2 | 24-006 | Search for places from the Places screen | Not Started | Places reach the book only from HomeTalk's answers today; the screen has no search of its own |
| 7 | P2 | 24-007 | Work hours as a fact in Family | Not Started | The member-details sheet records work hours but Family's member detail does not show the work arrangement |

**Status flow:** `Not Started` → `In Progress` → `Blocked` → `Done`

## Module Purpose
HomePlaces answers "where should we go?" from the household's own record: where home and each school are, when school and work end, and the places the family has saved or turned down. It is a read, never a write, and the family is the only teacher. See CLAUDE.md's HomePlaces section and `docs/progress/2026-10-17-homeplaces.md`, `docs/progress/2026-10-18-homeplaces-hours-and-place-book.md`.

## Dependencies
- `CLAUDE.md` (HomePlaces under "The agent platform")
- `packages/core/src/homeplaces/`, `packages/core/src/places/`
- `GOOGLE_MAPS_API_KEY` on the server

## Stories

### Story 24-001 — HomeTalk answers place questions
**Epic:** HomePlaces
**Priority:** P0
**Goal:** "Somewhere for dinner tonight" or "where can we hang out near Anya's school after school?" gets real, open places near the right point, with any assumption said aloud.

### Story 24-002 — The family's place book
**Epic:** HomePlaces
**Priority:** P1
**Goal:** The family saves places it likes and turns down ones it doesn't, and every later answer respects that.

### Story 24-003 — School and office hours
**Epic:** HomePlaces
**Priority:** P1
**Goal:** "After school" and "after work" mean the household's recorded times, not a guess.

### Story 24-004 — The place book screen
**Epic:** HomePlaces
**Priority:** P1
**Goal:** One screen to see and change the places the family saved or turned down.

### Story 24-005 — Places near the office
**Epic:** HomePlaces
**Priority:** P1
**Goal:** "Near my office" is answered from a picked office location, the same way a school is.

### Story 24-006 — Search for places from the Places screen
**Epic:** HomePlaces
**Priority:** P2
**Goal:** A person can find and save a place from `/places` without asking HomeTalk.

### Story 24-007 — Work hours as a fact in Family
**Epic:** HomePlaces
**Priority:** P2
**Goal:** A member's work arrangement and hours show in Family's member detail, where they can be changed.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.
