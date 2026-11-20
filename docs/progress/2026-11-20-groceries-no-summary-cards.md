# Groceries: summary cards removed, Order on Instamart only on To Buy (25-047)

**Asked (owner, 2026-11-20, marked-up screenshot):** "remove crossed out section. show order from Instamart only if to buy tab is clicked".

## What changed
- `apps/web/app/groceries/_components/grocery-list.tsx`: the three `MetricCard`s on To Buy are gone, with the stock filter they drove.
  - **At home**: a tap filtered to items with stock, the same set as the In Kitchen tab. Removed.
  - **Not counted yet**: a tap filtered to items nobody has counted. Removed; every row still says "Not counted yet" in its own status line. If the owner wants the filter back, a sort option or a chip is the place.
  - **Mark as bought**: the only door to the "What did you buy?" sheet (`mark-bought.tsx`). Kept as one quiet outline button at the top of To Buy (adults, when something is on the list).
- `apps/web/app/groceries/page.tsx`: Order on Instamart renders only when `view === "to-buy"`; on All and In Kitchen, Add item stands alone. Behaviour and consent unchanged.
- Words: `grocery.summary.atHome`/`notCounted` removed (eight languages); help meals-and-shopping ¶2 and ¶21 rewritten in eight languages, `updated` 2026-11-20.
- No database change.

## Verified
- Typecheck, ESLint on the touched files, `vitest` for groceries, help and i18n (110 passed), `lint:help-links`.
- Signed in (dev server, live project, QA household) at 360 px and 1280 px on All, In Kitchen and To Buy: no horizontal overflow; Order on Instamart and Mark as bought only on To Buy; Mark as bought opens the sheet.

## Cleanup
The QA household (`9edb347d-…`) and user (`143e8b61-…`) were deleted and confirmed gone by count; scratch scripts were in the session scratchpad only.
