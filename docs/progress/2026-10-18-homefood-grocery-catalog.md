# HomeFood 25-006: the shared grocery catalog

**Date:** 2026-10-18 · **Story:** 25-006 (Done) · **Follow-ups:** 25-007 (USDA linking, phased), 25-008

## What the owner asked

- Typing in **Add an item** should show results the way a quick-commerce app does.
- The results come from one catalog table shared by every household, with pictures and nutrients.
- After the matching study, the owner added three things:
  - the catalog carries a catalog id, and the USDA table links to it by that id;
  - USDA linking is research, done in phases and at lower priority;
  - the catalog itself should be rich and exhaustive.

## What was built

### The table

`public.grocery_catalog` is one platform table. Every signed-in member reads it, no session writes it, and anonymous visitors are refused. Each row's `id` is its **catalog id**.

### Two kinds of entry

- **Items** (`kind = 'item'`, source `wonderhome`): 1,559 generic things WonderHome curated itself, in 29 categories, from vegetables and dals to cleaning, pooja and pet care.
  - Each item has a usual pack and unit (the `units.ts` keys).
  - Each item has its other names: English spellings, Hindi in Latin and Devanagari, and regional names where the curators were confident.
  - The source file is `supabase/seed/grocery-catalog/items.csv`, loaded by `npm run catalog:seed` (`--apply` to write). The pure parser and validator is `commerce/catalog-curated.ts`.
  - The seed is idempotent per slug, so the catalog id never changes. An item removed from the file is set inactive, never deleted.
- **Products** (`kind = 'product'`, source `open_food_facts`): Open Food Facts India, swept most-scanned first (`sweepIndianProducts`).
  - A product is kept only if it has an Indian (890…) barcode, a brand, one pack size and a picture, and is not alcohol (`isCatalogQuality`).
  - Its picture is copied into WonderHome's `grocery-catalog` bucket, so a household's browser never loads it from a third party.
  - Label nutrients are kept as stated. A missing nutrient is absent, never 0.
  - Open Food Facts categories are mapped to the curated categories, so the catalog has one taxonomy.

### Search

`public.search_grocery_catalog` ranks results in the database, in this order:
1. the name is the word, or begins with it as a whole word;
2. the name begins with the word;
3. a word of the name begins with it;
4. another name has a word beginning with it;
5. the word appears anywhere.

Ties go to WonderHome's own items, then entries with pictures, then shorter names.

### Screens

- **Add an item** shows the household's own items first, then the catalog. An entry the household already tracks is not offered again.
- Picking an entry creates the household's own item linked to the catalog (`consumables.catalog_id`), or reuses one with the same name, and puts one pack on the list.
- The item page shows the catalog picture until the household adds its own photo.
- The item page shows label nutrition per 100 g or 100 ml, credited to its source.

### USDA

`public.usda_foods` (service role only) has one row per USDA food, with a `catalog_id`, a `link_status` (unlinked, candidate, approved, rejected) and a `match_type`. A check keeps the catalog id and the status in agreement. The table is empty: loading and linking are 25-007, done in the phases the matching study recommends.

## Verified

- **Unit tests:** `catalog-curated.test.ts` (parser, validator, and the shipped file loads clean with more than 1,000 items) and `catalog.test.ts` (Open Food Facts mapping, categories, quality filter); 216 commerce, meals and evaluation tests pass.
- **DB test:** `scripts/test-grocery-catalog-rls.mjs` covers member read, no session write, anonymous refused, ranking and inactive entries, the item link check, USDA service-role only, and the link-shape check.
- **Migration lint** passes.
- **Live:** both migrations are applied, and `npm run verify:live` passes 268/268, including the new catalog and USDA probes.
- **Browser** at 360px and 1280px, against the live project with a QA household:
  - "arhar" finds Toor dal;
  - "प्याज" finds Onion;
  - "maggi" shows products with pictures, brands and packs;
  - adding a product puts it on the list and the catalog stops offering it;
  - 7up's page shows its label nutrition with the credit;
  - no horizontal scroll.

## Still open

- **25-007:** USDA nutrition, in phases (load, candidates, review, display). Lower priority, as the owner set it.
- **25-008:**
  - pictures for curated items (they show the category icon today);
  - a product linked to its generic item (`item_id`, by review);
  - a native speaker's check of the regional names the curators flagged (some Malayalam, Kannada and fish names).
- **Open Food Facts terms** still need to be read on an unblocked machine, as `DECISION_REQUEST.md` D5 says. Every product carries the ODbL and CC BY-SA credit.

## Where the code lives

- **Core:** `packages/core/src/commerce/catalog.ts`, `catalog-curated.ts`, `catalog-import.ts`.
- **Screens:** `apps/web/app/groceries/_components/add-item.tsx` and `apps/web/app/groceries/[itemId]/page.tsx`.
- **Migrations:** `supabase/migrations/20261018190000_grocery_catalog.sql` and `20261018200000_grocery_catalog_items_and_usda.sql`.
- **Seed:** `scripts/catalog-seed.ts`.
