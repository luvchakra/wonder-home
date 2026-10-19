# The rest of the home on the calendar (26-002)

**Date:** 2026-10-19 · **Asked by:** the owner ("go ahead with 26-002"), P0 in `tracking/PRIORITY-ITEMS-REPORT.md`

## What was built

The Family Calendar now shows what the household's other modules already keep, each as a projection of its own record (design `FAMILY-CALENDAR-PHASE0.md` §2 (b), C2). Nothing is copied, and every entry opens the screen that owns it.

| Module | On the calendar | Who sees it |
|---|---|---|
| School | Homework, worksheets and projects as a **Due** marker while still to do; exams and school events as blocks. Notices stay on Kids & School | Whoever may see that child (`may_see_child`) |
| Meals | A planned meal as a marker at its ready time; skipped or replanned ones are not shown | Everyone; **hidden by default** (D6) |
| Bills | A bill still to pay as a **Due** marker on its day, by name only, never its amount | Only with `finance.view` (and `may_see_finance` in RLS) |
| Health | Proposed and confirmed appointments | The viewer's own, their child's, or one shared with the whole household shows its kind and provider. Anyone else's reads **Busy**, with no kind, place or link (D4). RLS (`may_see_health`) still decides which rows arrive at all |
| Helpers | "Rekha away" on each day a helper said they won't come | Everyone; the link to Househelper only for adults |
| Upkeep | A booked service visit at its time (`service_requests.scheduled_for`); unbooked or finished ones are not shown | Everyone; the link only for adults |
| Responsibilities | An open outcome with a due time, as **Due**, under its playbook name | Adults; **hidden by default** (D6) |
| Groceries | An order on its way (placed, confirmed, shipped) at its expected time, as "Delivery · Blinkit". Never its items or a use-by date | Everyone; the link only for adults |

- **Pure adapters.** They live in `packages/core/src/calendar/modules.ts`, with `MODULE_SOURCES` and `MODULE_FEATURES` (the plan feature each needs). A due date is a `due` entry and gets a "Due" badge (`_lib/calendar-view.ts`), so it is never mistaken for a booked time.
- **Reads** (`calendar/repository.ts`, `calendarRange`'s new `modules` input):
  - each module reads only the range, through the viewer's own session, with a bounded `limit`;
  - a module the person hides is never read;
  - whether the plan includes it (`may`) runs alongside the read, in the same `Promise.all` wave, and is read once per request for every module, which also decides what Filters offers (`offeredSources`);
  - an appointment that already has a family event on the calendar shows once, as that event;
  - a module that cannot be read is reported like any other source ("Some things could not be read").
  - The clash check and HomeTalk's calendar span still read only events, occasions, holidays, classes and exams. They leave `modules` out.
- **Filters** (`calendar/_components/calendar-filters.tsx`, `(auth)/calendar-actions.ts`). There is a new "Also show" group with only the modules this person may see and the plan includes; School work and Classes appear only in a family with a child. Saving hides what was unticked and keeps any module the sheet did not offer as it was. Before this change, saving reset every source to the defaults.
- **Words.** `calendar.entry.due/busy/helperAway/delivery`, `calendar.filters.sources` and `calendar.source.*` are in all eight calendar catalogs. The appointment kind reuses `healthForm.careType.*`. The meals chip reads "Planned meals" so it is not confused with the Meals category.
- **Help.** Calendar ¶9 is in all eight languages, the section is dated 2026-10-19, and it has new keywords. "Homework" was tried as a keyword and dropped, because it pulled a school question away from Kids & School (`search.test.ts` caught it).

No migration was needed: every read uses an existing household-scoped index (checked on the live project).

## Verified

- **Unit:** `calendar/modules.test.ts` 13. It covers due versus block; handled work, notices and out-of-range items left out; an all-day item when no time is known; skipped meals; bills only with `finance.view`; Busy versus own, a guardian's child and household-wide; deduplication against a family event; proposed and cancelled appointments; a helper away with no link for a child; booked visits; an outcome's name falling back to its key; deliveries. All 54 calendar tests pass, and help and i18n pass 106.
- **Gates:** typecheck, lint, `npm test`, `lint:help-links`, `check:bundle`, a production build.
- **Browser**, a local dev server against the live project, with a QA family: an Admin, an adult, a child with a guardian link, a helper, a Pro plan and one record per module.
  - At 360px, each module was on its own day, and the homework and the bill said "Due".
  - Planned meals and responsibilities were hidden until switched on under "Also show". Switching them on showed them, and switching Deliveries off hid the delivery.
  - The Day view showed "Dentist" for the Admin's own appointment and "Doctor" for one shared household-wide.
  - At 1280px, the month and week views were checked.
  - There was no sideways scroll and no page errors.
  - A "Busy" appointment wasn't produced in the browser: that needs a `selected_family` consent grant. The unit tests cover it.

## Still open

- **Clashes.** The clash check on Add does not yet count appointments, exams or service visits as busy time. That belongs with C3, 26-003's plan_event and finding free time.
- **HomeTalk.** HomeTalk's month answers ("any events in December?") still list events, birthdays and holidays only. Bringing modules in is 26-003's "answers read from the projection".
- **Long words in Month cells.** A long single word in a Month cell, such as "Electricity", breaks mid-word in the narrow desktop grid. This is the grid's existing wrapping; nothing is cut.

## Where the code lives

- `packages/core/src/calendar/modules.ts` and its test.
- `calendar/repository.ts`.
- `apps/web/app/calendar/page.tsx` and `_components/calendar-filters.tsx`.
- `apps/web/app/(auth)/calendar-actions.ts`.
- `apps/web/app/_lib/calendar-view.ts`.
- The eight `calendar` and `help` catalogs, and `help/guide.ts`.

## QA cleanup

- **This story (26-002):** ran after #251 merged (2026-10-19). QA account `f79221ab-ef6b-4c30-a364-4be6de2a5a6b` and household `be8bf68e-d8a3-4a75-aad5-6bda5938c703` ("QA Calendar Home", with its seeded records) were deleted; SQL found 0 households, members, school items, appointments, orders, memories and auth users left for them. A first QA account, `e7af6831-64fa-4e84-8be6-3ed3f87bc240`, was deleted the same day before it was used.
- **The confirmed-by-default check (#250):** ran after #250 merged on 2026-10-19. QA account `7532f0fd-c1ea-40f0-aab2-19a4cdc0501b` and household `29c2c0e7-1ecc-4ed2-b62b-ed33a8a9f382` ("QA Confirmed Home") were deleted. SQL found 0 households, members, memories, review items and auth users left for them.
