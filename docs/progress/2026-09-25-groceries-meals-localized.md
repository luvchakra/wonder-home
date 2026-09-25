# Groceries and Meals screens in each person's language (story 22-004 slice)

**Date:** 2026-09-25

## What was done
- **Coverage.** `/groceries` (overview, list, orders) and `/meals` (plan,
  recipes, preferences) read their words from the catalog in all eight
  languages. So does every sheet they open: add or edit an item, plan a
  meal, attach or add a recipe, add a preference, and suggest a meal.
- **Catalog.** 189 new keys (`groceries.*`, `groceryForm.*`, `meals.*`,
  `mealForm.*`, plus three `common.*`). Four are plurals, so "1 item" no
  longer reads "1 items".
- **Client forms.** They take a server-built `labels` prop
  (`_lib/grocery-form-labels.ts`, `_lib/meal-form-labels.ts`), the same
  pattern as the event sheet. No "use client" module exports a plain value.
- **Kit change.** `ComboboxField` gained an optional `chooseExistingLabel`,
  defaulting to the English text.
- **Price per unit.** It now uses the money formatter ("₹12.50 each").
- **Deliberately left as they are:**
  - household data (names of items, recipes and people);
  - stored categories and units, which the dropdown shows exactly as saved;
  - agenda rows built in core, which are English, as on Today;
  - server-action messages;
  - the "Change meal" HomeTalk sentence.
- **How it was built.** A background agent did the translation work in an
  isolated worktree; it was reviewed and verified here.

## Verified
- Typecheck, lint, core unit tests (2944, including catalog completeness
  and placeholder tests) and the boundary lint.
- Browser in Chinese, Singapore household, at 360px and 1280px:
  - the groceries overview and list, and meals plan and recipes, all read
    in Chinese;
  - the add-item and plan-a-meal sheets read in Chinese;
  - no page errors and no horizontal scroll.

## Still open
- 22-004 continues for: Bills, Kids & School, Health, Househelper,
  Home & Upkeep, HomeSend, Settings sub-pages, and the rest of Home.
