# Responsibilities examples, Kids & School "Coming up", a Groceries data bug, and ingredient-aware meal planning

**Date:** 2026-09-22
**Trigger:** The next batch (items 8–15) of the user's grouped 22-item UI/UX review — a deliberate phased rollout following the sidebar/setup-wizard/HomeTalk batch (PR #98). Four research agents investigated the current state of each area in parallel before any edit, since several items turned out to already be built.

## What was found already done (no code change)

- **Item 8, Responsibilities add/update/remove grouped by member**: already fully implemented — `saveResponsibilityAction`/`removeResponsibilityAction` cover add/edit/remove, and `groupByOwner()` in `apps/web/app/household/responsibilities/page.tsx` genuinely sections rows per person (not just a filter tab).
- **Item 10, Kids & School Overview chevron cards grouped by due date**: already true — every row on Overview/Homework/Calendar already used `ExpandableRow`/`AgendaExpandableRow`, and "Deadlines at risk" was already grouped by due date via `groupByDueDate()`.
- **Item 12, Kids & School add/update/remove events and exams**: already true — `createSchoolItemAction`/`updateSchoolItemAction`/`cancelSchoolItemAction` and their forms are generic across every `SchoolItem` kind, events and exams included.

## What was built

**Item 9 — concrete per-topic examples under "How much WonderHome does on its own"** (`apps/web/app/household/responsibilities/page.tsx`): each of the four autonomy levels (Watch only / Prepare / Ask first / Act and tell me) now carries a one-line concrete example grounded in a real starter outcome (Bills paid on time, Groceries stocked, Home maintenance, Dinner ready) instead of describing the levels only in the abstract.

**Item 11 — Kids & School Overview: due-date-windowed "Coming up"** (`packages/core/src/school/items.ts`, `apps/web/app/school/page.tsx`): a new pure `upcomingSchoolItems()` (with unit tests) filters to items with a real due date, not finished/cancelled, within a per-kind window — 3 days for homework/worksheets, 30 days for exams/projects/events, `notice` excluded (no due date of its own). Wired into a new "Coming up" section on Overview, grouped by due date (reusing the Today/Tomorrow/date label pattern), and deliberately excludes anything already shown in "Deadlines at risk" so nothing lists twice. This is additive: "Deadlines at risk" (a capacity/risk assessment) is unchanged.

**Item 13 — Groceries bug: a genuinely new value rejected as "already tracking something with that name"**: root-caused by a research agent to `consumables_active_name_unique`, a partial unique index scoped to `(household_id, name)` only — so two distinct items sharing a name in different categories (e.g. "Shampoo" under Groceries and again under Personal) collided even though the household picked a different category deliberately. Fixed by rescoping the index to `(household_id, category, name)` (migration `20260922170000_consumables_name_unique_per_category.sql`, applied to the live project in this session and confirmed via `npm run verify:live`), and reworded the conflict error to name the actual boundary: "…already tracking something with that name **in this category**." A new DB test (`scripts/test-commerce-rls.mjs`) proves both directions: the same name succeeds in a different category, and a genuine same-category duplicate is still rejected — confirmed again live via the browser (three sequential adds: grocery → personal → grocery again, exactly matching the test).

**Item 14 — "Plan a meal" offers ingredient-based choices, plus an inline "add a new meal"** (`packages/core/src/meals/repository.ts`'s new `listRecipeChoices()`, `apps/web/app/_components/meal-forms.tsx`, `apps/web/app/meals/page.tsx`): the recipe picker now groups into "Ready to cook" and "Missing an ingredient" `<optgroup>`s using the same essential-ingredient-in-stock check `suggestMeal()` already ran — nothing is hidden, a short recipe is still one tap away since planning it is what turns the shortage into a shopping item. A final "+ Add a new meal…" option swaps the sheet into a compact recipe-creation form (name + essential ingredients, reusing `createRecipeAction`); on success the sheet returns to the picker with the new recipe already selectable, both for this meal and every future one. (State-adjustment on the action's result is done during render per React's own "adjust state" pattern, not inside a `useEffect`, to satisfy `react-hooks/set-state-in-effect`.)

**Item 15 — rough nutrient summary per meal**: calories/protein were already shown; carbs and fat were stored (`recipes.carbs_grams`/`fat_grams`, already captured on the Add Recipe form) but never rendered. Both are now included in the summary line on the Recipes tab card and the Plan tab's `MealCard`.

## What was verified

- `npm run verify` — typecheck, lint, security suite, unit tests (including new `upcomingSchoolItems()` tests), `test:db` (including the new cross-category consumables test, 16/16 commerce DB tests), production build, 344 e2e — all green.
- Migration applied to the live Supabase project (`kqxndableyysxqhxiorz`) via the Supabase MCP `apply_migration` tool, confirmed with `npm run verify:live` (111/111 checks).
- Live browser verification with a temporary QA household, seeded with real school items (windowed correctly either side of the 3-day/1-month boundaries), a stocked and an out-of-stock recipe, and consumables — confirmed: "Coming up" shows only the in-window items; the four autonomy examples render; Recipes tab and Plan cards show carbs/fat; the Plan-a-meal picker correctly groups Ready/Missing and the inline "add a new meal" flow created a real, later-selectable recipe; and the Groceries fix reproduced end-to-end through the real form (grocery → personal succeeds, grocery → grocery again correctly still rejected with the updated message). QA household and auth user removed afterward.

## What's still open

- The Groceries "What is it?" combobox's suggestion list (`existingNames`) is still household-wide and category-agnostic — it will still offer "Shampoo" as a suggestion when adding to Personal even though that "Shampoo" is really the Groceries one. This doesn't reproduce the bug (the DB now scopes correctly), but a household could still pick an existing name from the wrong category by mistake. Scoping the combobox's suggestions to the selected category was out of scope for this pass (flagged by the same research agent as a secondary UX follow-up, not the reported bug) and is left for a future story.
- Items 8/10/12 needed no code change; nothing new to track for them beyond confirming they hold.

## Where the code lives

- `apps/web/app/household/responsibilities/page.tsx` — item 9.
- `packages/core/src/school/items.ts` / `items.test.ts`, `apps/web/app/school/page.tsx` — item 11.
- `supabase/migrations/20260922170000_consumables_name_unique_per_category.sql`, `packages/core/src/commerce/repository.ts`, `scripts/test-commerce-rls.mjs` — item 13.
- `packages/core/src/meals/repository.ts` (`listRecipeChoices`), `apps/web/app/_components/meal-forms.tsx`, `apps/web/app/meals/page.tsx` — items 14 and 15.
