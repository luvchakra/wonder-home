# Groceries tabs: All, In Kitchen, To Buy

Owner request (2026-10-30): second tab "In Kitchen", third "To Buy", keep counts; drop Use soon.

- Tabs: All (count of items), In Kitchen (items with a counted amount above zero, the At home card's test), To Buy (the shopping list, same filter and count as before).
- `?view=in-kitchen` added; `?view=to-buy` unchanged (HomeTalk links keep working); `?view=use-soon` falls back to In Kitchen; default stays All.
- Swipe on In Kitchen behaves like All (stops tracking), only To Buy takes an item off the list.
- Removed the Use soon view, `grocery.useSoon.*` words and `commerce/use-soon.ts` (+ test). Use-by badges elsewhere untouched.
- Words: `grocery.view.inKitchen` and `To Buy` in all eight languages; help guide (meals-and-shopping) rewritten in all eight, `updated` 2026-10-30.
- Verified: typecheck, grocery/i18n/help/commerce unit tests (312 pass). UI check at 360 px: see PR.
- Open: owner to open Groceries and check the three tabs and counts.
