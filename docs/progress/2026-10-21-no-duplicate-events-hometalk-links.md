# Nothing on the calendar twice; HomeTalk's links back, and a tighter HomeTalk

**Date:** 2026-10-21 · **Stories:** 26-017 (HomeEvents), HomeTalk fixes · **PR:** #300

## Nothing is added to the calendar twice (26-017)

The owner asked: "why there are 2 entries for the same event, there should be
duplication check before any event is created".

### Root cause
- On 18 Oct the family put "Bounce School Trip" on the calendar.
- On 20 Oct a school notice sent through HomeSend created a school item, "Field trip to Bounce", for the same day.
- HomeSend already compared a notice against the family calendar (HB-012). Its matcher wants 80% of the words alike. These two names share only half of them ({field, trip, bounce} and {bounce, school, trip}), so the notice was treated as new.
- Adding by hand (the Calendar, Kids & School) and HomeTalk's calendar write had no duplicate check at all.

### Fix
- **The same occasion by another name.**
  - `context/matching.ts`'s `sameOccasionName` sets aside the words that only say what kind of outing a thing is (trip, field, school, class, excursion, outing, visit, tour, picnic, event, day, activity, programme, function, celebration, trek). It then compares what is left.
  - The names must also differ in nothing but those words, and the rehearsal-or-fee rule (`PART_WORDS`) still applies.
  - It counts only for two things on the same day. "Bounce" on two different days is two outings.
- **One check for every way in.** `calendar/duplicates.ts` holds `sameEntryOnDay` (over the day's calendar entries from every module) and `sameTitledOnDay` (over records read straight from their tables).
  - Calendar → Add event, and Kids & School's add form, say "This may already be on the calendar:" and name the entry. Add anyway adds it.
  - HomeTalk's calendar write says the entry is already on the calendar and adds nothing. Its result carries `alreadyTracked`, so the preview reads "Nothing to change", not "Done".
  - HomeSend asks through the matcher above.
- **The forms keep what was typed.** React 19 resets a `<form action>` after every action. So when the sheet asked about a clash (or now a duplicate), the fields were emptied, and Add anyway sent an empty form. The add-event sheet, the event edit sheet and the school form now submit by hand (`onSubmit` plus `startTransition`), as the profile form already did.

### Verified
- Unit tests:
  - `duplicates.test.ts`, 6 tests;
  - a Bounce case in the evaluation spec's HB-012 block.
- Browser QA at 360px on a QA household:
  - Calendar: adding "Field trip to Bounce" on the trip's day showed "Bounce School Trip, 29 Oct, 8:00 am". Add anyway sent the confirmation and closed the sheet.
  - Kids & School: the same check, then "Added" after Add anyway.
- The QA user and household were deleted afterwards.

### Open
The owner's household still holds both entries. The school item "Field trip to Bounce" (`a0c125d7…`, created by HomeSend item `0b0071e1…`) can be undone in HomeSend or removed in Kids & School. It was left for the owner to decide.

## HomeTalk's links, and "what do you know about the family"

The owner asked: "links are not appearing in chat anymore". The reply to "what do you know about the family" had no links and showed `suggested: pay_bill`.

### Root causes
1. When HomeBrain's model answer is refused, the fallback printed each fact exactly as written for the model: ISO dates, action codes and no link. `homebrain/say.ts` now writes each fact as a line a person reads: the thing in bold, the day in words, and a link to the screen it belongs to.
2. `conversation/reply-format.ts`'s `APP_PLACES` lacked Calendar, Health & Fitness, HomePlaces and HomeSend, so links to them came out as plain words. They are added.
3. The validator took screen labels such as "People" and "Calendar" for invented names, so the model's answer was refused twice. Every word of a screen label is now allowed, read from `APP_PLACES`.
4. "What do you know about the family / my family / us" is now answered by rules from the roster: each person with what the asker may see, never health or money.

The new golden cases are HT-132, HT-133, HB-13 and HB-14. HT-33, HT-35, HT-36 and HT-44 now also accept the same date written in words, which is the owner's rule that a case checks what an answer says.

## HomeTalk layout

- "Ask me about family" is an icon button in the composer's row, between the Gemini Live pill and the mic.
- Message gaps, bubble padding, the Edit link, the composer's inner padding and the footnote are all tighter.
- At 360px the pill shows only its icon so the row fits. The engine's name stays in its accessible label.

## Gates

- `npx vitest run packages/core/src apps/web/app`: 20,245 tests pass.
- `npm run eval`: 155/155, with unsafe actions 0/19.
- Typecheck is clean, and the production build passes.
- `npm run tracker -- --check` passes.
- The prompt version changed, because the model now hears four more screens. The configured-provider eval is in the PR.
