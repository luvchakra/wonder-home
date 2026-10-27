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
| 11 | P1 | 24-011 | Destinations beside "when should we go away?" | Done | The owner, 2026-10-19: "suggest destinations for those long weekends too". A when-question about a trip (14-033/14-034) now also searches getaway places near home (`homeplaces/trip.ts`: `tripDestinationRequest`, `withDestinations`) and shows them as place cards under the free weekends, sized to the trip: the days said, three for a long weekend, two otherwise. A getaway of up to four days searches "hill station weekend getaway" (the vaguer "holiday destination" drew one travel agency live). Same budget (`places.find`), same channel gate (`find_places`), and the reply keeps its weekend list when cards are shown (`withoutList` drops only the bullets that name a card). Browser-checked at 360px with a QA household and a real Google Maps key |
| 12 | P1 | 24-012 | Added places apart from saved ones, and first | Done | The owner, 2026-10-21. `household_places.origin` ('added' from the place book's own search, 'suggestion' from a HomeTalk answer; existing rows told apart by `kind`). /places lists Added by you, then Saved from HomeTalk, then Not for us, with counts; `rankPlaces` gives an added place +2.5 (a saved one +1.5). Test: added outranks suggested. Waits on migration `20261021001000_household_places_origin.sql` (until then a place with no kind reads as added). Live 2026-10-21: migration on the live project. |
| 13 | P0 | 24-013 | A place question is answered, never asked "what kind of place?" twice | Done | The owner's report, 2026-10-21: "can we go somewhere out tomorrow" got "Tell me what kind of place you have in mind…", and the answer "dinner nearby home" got the identical question back. Causes: the route's `findPlaces` re-ran `isPlaceQuestion` on the words after the model had already said `find_places`, and neither "go somewhere out" (no asking word it knew, and only "go out" as a kind) nor "dinner nearby home" (no asking word at all) passed, so both fell to a fixed question that was never stored as an open question. Now a turn known to be a place question is read with `asked` (`homeplaces/request.ts`): no kind named is going out (`assumed: "kind"`), answered and said back with "Say dinner, a park or a mall to narrow it"; "tomorrow" is tomorrow's window (`dayOffset`); the short "dinner nearby home" reads by rules; each reply keeps its reading (`metadata.placeRequest`) and a follow-up within 30 minutes is read with it (`placeRequestFrom`, `lastReplyMetadata`), so the day and anchor carry. The narrowing line and "whose school?" are open questions (`placesOpenQuestion`; `clarify.ts` answers `find_places` with a short reply that carries a kind, day, place or child's name), and a "whose school?" left unanswered is answered near home, said back (`WHICH_SCHOOL_FALLBACK`). Golden HT-135 to HT-137; the evaluation now runs place questions through the real reading, ranking and reply against golden places |
| 14 | P0 | 24-014 | A school or place Google Maps lists is found by the picker | Done | The owner's report, 2026-10-22: "euro school thane" found nothing in the school picker while Google Maps listed four EuroSchools. Cause: a school search sent `includedPrimaryTypes` (school, primary_school, secondary_school, preschool), which keeps a place only when its *primary* type is one of those, and Google files many Indian schools under other categories ("ICSE school", "International school"). Autocomplete now runs unfiltered and reads each prediction's own `types`: schools first, a bare city or road dropped, other places after (`places/google.ts`'s `forKind`). When autocomplete has no school (or, for an address, office or place, nothing at all), the same words go to `places:searchText`, the search behind the Maps search box, which forgives "euro school" for "EuroSchool"; its places say how far they are from home, and autocomplete's own answer stands if that second look fails. HomePlaces' `findNearby` had the same weakness: a strict `includedType` (a getaway's `tourist_attraction`) that leaves nothing is asked again once with the type as a preference. Unit tests in `google.test.ts` |
| 15 | P0 | 24-015 | "Where can we go this weekend, add maps link" is answered with weekend places and their map links | Done | The owner on WhatsApp, 2026-10-27, 14:54 IST, was asked "How much maps link should I add?". "Where can we go" is now going out (`GENERIC_OUTING`), "this weekend" the coming Saturday or today at the weekend (`weekend`, `service.ts` `windowFor`), and an asked-for map link ("add maps link", "directions") puts each place's Google Maps link in the words (`mapLinks`, `answer.ts`), which is all WhatsApp shows. Eval HT-170. Note: `docs/progress/2026-10-27-maps-link-and-quoted-skip.md`. |

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

### Story 24-011 — Destinations beside "when should we go away?"
**Epic:** HomePlaces
**Priority:** P1
**Goal:** When HomeTalk answers when the family is free for a trip, it also offers places worth the drive, sized to that trip.

**Acceptance criteria**
- A when-question about a trip adds up to five getaway places near home as cards, after the free and long weekends.
- The trip is three days when a holiday makes a long weekend, the days the person said when they said them, otherwise two.
- It uses the one place search: the household's hourly budget, the home address, and the channel's `find_places` allowance. A refusal adds nothing after a good answer, and a missing home address says where to add it.
- The weekend list stays readable beside the cards.

### Story 24-013 — A place question is answered, never asked "what kind of place?" twice
**Epic:** HomePlaces
**Priority:** P0
**Goal:** "Can we go somewhere out tomorrow" gets places to go out near home tomorrow, with the assumption said back, and "dinner nearby home" next narrows that same request rather than starting over.

**Acceptance criteria**
- Once a turn is a place question it is answered: a kind nobody named is going out, said back with how to narrow it. The only questions left are ones a record cannot settle ("whose school?"), and each is asked once.
- "Tomorrow" checks tomorrow's opening hours; a meal keeps its time, anything else is the daytime.
- A short follow-up ("dinner nearby home", "a park", "Anya") is read together with the request before it: what it says wins, the day and the place it leaves unsaid are carried.
- No provider is said honestly ("Place search isn't switched on…"), never as a question about the kind of place.

## Module Completion Rule
Complete dependency-ready P0 stories before P1/P2, but do not block unrelated work on unavailable external providers.
