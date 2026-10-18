# Grocery catalog — seed, import and matching design

**Status:** Phase C proposal. **Not approved and not implemented.**

## 1. Seed strategy: curate first, then enrich

The pilot is **500 distinct, commonly bought Indian household items**. They are written by WonderHome, not taken wholesale from any source. Source record counts are not grocery counts, and IFID's 623 entries include additives and botanicals no household buys.

1. **Skeleton (WonderHome's own work, no licence question).**
   - A curated list of `canonical_name`, `category_id`, `item_kind`, `food_state`, `variant`, `default_unit` and `step`.
   - Weighted to a weekly basket: fresh produce, dals, atta and flours, rice and grains, spices, oils and ghee, dairy, eggs, meat and fish, bakery, snacks, beverages, cleaning, personal care.
   - Cleaning and personal care are `household_nonfood`, with **no nutrition link**.
2. **Aliases**, as *candidates* with source and language:
   - IFID: ODC-By, attribution kept, so it can be used if attributed;
   - candidate regional names (rights pending);
   - a curated set WonderHome writes and verifies.

   Only verified aliases reach search.
3. **Nutrition links**, as *candidates*: USDA FoodData Central (public domain) first. Each one is reviewed (§3). IFCT-derived values stay **research-only** until the owner clears ICMR-NIN rights.
4. **Packaged products:** Open Food Facts India, kept as its own `retail_products` plus `source_records` layer with the ODbL and CC BY-SA credit. Products are linked to an item only by review.
5. **OpenMRP:** evaluated, not imported. It is pre-launch and its coverage is not established.

## 2. Normalization (one function, `catalog/normalize.ts`, pure, golden-tested)

- **Characters:** NFKD; strip diacritics and punctuation; collapse whitespace; lowercase.
- **Spelling:** ASCII folding of common transliteration variants, a small table WonderHome reviews (`aa`→`a` only where it is safe, `w`/`v`, `ee`/`i`). The **original is always kept** as the alias's `name`; the folded form is only the `normalized` search key.
- **Singular and plural:** "tomatoes" becomes "tomato", using the same rule `units.ts` uses for unit words, applied to the last word only.
- **Descriptors kept, not stripped:** "split", "whole", "unpolished", "fortified", "full cream", "fresh", "dried", "raw", "cooked". They decide which item a phrase is, so "toor dal" and "toor dal whole" are different items.

## 3. Matching rules

| Input | Rule | Outcome |
|---|---|---|
| A barcode | Exact `barcode_gtin` → `retail_products` | Product found. Its **label** nutrition belongs to the product; it is never copied onto the item |
| A typed or spoken name | `normalized` exact on a verified alias, one item | That item |
| The same, on two items | Collision | One question ("Toor dal or Toor dal whole?"), never a pick |
| A near match (trigram ≥ 0.6) | Candidate | Shown as a suggestion; never auto-linked |
| Nutrition for an item | Only an **approved** `nutrition_links` row with the same `food_state` | Values shown, with basis, provider and version, and "approximate" when `match_type ≠ exact` |
| No approved link | Nothing | "No nutrition on record" — never a value inferred from name similarity |

**Auto-approve only deterministic, independently verified exact matches.** In practice that means an FDC id WonderHome curated by hand for that exact item and state, double-checked by a second reviewer. Everything else goes through `catalog_review_tasks`. No FDC id is ever written without its record being fetched and stored in `source_records`.

## 4. The importer (idempotent, staged, reversible)

- **Inputs:** a source adapter per dataset (`ifid`, `usda_fdc`, `off`), each pinned to a version (a commit SHA, a dump date or an API version).
- **Stage 1, fetch:** write `source_records` keyed on (`source`, `source_record_id`, `source_version`). A rerun with the same version and hash is a no-op.
- **Stage 2, transform (dry run by default):**
  - Produce candidate aliases, nutrition candidates and product rows into a **diff report**: new, changed, unchanged, collisions, blocked by rights.
  - Nothing is written to master tables in a dry run.
- **Stage 3, apply (approved only):** an `--apply <report-id>` run writes exactly the reviewed diff, in one transaction per batch, tagged with an `import_batch_id`.
- **Rollback:** delete by `import_batch_id`, in reverse dependency order. Household `consumables.catalog_item_id` links survive because of `on delete set null`, and a household loses nothing.
- **Rights gate:** a source whose `rights_status` is `research_only` or `blocked` can be fetched for the audit, but its records cannot pass Stage 3.
- **Where it runs:** a platform job behind `CRON_SECRET`, like retention. It is never callable from a household session.
- **Refresh:** a few queries a night for Open Food Facts (rate-limit friendly, identifying User-Agent). USDA runs on its own published release schedule.

## 5. How WonderHome's existing paths use it

- **Add an item:**
  - The household's own items come first.
  - Then catalog items by verified alias, showing the canonical name, the household's language label and the illustration.
  - Then packaged products when the person searches a brand.
  - Picking one creates or links the household's item through the existing near-duplicate gate.
- **HomeTalk and HomeSend:** `matchIncoming` and `matchConsumable` gain the catalog's verified aliases, so that "arhar dal" finds the household's "Toor dal". They still resolve to the **household's** item, never straight to a catalog row. A receipt line stays household-private.
- **Meals:** `recipe_ingredients` can name a catalog item, so shortfalls know the unit and dimension.
- **Nutrition:** shown on the item's page only (per 100 g, its source and version, "approximate" where it is). It is not used for any health claim, and nothing is computed from it in the pilot.
- **Search performance:**
  - At pilot scale (≈500 items, ≈3,000 aliases, a few thousand products), `pg_trgm` GIN plus a prefix index answers well inside the 500 ms p95 read target.
  - The query is debounced by 250 ms in the sheet.

## 6. Review workflow (platform staff)

The platform-admin area gets one screen: a review queue by kind. Each task shows the evidence (the source record, the proposed link, its state and basis) and offers Approve, Reject, or Merge into…. Every decision is recorded with who made it and when. This is the brief's "admin preview".
