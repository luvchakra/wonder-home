# Long weekends from public holidays (14-034)

**Date:** 2026-10-19 · **Asked by:** the owner, after 14-033: "add public holidays so it suggests long weekends".

## What changed

- **Holidays reach HomeBrain.** `calendar/holidays.ts` (`listHouseholdHolidays`) reads the household's country from `households.region` and that country's national days for the next six months, from the same `public_holidays` list the Calendar shows. Both the stored context (`readStoreRecords`) and the live calendar read now include them. They become `holiday` items (calendar domain, general class, "Christmas Day is a public holiday on …"), so any calendar answer can use them too.
- **Long weekends lead the answer.** In `homebrain/insights.ts`, `free_window` adds the long weekends:
  - a holiday on a Friday or Monday gives three days;
  - a holiday on a Thursday or Tuesday gives four, with one day taken off, and the answer says which day;
  - a holiday on a weekend or a Wednesday gives none.

  Only weekends with nothing on for the family are offered, never one that has already begun. The answer lists the long weekends first, then the free weekends, then the busy ones.
- **Reading the question.**
  - A rule now reads "Which weekend is free for a trip?" as a HomeBrain question. Before, the rules alone left it unknown.
  - A trip fact is not narrowed to "this weekend" because the question said "weekend".
  - "When is the Diwali holiday?" is not treated as a trip, while "a 3-day holiday" is.
  - When every fact answering is a trip fact, the lead is "Here is when the family calendar is free:".
- **Help.** Calendar ¶10 is in all eight languages, with new keywords.

The owner's household will have the holidays in its stored context within the hour after deploy, because keep-warm rebuilds a row older than an hour. Nothing needs to be run by hand.

## Verified

- `homebrain/free-window.test.ts` has 7 tests:
  - a Tuesday and a Friday holiday;
  - a Sunday holiday;
  - a holiday whose weekend is busy;
  - a holiday past six months;
  - a holiday whose long weekend began last Saturday;
  - holiday items, both current and past;
  - the rules reading "which weekend is free for a trip?" and leaving "suggest a 2 day getaway" to HomePlaces.
- Golden household A gained Gandhi Jayanti (Fri 2 Oct), and golden case HT-119 was added. `npm run eval` passes 136/136, with unsafe actions 0/18.
- `npm test`, the help and i18n tests (106), help links, typecheck and lint all pass.
- **Read-only against the owner's household,** with the new reads and India's list. It named:
  - Sat 21 to Tue 24 Nov, if Mon 23 is taken off (Guru Nanak's Birthday);
  - Fri 25 to Sun 27 Dec (Christmas Day);
  - Sat 23 to Tue 26 Jan, if Mon 25 is taken off (Republic Day).

  Then it listed the free weekends from 24–25 Oct.

## Still open

- **State holidays.** A state's own holidays (Delhi's, for example) are each person's Calendar choice, not the household's. Long weekends use national days only.
- **Where to go.** HomePlaces' getaway search does not yet suggest a destination for a given long weekend.

## Where the code lives

- `packages/core/src/calendar/holidays.ts`.
- `context/{builders,repository}.ts` and `homebrain/context-store.ts`.
- `homebrain/{insights,grounding,answer}.ts` and `conversation/rules.ts`.
- `homebrain/free-window.test.ts`.
- `evaluation/{households,cases}.ts`.
- The eight help catalogs and `help/guide.ts`.
