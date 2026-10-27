# Groceries: sort by Recently updated, compact & realigned cards (25-042)

**Date:** 2026-10-27
**Owner request (2026-10-27):** on the Groceries screen (the stock/to-buy list
with All / To buy / Use soon), "give option to sort with date updated, make the
cards compact, realign elements."

## What was done

### 1. Sort control (rule 20 — a choice is picked, not typed)
- A compact `Select` sits next to the search box on the Groceries list
  (`apps/web/app/groceries/_components/grocery-list.tsx`). Two options:
  **Name** (the default — the server's existing name-ascending order, kept) and
  **Recently updated**.
- "Updated" = the most recent of three timestamps: the consumable's own
  `updated_at`, its stock row's `updated_at`, and its open to-buy entry's
  `updated_at`. `commerce/inventory.ts` `listGroceries` now selects those three
  and returns a single `updatedAt` on `GroceryItem` (`latestOf`, the max). The
  open to-buy entry is already the `to_buy`-only one the query narrows to, so a
  closed entry never counts.
- Sorting is **client-side** over the already-fetched list (the list has no
  pagination and is bounded by one household), so **no index and no extra query**
  are needed. The comparator is stable with a clear tiebreak: Recently updated is
  newest-first then by name then id; Name is name then id.
- The choice is kept **per device** in `localStorage` (`wh.groceries.sort`),
  matching the existing swipe-hint pattern; it falls back to Name and is read in
  an effect (same idiom as `companion-card.tsx`), so there is no hydration
  mismatch.

### 2. Compact cards (`packages/core/src/components/ui/grocery-row.tsx`)
- Tightened vertical rhythm: row `py-2.5 → py-1.5`, `gap-y-2 → gap-y-1`, the
  IN STOCK / TO BUY label now `leading-none`, the label→control gap `1 → 0.5`,
  the status bar inset `2.5 → 2`, and the to-buy Remove margin `mt-1 → mt-0.5`.
- **Measured at 360 px** (seeded test household, before vs after, same server):
  off-list cards (showing "+ cart") fell from a ~126 px pitch to ~106 px; on-list
  cards (showing the to-buy stepper + Remove) from ~166 px to ~144 px; the label
  line from 17 px to 11 px.
- What was **kept**: the design note's "two equal cells" (In stock / To buy, each
  its label over its own − amount + control, lined up row to row); names never
  truncated (rule 11); the green left-edge status bar; the 36 px stepper controls
  (the app's established size — shrinking them would hurt legibility, enlarging to
  44 px would fight the compaction goal); nutrition line and thumbnail; all three
  tabs and their counts; what the steppers do.

### 3. Realignment
- Labels and steppers line up consistently across every card whether or not it
  has a thumbnail, nutrition line, Remove or "+ cart", on phone (two cells under
  the name) and desktop (inline beside the name). Verified visually at both sizes.

### Honest note on "roughly double"
The owner asked to "aim to roughly double" how many cards fit. The achieved
density is ~15–25% more (uniform ~106 px cards, down from a 126–166 px mix). A
literal 2× is not reachable while keeping two 36 px steppers, the IN STOCK /
TO BUY word-labels, the name + category line, and the one-tap Remove — the honest
floor is ~100 px. Going further would mean dropping the word-labels or the inline
Remove, which the design note mandates and which would cost clarity; that was not
done. If the owner wants more, relocating Remove to the row corner (rule 11) is a
possible follow-up.

## i18n & help
- Sort labels `grocery.sort.{label,name,recent}` added in all eight languages
  (`packages/core/src/i18n/messages/areas/grocery/*.ts`).
- Help section **Meals, groceries and running out of things** (`body.2`, the list
  controls paragraph) gains one sentence about sorting, in all eight languages;
  the section's `updated` date and keywords bumped in `help/guide.ts`.

## Verified
- `typecheck` (core + web) clean; ESLint on changed web files clean;
  `lint:help-links` and `check:bundle` pass (no guide text in client chunks).
- Unit tests: `commerce/inventory.test.ts` gains three `updatedAt` cases (max of
  item / stock / to-buy); touched fixtures (`shortfall`, `receipt-stock`,
  `grocery-units`, `whatsapp-intake`, `conversation/evaluation`) updated for the
  new required field; all green.
- `npm run build -w apps/web` succeeds.
- **Signed-in production run** against the E2E/live project at 360 px and desktop,
  with a seeded throwaway household (deleted after): the sort reorders the list
  and the choice persists across reload; `scrollWidth === 360` on All and To buy
  (no horizontal overflow); cards visibly tighter and aligned.

## Where the code lives
- `packages/core/src/commerce/inventory.ts` — `updatedAt` on `GroceryItem`,
  `latestOf`, the widened `ITEM_COLUMNS`.
- `apps/web/app/groceries/page.tsx` — maps `updatedAt` into the list item.
- `apps/web/app/groceries/_components/grocery-list.tsx` — sort state, control,
  comparator.
- `apps/web/app/_lib/grocery-words.ts` — `sort` words.
- `packages/core/src/components/ui/grocery-row.tsx` — compact layout.
- `apps/web/app/groceries/_components/to-buy-stepper.tsx` — Remove margin.

## Open / needs a person
- None. The owner may decide whether to push density further (see the honest note).

Cleanup: the QA household and auth user created for the signed-in check were
deleted in the same session (0 rows confirmed remaining). No scratch files left in
the working tree.
