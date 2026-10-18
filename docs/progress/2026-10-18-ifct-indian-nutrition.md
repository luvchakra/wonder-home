# HomeFood: Indian nutrition (25-009) and a search that shows what a household means (25-010)

**Date:** 2026-10-18 · **Stories:** 25-009 and 25-010 (Done)

## What the owner asked

1. Indian foods should get an Indian nutrient profile, from a genuine public Indian source. USDA is kept for later.
2. Typing "eggs" should not offer eight kinds of egg. Show the everyday choice and the brands on sale, with pictures.
3. Don't show an amount in the dropdown. After an entry is picked, let the person change the amount.
4. Amounts should move the way people buy:
   - eggs one at a time;
   - loose vegetables 1 kg, 1.25 kg, 1.5 kg;
   - never 1.1 kg of atta when shops sell 1, 2 and 5 kg packs.
5. The Add an item sheet should not sit behind the phone's keyboard.

## The Indian source, and its rights

**The source.** The authoritative Indian table is the Indian Food Composition Tables 2017 (IFCT): T. Longvah, R. Ananthan, K. Bhaskarachary and K. Venkaiah, ICMR–National Institute of Nutrition, Hyderabad. It covers 528 key foods in 542 entries, analysed from samples taken in six regions.

**The rights.** The book encourages use of its data. Its copyright page also says it may not be stored electronically "for creating a product without the prior written permission" of NIN.
- Every open copy is built on IFCT, and none of them clears that.
- That includes the 2024 Indian Nutrient Databank (INDB). Its README says IFCT "must be requested from the original source".

**The decision.** The owner chose to load IFCT now, credited to ICMR–NIN wherever it is shown, and to ask NIN for permission in parallel. The draft email is below.

## What was built

### Indian nutrition (25-009)

- **The table.** `ifct_foods` (migration `20261018220000`, applied live) holds the 542 entries, per 100 g edible portion. Each has 14 nutrients: energy, protein, carbohydrate, sugars, fat, saturated fat, fibre, sodium, calcium, iron, potassium, zinc, vitamin C and folate.
  - Signed-in members can read it; no session can write it.
- **The loader.** `npm run catalog:ifct` reads a pinned, sha256-checked copy of the MIT-licensed digitisation (`@ifct2017/compositions@2.0.9`). The table itself is never kept in the repository.
- **The conversion.** `commerce/ifct.ts` converts grams to each nutrient's own unit. A blank value stays unknown.
- **Energy fixes.** Energy is computed from the table's own protein, fat, carbohydrate and fibre, and the item page says so, for 17 entries:
  - the 14 oils, which the table gives no energy for;
  - 3 entries it contradicts by more than half: chicken leg, lemon juice and one crab.
- **The links.** 399 curated items link to their IFCT food (`grocery_catalog.ifct_code`, `supabase/seed/grocery-catalog/ifct-links.csv`): 220 exact, 175 close, 4 approximate.
  - Every match is the same food in the same state.
  - "Close" means a different variety or cut, and the note says which.
  - Nothing processed is matched.
  - The judgement calls are listed in the PR.
- **The item page.** It shows IFCT nutrition, the match ("A close match: the values are for Red gram, dal") and the ICMR–NIN credit. A packed product still shows its own label.

### Search and amounts (25-010)

- **Everyday items.** `grocery_catalog.common` marks the 411 everyday items in `items.csv`.
- **What the search shows.** The search (`search_grocery_catalog_kind`, `chooseResults`) shows:
  - the everyday items only, when any match ("eggs" gives white and brown eggs);
  - otherwise the item the words name ("duck eggs");
  - then the brands on sale, one entry per brand and name, each with a picture.
