# Grocery catalog — current state and USDA compatibility

**Status:** Phase A of the owner's brief `WonderHome_Grocery_Catalog_Implementation.md` (18 Oct 2026). Read-only discovery. No design here is approved.

## 1. The USDA import the brief refers to does not exist

The brief says a USDA FoodData Central import is already underway and must be left untouched. This was checked on 18 Oct 2026:

- **`main` and every branch on GitHub:** searched for `usda`, `fooddata` and `fdc_id` in migrations, `packages/core/src` and `scripts`. No match outside this session's own uncommitted catalog work.
- **The live database (`kqxndableyysxqhxiorz`):** searched for tables named like `%usda%`, `%nutri%`, `%fdc%`, `%food%` and `%catalog%`. The only matches were `public.food_preferences` (unrelated: a household's likes and dislikes) and `public.grocery_catalog` (see §4).

So there is no USDA table, importer, job or ID scheme to stay compatible with. If an import is running somewhere else (another repository, a notebook or a vendor), the owner needs to point to it. Until then the design treats USDA FDC as a **future nutrition provider** behind the same link table as every other source, and never as a WonderHome ID.

## 2. What WonderHome already has for groceries

Every grocery table today is **tenant-scoped**: one household's rows, under RLS. There is no global catalog, and nothing is shared between households.

| Table | Migration | What it holds |
|---|---|---|
| `consumables` | `20260917143614`, extended `20261017200000` | A household's tracked item: `name` (unique per household), open `category`, preferred `unit`, `step`, `low_level`, `storage`, `note`, `aliases text[]` (up to 10), `image_path` (a household's own photo), purchase-rate fields, `active` |
| `inventory_balances`, `inventory_events` | `20261017200000` | What is at home, in base units (g, ml, pcs or a household's own word), with an event log keyed by idempotency key |
| `shopping_list_entries`, `shopping_list_events` | `20261017200000` | What is to buy, with an event log; one open entry per item |
| `consumable_purchases` | `20260917143614` | Purchases (manual, receipt, mark bought), with merchant, unit cost and best-before |
| `recipe_ingredients` | `20260917163112` | A recipe's ingredient by **name**, `quantity` and `unit`, optionally linked to a household `consumable_id` |
| `cart_suggestions`, `merchant_offers`, `orders`, `order_items`, `purchase_policies` | `20260917143614` | Commerce scaffolding; no live retailer integration |

**Units** are `packages/core/src/commerce/units.ts`: mass (g base), volume (ml base), count (pcs base, dozen = 12), and any other word as its own "each" dimension. Nothing converts across dimensions.

## 3. Where a grocery name is resolved today

Every path ends at a household `consumables` row. None has a global identity.

| Path | Code | How it matches |
|---|---|---|
| Add item (Groceries) | `apps/web/app/groceries/_components/add-item.tsx`, `addGroceryItemAction` | Substring on the household's names and aliases, then `similarity ≥ 0.8` refusing a near-duplicate |
| HomeTalk ("add milk", "we have 10 eggs") | `conversation/grocery-actions.ts`, `context/matching.ts` (`matchIncoming`) | Name, alias and token similarity over the household's own items |
| HomeSend receipts | `commerce/receipts.ts` (`matchConsumable`) | A suggestion only where the line plainly is one tracked item, never a guess |
| Meals | `meals/shortfall.ts` (`itemFor`) | `consumable_id` link, else one exact name or alias |
| Agents and partner API | `list.add_item`, `groceries.write` | The same household services |

**This matters for a catalog.** All of these resolve names to the household's own item. A shared catalog has to *feed* that resolution, through better names, aliases and units, without replacing the household's own row or its history.

## 4. What reached production before the brief arrived

Before the brief arrived, this session had started 25-006 on the owner's earlier ask ("a catalog of items… images… nutrient values"), with Open Food Facts plus USDA approved in chat. These changes reached the live project:

- **Migration `grocery_catalog`**, applied live. It is not in `main`: the file is parked with the rest of the work in progress. It created:
  - `public.grocery_catalog`, a platform table holding source, source id, name, brand, category, pack, unit, barcode, image path, per-100 nutrients, licence, attribution and search text. Signed-in members read it; only the service role writes it.
  - a nullable `consumables.catalog_id` foreign key;
  - a public storage bucket, `grocery-catalog`.
- **Data:** 158 Open Food Facts products for India (searches "eggs", "milk" and part of a staples list), with 138 pictures copied into the bucket. Each row carries ODbL / CC BY-SA and "Open Food Facts contributors". The import was **stopped** when the brief arrived.
- **Not shipped:** no application code that reads any of it. The search UI, the server actions and the importer are uncommitted (stash "25-006 catalog WIP"). No household item is linked (`consumables.catalog_id` is null on every row).

**Rollback, if the owner prefers it.** It needs no code change, because nothing reads these:

```sql
-- the bucket's objects are removed through the Storage API (not SQL), then:
alter table public.consumables drop column catalog_id;
drop table public.grocery_catalog;
delete from storage.buckets where id = 'grocery-catalog';
```

The proposal in `GROCERY_CATALOG_SCHEMA_PROPOSAL.md` does **not** reuse `grocery_catalog` as the master. That table mixes the product layer with the item layer, which the brief says to keep apart. It either becomes the Open Food Facts staging table (`retail_products` plus `source_records`) or is dropped. That is a decision request.

## 5. Collision risks for a global catalog

1. **Household privacy.**
   - A global catalog must never learn what any household keeps, buys or calls things.
   - Household aliases (`consumables.aliases`) and receipts stay tenant-scoped.
   - "Household feedback" (Phase E) needs an explicit, aggregate, opt-in design.
2. **Two names for one thing.** A household that already tracks "Toor dal" and then picks the catalog's "Arhar dal" must end up with one item, not two. Linking has to run through the same near-duplicate gate `addGroceryItemAction` uses today.
3. **Units.**
   - The catalog's `default_unit` must be a `units.ts` key. Otherwise `inventory_balances` (which refuses a unit change) and the shortfall arithmetic break.
   - "1 bunch" and "250 g" of coriander are different dimensions and never convert.
4. **Categories.**
   - Household categories are free text; the suggestions are 13 words in 8 languages (`grocery.categories`).
   - A catalog taxonomy needs a stable id plus translated labels. Otherwise a household sees "Pulses" next to its own "Dals".
5. **Nutrition is not a household fact.**
   - Values belong to a catalog item or product, with their basis and state (raw or cooked, per 100 g).
   - They must never be copied into `consumables`, where they would stop being traceable to a source and version.
6. **Licence mixing.**
   - Open Food Facts is ODbL, a share-alike licence for the database.
   - Blending ODbL rows into a proprietary master table can make the master a derived database.
   - Each source therefore stays in its own staging layer, and the master holds only WonderHome's own curated rows plus links.
7. **Search load.**
   - The Add item sheet searches as a person types.
   - At pilot scale (500 to 2,000 items, a few thousand aliases) an indexed prefix and trigram search is enough.
   - `pg_trgm` is not enabled today; the parked migration used a `text_pattern_ops` index plus `ilike`.

## 6. Test framework available

- Vitest unit tests: pure matching, units and mapping with golden fixtures, like `plan.test.ts` and `receipt-stock.test.ts`.
- `npm run test:db` for RLS (`scripts/test-*-rls.mjs`).
- `npm run eval`'s golden households, for HomeTalk and HomeSend resolving to catalog ids.
- Playwright: nightly, plus local browser checks at 360 px and desktop.
