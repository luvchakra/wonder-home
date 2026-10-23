# HomeTalk knows everything the Calendar shows (26-020)

## What happened
The owner asked HomeTalk "what is happening tomorrow" on Fri 23 Oct. The Calendar showed three things for Sat 24 Oct: Asmi's Grade 5 PT1 Parent Teacher Meeting, Vocal (10–11 am, Solus building) and Piano (6–7 pm, Club Splendora). HomeTalk named only the meeting.

## Root cause
- Vocal and Piano are not events. They are Asmi's classes outside school (`child_activities`, story 08-012), which the Calendar projects onto their weekdays (`activityEntries`).
- HomeBrain never read `child_activities`: no context adapter, no builder. Timetables and exams were there; classes were not.
- A day-sized question is answered from HomeBrain's facts, not from the calendar. Only month-sized questions ("events in December") and "next" questions went to the calendar itself. So whatever the Calendar shows but HomeBrain doesn't read was invisible to "tomorrow".
- The parent–teacher meeting is a school entry, which HomeBrain does read, so it was named.

## Similar issues found
- **No guard tied the two lists together.** The Calendar's sources (`CALENDAR_SOURCES`) and HomeBrain's records (`ContextRecords`) were kept separately. Classes were the only source missing today; nothing stopped the next one.
- **25 tables HomeBrain reads had no stale trigger.** HomeBrain's stored context (`household_context`) is marked stale by `wh.mark_context_stale` on a write. That trigger was only on the tables listed when it was laid. Writes to these tables were seen only if the writing service called `invalidatesContext`:
  - `event_exceptions` (a moved or cancelled occurrence);
  - every health table HomeBrain reads;
  - `outcomes`, `orders`, `consumable_purchases`, `inventory_balances`, `meal_ingredient_needs`;
  - `school_communications`, `member_relationships`, `member_languages`, `household_addresses`, `household_roles`;
  - the HomeSend tables, `gift_plans`, `playbook_items`, `policies` and `purchase_policies`.

## The fix
1. **Classes are HomeBrain facts.**
   - The school adapter (`context/repository.ts`) reads `listActivities`.
   - `context/builders.ts` adds one fact per class (days, hours, place, teacher).
   - It adds one fact per session over the next 14 days, on the day the Calendar uses (`sessionDates`).
   - It adds one fact per upcoming competition.
   - All are `privacyClass: "child"` with the child as subject, so `filterForViewer` keeps them to whoever RLS already lets see them.
2. **A day or a week is answered from the calendar.**
   - "What's on tomorrow / on Saturday / this weekend / next week", up to 14 days, goes through `asksWhatIsOn` and `scheduleSpanOf`.
   - It is answered by rules (`scheduleReply`) from `calendarRange` with every module, as the Calendar screen reads it. The person's hidden Filters stay hidden.
   - "Tomorrow evening" keeps to the evening. "What is Asmi doing on Monday?" keeps to Asmi.
   - "What does Asmi have tomorrow?" stays with HomeBrain, because it also means to-dos and school notices, which are not on the calendar. The golden set (HT-65, HT-67) caught that.
3. **A guard.** `CALENDAR_SOURCE_RECORDS` (`context/builders.ts`) is typed over every `CalendarSource`. A new Calendar source does not compile until it names the HomeBrain records it lives in.
4. **Stale triggers everywhere HomeBrain reads.** Migration `20261023160000_context_stale_everywhere.sql` adds the trigger to the 25 tables. It is applied to the live project, with its version recorded as `20261023160000`.

## Verified
- `tsc` for core and web: clean.
- Vitest across context, homebrain, calendar, evaluation, conversation and school: 71 files, 1190 tests pass. This includes the new `calendar/schedule-answer.test.ts` and `context/calendar-parity.test.ts`, built on the owner's exact case.
- `npm run eval`: 158/158 (HT-138 to HT-140 new), unsafe actions 0/19.
- ESLint on the changed web file; `lint:boundaries`, `lint:migrations`, `lint:secrets`: pass.

## Still open
- Stored contexts built before this ships have no class facts. After the deploy, every household's `household_context` is marked stale once (`update household_context set stale_since = now()`), so the next turn rebuilds it.
- No browser check: the visible change is HomeTalk's reply text, covered by the golden cases and unit tests above.

## Where
- `packages/core/src/calendar/answer.ts`
- `packages/core/src/context/builders.ts`
- `packages/core/src/context/repository.ts`
- `apps/web/app/_lib/hometalk-turn.ts`
- `packages/core/src/evaluation/`
- `supabase/migrations/20261023160000_context_stale_everywhere.sql`