- **No amounts in the list.** Tapping an entry opens − and +, starting from the usual buy, and an Add button.
- **Natural amounts.** `commerce/buying-sizes.ts` gives each item a ladder, stored as `grocery_catalog.buy_sizes`. Every stepper walks it: the list, the item page and Add an item.

  | Kind of item | Ladder |
  |---|---|
  | Loose produce, meat, fish | 250 g, 500 g, 750 g, 1 kg, 1.25 kg, 1.5 kg, 1.75 kg, 2 kg, then on |
  | Atta | 1, 2, 5, 10 kg |
  | Rice | up to 25 kg |
  | Dal | 500 g to 5 kg |
  | Spices | 50 to 500 g |
  | Dry fruit | 100 g to 1 kg |
  | Oil | 500 ml to 5 l |
  | Milk | by the half litre |
  | Eggs, packets, bottles, bunches | one at a time |
  | A packed product | one pack at a time |

  - A household's own "Step for + and −" still wins.
  - An amount between rungs, such as one typed or said to HomeTalk, moves to the rung beside it.
- **Pictures.** Everyday items get pictures from Wikimedia Commons, under CC0, PD, CC BY or CC BY-SA only.
  - `npm run catalog:pictures` copies each one into WonderHome's storage and records its author, licence and file page.
  - The item page credits the picture, and the search sheet says where the pictures come from.
- **The keyboard.** `Sheet` rises above the on-screen keyboard (`visualViewport`), on Android and iOS alike, without changing how the rest of the app lays out.

## Verified

- **Unit tests.**
  - `buying-sizes.test.ts`: eggs 12 → 13 → 14; onion 1 → 1.25 → 1.5 kg; atta 1, 2, 5, 10 kg, and 1.1 kg moves to 2 kg.
  - `ifct.test.ts`: units, computed energy, blanks stay unknown, a bad mapping is refused.
  - `catalog.test.ts`: the eggs case and the duck-eggs case.
  - `catalog-curated.test.ts`.
- **DB test.** `scripts/test-grocery-catalog-rls.mjs` passes 7/7, including the kind search and the IFCT link rules. The tenant-isolation test passes.
- **Live.** Migrations `20261018220000` and `20261018230000` are applied. The seed, IFCT and pictures loaders have run. `npm run verify:live` passes, including the new IFCT, everyday-item and search probes.

## Needs a person

**Write to ICMR–NIN.** Send this from connect@wonderapps.biz to the Director, ICMR–National Institute of Nutrition, Jamai Osmania PO, Hyderabad 500007 (+91 40 2719 7334, via nin.res.in):

> Subject: Permission to use IFCT 2017 data in a household app
>
> Dear Director,
>
> WonderHome (home.wonderapps.biz) is a household app built in India that helps families keep their groceries and meals. We would like to show, for everyday Indian foods a family buys (dals, atta, vegetables, paneer, jaggery and the like), the nutrient values from the Indian Food Composition Tables 2017, credited on every screen as "Indian Food Composition Tables 2017, ICMR–National Institute of Nutrition, Hyderabad".
>
> We show values per 100 g edible portion for about 400 foods, unchanged, and we make no health claims from them. We would be grateful for NIN's written permission to store and display these values in our app, and we will follow any terms NIN sets, including the form of the credit.
>
> Thank you,
> Kunal, WonderHome, connect@wonderapps.biz

**Check the catalog by eye.** A native speaker should review the regional names and close matches the curators flagged (listed in the PR).

## Where the code lives

- **Core:** `packages/core/src/commerce/ifct.ts`, `buying-sizes.ts` and `catalog.ts` (`chooseResults`, `householdLadder`, `stepperOf`).
- **Screens:**
  - `apps/web/app/groceries/_components/add-item.tsx`;
  - `to-buy-stepper.tsx`;
  - `[itemId]/page.tsx`;
  - `packages/core/src/components/ui/sheet.tsx`.
- **Scripts:** `scripts/catalog-ifct.ts`, `catalog-pictures.ts` and `catalog-seed.ts`.
- **Data:** `supabase/seed/grocery-catalog/ifct-links.csv`, `pictures.csv` and `items.csv`.
- **Migrations:** `supabase/migrations/20261018220000_ifct_indian_nutrition.sql` and `20261018230000_grocery_catalog_common_and_pictures.sql`.
