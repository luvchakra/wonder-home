# HomePlaces, and HomeTalk that speaks like a person

## What was done

**HomePlaces.** HomeTalk now answers location questions with real places. Examples: "suggest some good places for dinner tonight", "where can we hang out near Anya's school after school ends?".

How a question is answered:
- **Read by rules.** `homeplaces/request.ts` reads the request: eat or go out, near home or a named child's school, and now, a meal time, a stated time or after school. A model only ever says that a sentence is a place question. The new intent is `find_places`, a read.
- **Anchored to the record.** `homeplaces/service.ts` takes the point from the saved home address or the child's picked school (`school_enrolments.latitude/longitude`), never a guess. If two children go to two different schools and no name is given, it asks one question.
- **Searched and checked.** Google Places text search runs through `places/google.ts`'s new `findNearby`, using the same server-side `GOOGLE_MAPS_API_KEY`. Each place is checked against its weekly hours for the whole window (`isOpenFor`, which handles the wrap past midnight and past the week). A closed place is dropped, and a place whose hours are unknown ranks lower and the reply says to check.
- **Assumptions said aloud.** "After school" with no school hours on record is taken as 3:30 pm, and the reply says so.
- **Ranked.** Places are ordered by rating, review count and distance, then by the family's own place book.
- **The place book.** It is the `household_places` table, with Save or "Not for us" on each card. Saved places come first and their kinds are preferred; turned-down places never return. Nothing else is learned.
- **The reply.** `homeplaces/answer.ts` writes it deterministically. The places are shown as cards (`apps/web/app/ai/place-cards.tsx`, built on the kit's `ActionRow`). Each card has an icon-only "Open in Google Maps" link, Save, and Not for us. The cards are kept in the message metadata, so they survive a reload.
- **Writes re-read the reply.** `apps/web/app/ai/place-actions.ts` reads the place from the stored reply on the server, never from the browser. Every member reads the place book; adults and Admins write it.
- **Budgeted.** Each household gets 30 searches an hour (`places.find`). Voice channels leave place questions to the app (capability `places`, app only). A golden eval case, HT-21, holds the intent.

**Spoken replies.** HomeTalk used to read a reply out mechanically: "right arrow", link addresses, list markers. `conversation/speech.ts`'s `speakable` now turns a reply into what a person would say. "Settings → AI Assistant" becomes "Settings, then AI Assistant", a link is read as its words, each list item is its own sentence, "★4.5" is read as "rated 4.5", and "km" as "kilometres". Every voice path speaks through it: the browser voice and the provider voice route. The browser voice picker now prefers a natural or neural voice for the same locale over a robotic default.

## Verified

- Unit tests: homeplaces, places, conversation, voicelink and ai, 755 tests passed. Help and i18n tests passed.
- `npm run eval`: 51/51 cases, with an unsafe action rate of 0.
- RLS: `scripts/test-household-places-rls.mjs`, 4/4 passed.
- The migration lint, the import boundaries and the help-link check passed. Typecheck passed.
- The migration `20261017150000_household_places.sql` was applied to the live project. `npm run verify:live` passed 231/231, including the two new place-book checks.
- Browser check at 360px and desktop with a QA household (a home address, a child and their school):
  - one real search, "Where can we hang out near Anya's school after school ends?";
  - five places came back, with the 3:30 pm assumption stated;
  - Save and Not for us held after a reload;
  - no horizontal scroll.

## Open

- **Leftover QA household.** The QA account was deleted, but deleting its household (`c6f4b70a-54c1-4ed9-b9a4-32bbd44ebe7c`, "QA Places Home") was cancelled from the SQL tool. Remove it with `delete from public.households where id = 'c6f4b70a-54c1-4ed9-b9a4-32bbd44ebe7c';`, which cascades to its members, enrolment, address and places.
- **School hours are assumed.** School end times are not recorded yet, so "after school" uses 3:30 pm and says so.
- **No place-book screen yet.** There is no screen for the place book; saving and undoing happen on the cards in HomeTalk.
