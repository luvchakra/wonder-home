# Destinations for those long weekends (24-011)

**Date:** 2026-10-19 · **Asked by:** the owner, after 14-034: "suggest destinations for those long weekends too".

## What changed

- **Where comes with when.** A when-question about a trip ("which weekend is free for a trip?", "what's the best time for a 2-day getaway?") is still answered from the calendar. It now also runs the same getaway place search a place question runs, and puts the places after the weekends, as the usual place cards (open in Google Maps, save, not for us).
- **Sized to the trip** (`homeplaces/trip.ts`). The days the person said; otherwise three when the answer leads with a long weekend a holiday makes; otherwise two.
- **A better search for three and four days** (`homeplaces/request.ts`). Tried live from the owner's home: "holiday destination" returned one travel agency; "hill station weekend getaway" returned Bhandardara, Matheran, Louisa Point and others. A getaway of up to four days now uses the second; a week-long one keeps "holiday destination".
- **One search, one gate.** The turn uses the same `findPlaces` as a place question, so the `places.find` budget (30 an hour per household), the home address and the channel's `find_places` allowance all apply. If the search is refused or unavailable, nothing is added after a good answer. A missing home address says where to add it.
- **The weekend list stays.** The chat screen used to drop every bullet in a reply that had place cards, which would have removed the free-weekend list. `withoutList` now drops only the bullets that name a card.
- Help Calendar ¶10 says it, in all eight languages.

## Verified

- **Unit:** `homeplaces/trip.test.ts` (4: days from the words or the lead, only a when-question, the joined reply), the updated request tests, and the free-window tests. `npm test` passes. `npm run eval` passes 136/136 with 0/18 unsafe actions.
- **Browser, a QA household in Pune with a real Google Maps key, at 360px:**
  - the reply listed the long weekends, then the free weekends, then "For a 3-day getaway, here are 5 places worth the trip from home";
  - five place cards followed (Mahabaleshwar, Louisa Point, the Naneghat waterfall and others), with names wrapping, no sideways scroll and no page errors;
  - before the `withoutList` fix the weekend list was missing from the reply, which is how that bug was found.
- **A cached snapshot:** the QA household's stored context was built before its region was set, so it had no holidays until it was marked stale. In real use a snapshot refreshes within the hour. This is the same behaviour noted in 14-034.

## Still open

- **A destination per long weekend.** All the long weekends share one list of places. Matching a place to each weekend (distance for three days against four, the season) would need more than the place search gives.
- **The drive and the weather** are not checked; the reply says to check them before booking.

## Where the code lives

`packages/core/src/homeplaces/{trip,request}.ts` and their tests, `homebrain/insights.ts` (`LONG_WEEKENDS_LEAD`, `daysSaid`), `apps/web/app/_lib/hometalk-turn.ts`, `apps/web/app/ai/assistant.tsx`, the eight help catalogs.

## QA cleanup

Ran after the work was verified. The QA account `d417183c-04a1-45bb-971c-5a9fed3650a6` and household `2cf4e2a1-c59e-4de0-87a7-f2bf05fdaa4a` ("QA Trip Home", with its address and stored context) were deleted. SQL found no account, household, member, address or context row left. The dev server was stopped and the scratch scripts removed.
