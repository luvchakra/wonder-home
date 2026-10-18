# Grocery catalog — schema proposal

**Status:** Phase C proposal. **Not approved and not migrated.** It adapts §4 of the brief to WonderHome's existing tables.

## Principles

1. **Three layers, never blended:**
   - the **item** ("Toor dal, split, raw"), which is WonderHome's own curated row;
   - the **product** ("Tata Sampann Toor Dal 1 kg", barcode 890…), from a source, with that source's licence;
   - the **nutrition reference** (a provider's food id plus values, per basis and state).

   Items link to products and to nutrition. A product never becomes an item, and a nutrition value never sits on an item.
2. **Every source stays in its own staging layer** (`source_records`), with its licence and rights status. The master tables hold only WonderHome's own curated fields and *links*, so share-alike data (Open Food Facts, ODbL) is not invisibly blended into a proprietary master.
3. **Households stay tenant-scoped.**
   - `consumables` keeps a household's names, amounts and history.
   - It gains one nullable link, `catalog_item_id`, and nothing else.
   - No household data ever flows into the global tables.
4. **Global tables are read-only to every session.**
   - Signed-in members `select`.
   - Only the service role (the importer and the platform-staff review screen) writes.
   - Each table is listed in the migration lint's `NON_TENANT_TABLES` with a reason.
5. **Units are `units.ts` keys**, and categories are stable ids with translated labels.

## Tables

### `catalog_categories`
| Column | Type | Notes |
|---|---|---|
| `id` | text pk | Stable slug: `vegetables`, `fruits`, `pulses`, `flours`, `grains`, `spices`, `oils`, `dairy`, `eggs`, `meat_fish`, `bakery`, `snacks`, `beverages`, `home_cleaning`, `personal_care`, `baby`, `pet` |
| `parent_id` | text null | For later depth (`pulses` › `split_pulses`) |
| `is_food` | boolean | False for cleaning and personal care: **no nutrition link is allowed** (enforced by a trigger on `nutrition_links`) |
| `label_key` | text | i18n key: `catalog.category.<id>`, in all 8 languages |

### `catalog_items` (the brief's `grocery_items`)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | WonderHome's stable id; never a source's id |
| `canonical_name` | text | English canonical, e.g. "Toor dal" |
| `category_id` | text fk → `catalog_categories` | |
| `item_kind` | text | `ingredient` · `food` · `household_nonfood` |
| `food_state` | text null | `raw` · `dried` · `split` · `whole` · `cooked` · `fresh` · `frozen` · `processed`; null for non-food |
| `variant` | text null | What makes it nutritionally distinct: "split, unpolished", "full cream" |
| `default_unit` | text | A `units.ts` key (`kg`, `g`, `l`, `ml`, `pcs`, `dozen`, `bunch`, `pack`…) |
| `step` | numeric null | The usual buying step, in `default_unit` |
| `active` | boolean | |
| `review_status` | text | `candidate` · `approved` · `rejected` · `merged` |
| `merged_into` | uuid null | A duplicate's survivor, so links and household items can follow it |
| `image_path` | text null | WonderHome's own illustration (house style), never a retailer photo |
| `created_at`, `updated_at`, `approved_by`, `approved_at` | | `approved_by` names a platform admin |

Unique: (`canonical_name`, `food_state`, `variant`), case-insensitively.

### `catalog_aliases`
| Column | Type | Notes |
|---|---|---|
| `item_id` | uuid fk | |
| `name` | text | As written: "अरहर दाल", "arhar dal", "pigeon pea" |
| `normalized` | text | Lowercased, NFKD, punctuation stripped, transliterated to Latin where the source gives one; this is the search key |
| `language_code` | text | BCP-47: `en`, `hi`, `mr`, `ta`, `te`, `kn`, `ml`, `bn`, `gu`, `pa`… |
| `script` | text | ISO 15924: `Latn`, `Deva`, `Taml`… |
| `region` | text null | `IN-MH`, `IN-TN`… where the name is regional |
| `source` | text | `ifid`, `ind_nutrition`, `ifct_regional`, `curated`, `household_feedback` |
| `source_record_id` | uuid null fk → `source_records` | |
| `verified` | boolean | Only verified aliases are searched by default; candidates feed the review queue |

Unique: (`item_id`, `normalized`, `language_code`). An index on `normalized` (trigram, once `pg_trgm` is enabled) finds collisions: one normalized alias on two items becomes a review task, never a silent merge.

### `nutrition_links`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `item_id` | uuid fk | |
| `nutrition_provider` | text | `usda_fdc` · `ifct2017` · `ind_nutrition` · `off_label` |
| `provider_food_id` | text | e.g. an FDC id, or an IFCT code `A001`; **never invented** |
| `food_state` | text | Must equal the item's state, or the link is `approximate` |
| `match_type` | text | `exact` · `close` · `approximate` |
| `confidence` | numeric(3,2) | |
| `is_default` | boolean | At most one default per (`item_id`, `food_state`): a partial unique index |
| `review_status` | text | `candidate` · `approved` · `rejected` |
| `reviewed_by`, `reviewed_at`, `notes` | | |

### `nutrition_values`
| Column | Type | Notes |
|---|---|---|
| `provider`, `provider_food_id`, `version` | text | e.g. `usda_fdc` / `171287` / `SR Legacy 2018-04` |
| `basis` | text | `100g` · `100ml` · `serving` |
| `serving_size`, `serving_unit` | | When `basis = serving` |
| `food_state` | text | |
| `nutrients` | jsonb | `energy_kcal`, `protein_g`, `carbohydrate_g`, `sugars_g`, `fat_g`, `saturated_fat_g`, `fibre_g`, `sodium_mg`, … A missing key is unknown, never 0 |
| `source_record_id` | uuid fk | The exact record and version the values came from |

Unique: (`provider`, `provider_food_id`, `version`). The one nutrition engine is this table; the app reads values only through `nutrition_links`.

### `retail_products` (packaged products; Open Food Facts first)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `item_id` | uuid null fk | Set only by review; a barcode identifies a product, not an ingredient's nutrition |
| `brand`, `product_name` | text | |
| `barcode_gtin` | text | 8 to 14 digits; unique per `source` |
| `pack_value`, `pack_unit` | numeric, text | `units.ts` key |
| `label_nutrition` | jsonb null | The product's own label values, with basis |
| `image_path` | text null | Copied into WonderHome storage at import (the CSP and privacy reasons in the current-state doc), with the image's own licence |
| `image_licence`, `image_attribution` | text | Open Food Facts pictures are CC BY-SA, separately from the ODbL data |
| `source`, `source_license`, `source_record_id` | | |

### `retailer_listings` (Phase E, optional)
`retail_product_id`, `retailer`, `retailer_sku`, `listing_url`, `location_scope`, `last_verified_at`. **Empty until a retailer grants access.** No scraping.

### `source_records` (provenance)
| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `source` | text | `ifid`, `ind_nutrition`, `ifct_derived`, `ifct_regional`, `off`, `openmrp`, `usda_fdc` |
| `source_record_id` | text | The source's own id |
| `source_version` | text | Commit SHA, dump date or API version |
| `content_hash` | text | sha256 of `original` |
| `url`, `retrieved_at` | | |
| `original` | jsonb | The record as received |
| `licence`, `attribution` | text | |
| `rights_status` | text | `cleared` · `attribution_required` · `share_alike` · `research_only` · `blocked` |
| `transformation` | jsonb | What the importer derived from it, and the importer's version |

Unique: (`source`, `source_record_id`, `source_version`). **Rows with `rights_status` `research_only` or `blocked` are never linked from an approved item.** A trigger refuses that.

### `catalog_review_tasks`
`id`, `kind` (`alias_collision` · `duplicate_item` · `nutrition_candidate` · `product_link` · `category`), `subject` jsonb, `status`, `resolved_by`, `resolved_at`. This feeds the platform-staff review screen.

### Household side: the only change to tenant tables
```sql
alter table public.consumables add column catalog_item_id uuid references public.catalog_items (id) on delete set null;
```
- A household's item picked from the catalog keeps its own name, amounts and history.
- The link brings the catalog's aliases into matching, its picture as a fallback, and its approved nutrition.
- Merging catalog items (`merged_into`) updates links by trigger.

## RLS and grants

| Table | Members (session) | Platform staff | Service role |
|---|---|---|---|
| `catalog_categories`, `catalog_items` (approved), `catalog_aliases` (verified), `nutrition_values` reached through approved links, `retail_products` | select | select | all |
| Candidates, `source_records`, `catalog_review_tasks` | none | select and resolve, through platform-admin routes | all |
| `consumables.catalog_item_id` | as `consumables` today | | |

`nutrition_values.nutrients` carries no personal data. `source_records.original` may hold contributor names (Open Food Facts creator fields); the importer drops personal fields before storing.

## Migration plan (after approval only)

1. **`…_catalog_core.sql`** (additive):
   - categories, items, aliases, `source_records`, review tasks;
   - `pg_trgm`, with indexes on `catalog_aliases.normalized` and `catalog_items.canonical_name`;
   - RLS and grants;
   - `NON_TENANT_TABLES` entries.
2. **`…_catalog_nutrition.sql`** (additive): `nutrition_values`, `nutrition_links`, the default-uniqueness index, and the non-food trigger.
3. **`…_catalog_products.sql`** (additive): `retail_products`, plus a decision on today's `grocery_catalog` (migrate its 158 rows into `source_records` and `retail_products`, or drop them).
4. **`…_consumables_catalog_link.sql`**: the one nullable column.

Every migration is additive and is applied live in the story that introduces it, followed by `npm run verify:live`. Rollback for each one is `drop table` or `drop column`, in reverse order, with nothing household-owned lost.
