# WonderHome — HomePlaces

## Live Module Tracking

| # | Priority | Story ID | Story | Status | Notes |
|---|---|---|---|---|---|
| 1 | P0 | 24-001 | HomeTalk answers place questions | Done | #204: intent `find_places`, a read. Rules read the request (`homeplaces/request.ts`), the anchor is the saved home address or the child's picked school (`homeplaces/service.ts`), places come from `places/google.ts`'s `findNearby`, are checked against their hours for the whole window and ranked; the reply is deterministic (`homeplaces/answer.ts`) and carries place cards; 30 searches an hour per household |
| 2 | P1 | 24-002 | The family's place book | Done | #204: save and "not for us" from a place card (`apps/web/app/ai/place-actions.ts`, re-read from the stored reply, never the browser) into `household_places`; every member reads, adults and Admins write; saved places rank first, turned-down places never return |
| 3 | P1 | 24-003 | School and office hours | Done | #210: `school_enrolments.starts_at/ends_at` and `household_members.work_starts_at/work_ends_at` (migration `20261018090000`, live); "after school" uses the recorded end time and "after work" is read; an assumed time is said in the reply |
| 4 | P1 | 24-004 | The place book screen | Done | #210: `/places` lists saved and turned-down places, with undo |
| 5 | P1 | 24-005 | Places near the office | Done | An adult's office is picked from Google Maps (`member_work_places`, migration `20261018150000`, live; the person or an Admin writes, adults and Admins read; `scripts/test-work-places-rls.mjs`), in Settings for yourself and in Family for an Admin. "Near my office" / "near Rohan's work" anchors there (`homeplaces/request.ts` work anchor, `service.ts` `workAnchor`); with no office picked HomeTalk says where to add it (`needs_work`). Golden HT-81. Browser-checked 2026-10-18 at 360px and 1280px on a local production build with a real Google Maps key, against the live project (QA household, cleaned up afterwards): in a member's details, typing "WeWork BKC Mumbai" in Office listed two real WeWork BKC results; picking one and saving showed Office: WeWork on the member |
| 6 | P2 | 24-006 | Search for places from the Places screen | Done | `/places` has Add a place for adults: pick from a search (kind `place`, leaning toward home), an optional note, Save. The place is re-read from the provider on the server (`addPlaceAction`), and each save counts against the household's `places.find` budget. Browser-checked 2026-10-18 at 360px and 1280px with a real Google Maps key against the live project (QA household, cleaned up afterwards): "Blue Tokai Coffee Bandra" listed three real branches; picking one and saving showed "Saved to your place book" and the place, with its full address, under Saved. No horizontal scroll at either width |
| 7 | P2 | 24-007 | Work hours as a fact in Family | Done | Family's member detail shows how they work and their office beside their office hours (`family.fact.workArrangement`, `family.fact.office`). Browser-checked 2026-10-18 against the live project at 360px and 1280px with QA accounts (cleaned up afterwards): Family shows How they work and Office hours |
| 8 | P0 | 24-008 | Getaways: "a two-day vacation plan" answered with places worth the trip | Done | The owner, 2026-10-18 (PR #228). `homeplaces/request.ts` reads a getaway (vacation, holiday, trip, weekend away; the days from "two-day", "a weekend", "4 day"): `purpose: "getaway"`, anchored at home, `when: { kind: "trip", days }`, radius 200 km (80 km for one day). The search asks for tourist attractions ("hill station weekend getaway" for a weekend; vaguer words drew resorts and travel agencies when tried) and is kept within the area (`NearbyQuery.within` → a `locationRestriction` rectangle, `includedType` with strict type filtering in `places/google.ts`); day-trip distances (under 25 km) are left out; no opening hours are checked; distance costs little in the ranking. The reply says "worth the trip from home, the best rated first" and to check the drive, weather and stay. Live check from Pune: Mahabaleshwar, Louisa Point, Naneghat, the Wai hills. Gemini Live answers it where location may reach Google |
| 9 | P1 | 24-009 | HomePlaces is named and placed with the AI tools | Done | The owner, 2026-10-18 (PR #232): the Places screen is now HomePlaces and sits in the nav drawer and More under AI & Smart Tools, after HomeSend (`navigation/secondary-navigation.ts`, AI tone). HomeBrain Review is now HomeBrain in the same section. Nav labels, page titles, HomeTalk's "take me to HomePlaces", the help guide and HomeTalk's own replies are renamed in all eight languages. Browser-checked at 360px and desktop |
| 10 | P0 | 24-010 | Every picked place shows in HomePlaces | Done | The owner, 2026-10-18 (PR #233): a home address added in Manage Household did not appear in HomePlaces, which only listed the place book. HomePlaces now opens with **Our places**: the home address, each child's school and each adult's office, every place picked from Google Maps anywhere in the app (`homeplaces/our-places.ts`; siblings at one school and colleagues at one office are one row). Each opens in Google Maps, and its pencil goes to its one editor: Manage Household for the home (Admins; others see no pencil), Kids & School for a school, Family for an office. An Admin with no address on record sees **Add your home address**. A child's school, which could only be set during setup, can now be picked from Google Maps (or typed) on Kids & School under **Schools**, per child (`saveChildSchoolAction`, `_lib/places.ts`'s `saveSchoolFromForm`; leaving it empty retires it with `endEnrolments`, kept rather than deleted). The owner asked for the same in Family: a child's details now pick the school from Google Maps in place of the free-text "School or work location", through the same save, so the two screens always show one school; an adult's location is their Office picker, and only a helper keeps the free-text line. Event and appointment locations are typed text, not Maps picks, so they are not listed. Help ¶11 in eight languages. Browser-checked at 360px and 1280px on the live project |

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
