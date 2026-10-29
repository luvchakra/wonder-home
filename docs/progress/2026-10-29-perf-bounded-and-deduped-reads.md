# Performance: bounded Home reads, shared Day-view reads, deduped Meals reads (2026-10-29)

PERF-03, PERF-09 and PERF-10 of `docs/plans/2026-10-29-fast-and-secure-at-scale.md`. PR #PRNUM.

## What changed
- **PERF-03.** `listEvents` and `listMeals` take an optional `limit`. Home (`homeRows`) now reads events from 12 h ago to 30 days ahead (max 300 rows) and meals from today to 30 days ahead (max 200). The Calendar and Meals screens still read their full lists.
  - Visible effect: the Home agenda's "N of M checked" counts the next 30 days of events and meals, not all future ones. Anything dated later is still on the Calendar. The B4 note had kept the count whole; the plan asked for the bound, so it moves with it.
- **PERF-09.** The Calendar's Day view, on today with the household lens, starts the bill and school-item reads once (`householdLensReads`). The Today plan and `calendarRange` (`shared`) both use them; the calendar filters the rows exactly as its own windowed read does (`sharedBills`, `sharedSchoolItems`).
  - Events are not shared: the plan's rows have no recurrence, exceptions or category, so the calendar cannot build its entries from them. Two event reads remain.
- **PERF-10.** One `recipes` read with every shown column (`recipeSet`) feeds the edit cards (first 80) and the pickers (up to 200; was unbounded). The pickers' stock check takes the ids of the `listGroceries` rows, which are the same active consumables as `listConsumables`.

## Counts (Supabase REST calls per page load, reasoned from the call graph; no sign-in was possible here)
| Page | Before | After |
|---|---|---|
| `/meals` | 16 | 14 (`recipes` 2 → 1, `consumables` 2 → 1) |
| `/calendar?view=day&lens=household` | 42 | 40 (`school_items` 3 → 2, `obligations` 3 → 2) |
| `/` (Home) | 39 | 39 (rows bounded, not fewer calls) |

## Verified
- `packages/core/src/home/bounded-and-shared-reads.test.ts`: the horizon filter and limit are applied (a 500-event household asks for at most 300), unbounded without a limit, the shared bill and school filters match the calendar's, and `/meals` reads `recipes` once and `consumables` not at all beside `listGroceries`.
- Typecheck (core, web), ESLint on changed files, vitest on home, calendar and meals (1193 tests), `npm run build -w apps/web`: clean.
- Not done: `ui-check.mjs` at 360 px and live REST counts, because `apps/web/.env.local` is not in this container.

## Open
- Events on the Day view are still read twice; sharing needs a calendar-shaped event read the plan can reuse.
