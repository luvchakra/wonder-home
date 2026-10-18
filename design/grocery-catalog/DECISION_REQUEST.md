# Grocery catalog — decision request

**Status:** the STOP GATE in the owner's brief. The design, schema, licensing review, source-quality report, sample records and pilot plan are written. **No schema migration, bulk import or production change happens until the owner answers below.**

## What is being asked for

| Document | What it says |
|---|---|
| `CURRENT_STATE_AND_USDA_COMPATIBILITY.md` | What exists today, including the inert `grocery_catalog` table, and the rollback SQL |
| `GROCERY_CATALOG_SCHEMA_PROPOSAL.md` | Separate item, product and nutrition layers; each source in its own provenance layer; read-only global tables |
| `SEED_IMPORT_AND_MATCHING_DESIGN.md` | A curated 500-item pilot; a staged, reversible importer; review-gated links |
| `USDA_NUTRITION_MATCHING_STUDY.md` | How to match items to USDA: four methods measured on 200 items |
| `DATA_SOURCE_LICENSE_AND_QUALITY_AUDIT.md` | What each source allows, and how good it is |
| `SAMPLE_RECORDS.md` | 26 sample rows with real USDA links |
| `PILOT_TEST_PLAN.md` | The checks the pilot must pass |

## The recommendation, in one paragraph

Use USDA FoodData Central (Foundation and SR Legacy, public domain) for the nutrition of fresh produce, staples, dairy and meat. Match with the structured method (M4): 85.9% right first time on the test set, with the right record in the top three about 92% of the time. Then a person approves every link; nothing is auto-approved in the pilot. Packaged foods take their own label from Open Food Facts, kept as its own credited layer. Cleaning and personal-care items never carry nutrition. Indian foods USDA does not have (paneer, jaggery, poha, makhana, curry leaves) show "No nutrition on record" until a licensed Indian source exists.

## Decisions

| # | Decision | Options | Recommended |
|---|---|---|---|
| D1 | **Approve the design** (schema, importer, review workflow) | Approve · change · reject | Approve |
| D2 | **USDA as the nutrition source for generic foods**, matched by M4 and approved by a person | Approve · use another method | Approve (the owner already asked for USDA) |
| D3 | **Indian-specific nutrition** | (a) Ask ICMR-NIN for written permission to use IFCT 2017 · (b) leave those items without nutrition · (c) both: launch with (b) and ask in parallel | (c). The CC0 and AGPL GitHub copies do not clear NIN's copyright, so none of them is used |
| D4 | **Today's live `grocery_catalog`** (158 Open Food Facts rows, 138 pictures, the `grocery-catalog` bucket, `consumables.catalog_id`). All are inert; no screen reads them | (a) Migrate the rows into `source_records` + `retail_products` · (b) drop them with the rollback SQL | (a) if the OFF terms are confirmed (D5), else (b) |
| D5 | **Open Food Facts terms**: ODbL for the data, CC BY-SA for pictures. Confirm them on a machine where the terms page is not blocked, and approve the credit line | Confirm · don't use OFF | Confirm, with the credit on each product and a credits page |
| D6 | **IFID aliases** (ODC-By in the README, no licence file) | Use with attribution · ask the authors first · don't use | Ask the authors first. Until then, aliases are WonderHome's own |
| D7 | **Who reviews links.** Platform staff through a review queue | Owner · a named reviewer · both | A named reviewer, with a second person for the first 100 links |
| D8 | **Pilot size** | 500 items (as proposed) · smaller first | 500, in batches of 100 |

## Risks the owner should know about

- **M4's score is a development-set figure.** Its rules were tuned after seeing the test set's errors, so the pilot measures it again on new items before quoting it.
- **The hand labels are one reviewer's judgement.** A second person should check them.
- **"Approximate" values are visible to households,** for example toned milk shown with 2% milk's values. They are labelled, but they are not exact.
- **USDA values are US foods.** Varieties, fortification and moisture differ. This is a reference, not a health tool, and nothing is computed from it in the pilot.

## After approval

The work follows `GROCERY_CATALOG_SCHEMA_PROPOSAL.md`'s migration plan: four additive migrations, each applied live in the story that introduces it. Then the importer dry run, the review, and `PILOT_TEST_PLAN.md`. Nothing reaches a household screen until the plan's gates pass.
