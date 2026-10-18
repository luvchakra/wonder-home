# Grocery catalog — sample records

**Status:** SAMPLE, not production data. These 26 rows show what the proposed tables (`GROCERY_CATALOG_SCHEMA_PROPOSAL.md`) would hold for a range of everyday items. Nothing here has been written to any database.

- **Item fields** (`canonical_name`, `category_id`, `item_kind`, `food_state`) are WonderHome's own curation, drafted for the study.
- **USDA links** are the hand-labelled truth from the matching study (`usda-matching/labels.py`). Each `fdcId` is a real FoodData Central record.
- **Values** are per 100 g, copied from that record in the pinned release (SR Legacy 2018-04 or Foundation 2026-04-30).
- **"M4 first pick"** shows what the matcher proposed before review. Where it differs from the link, the reviewer's choice is the one that would be stored.

## Foods linked to USDA

| Item | Category | State | Link (`fdcId` · USDA description) | Match | M4 first pick | kcal | Protein g | Carbs g | Fat g | Fibre g |
|---|---|---|---|---|---|---|---|---|---|---|
| Onion | vegetables | raw | 170000 · Onions, raw | exact | same | 40 | 1.1 | 9.34 | 0.1 | 1.7 |
| Tomato | vegetables | raw | 170457 · Tomatoes, red, ripe, raw, year round average | exact | same | 18 | 0.88 | 3.89 | 0.2 | 1.2 |
| Bitter gourd (karela) | vegetables | raw | 168393 · Balsam-pear (bitter gourd), pods, raw | exact | same | 17 | 1.0 | 3.7 | 0.17 | 2.8 |
| Bottle gourd (lauki) | vegetables | raw | 169232 · Gourd, white-flowered (calabash), raw | exact | same | 14 | 0.62 | 3.39 | 0.02 | 0.5 |
| Sweet potato | vegetables | raw | 168482 · Sweet potato, raw, unprepared | exact | **wrong:** 169303 Sweet potato leaves, raw | 86 | 1.57 | 20.1 | 0.05 | 3.0 |
| Banana | fruits | raw | 173944 · Bananas, raw | exact | same | 89 | 1.09 | 22.8 | 0.33 | 2.6 |
| Toor dal | pulses | dried, split | 172436 · Pigeon peas (red gram), mature seeds, raw | close (whole seed, not split) | same | 343 | 21.7 | 62.8 | 1.49 | 15.0 |
| Moong dal | pulses | dried, split | 174256 · Mung beans, mature seeds, raw | close | same | 347 | 23.9 | 62.6 | 1.15 | 16.3 |
| Wheat atta | flours | dry | 168944 · Wheat flour, whole-grain, soft wheat | close | same | 340 | 13.2 | 72.0 | 2.5 | 10.7 |
| Besan | flours | dry | 174288 · Chickpea flour (besan) | exact | same | 387 | 22.4 | 57.8 | 6.69 | 10.8 |
| Corn flour | flours | dry | 169698 · Cornstarch | exact (Indian usage) | same | 381 | 0.26 | 91.3 | 0.05 | 0.9 |
| Basmati rice | grains | raw | 169756 · Rice, white, long-grain, regular, raw, unenriched | close | same | 365 | 7.13 | 80.0 | 0.66 | 1.3 |
| Dalia | grains | dry | 170688 · Bulgur, dry | close | same | 342 | 12.3 | 75.9 | 1.33 | 12.5 |
| Turmeric powder | spices | ground | 172231 · Spices, turmeric, ground | exact | same | 312 | 9.68 | 67.1 | 3.25 | 22.7 |
| Red chilli powder | spices | ground | 170932 · Spices, pepper, red or cayenne | close | **wrong:** 171319 Spices, chili powder (a US blend) | 318 | 12.0 | 56.6 | 17.3 | 27.2 |
| Groundnut oil | oils | — | 171410 · Oil, peanut, salad or cooking | exact | same | 884 | 0 | 0 | 100 | 0 |
| Ghee | oils | — | 171314 · Butter, Clarified butter (ghee) | exact | **wrong:** 173412 Butter oil, anhydrous | 900 | 0 | 0 | 100 | 0 |
| Toned milk | dairy | fluid | 746778 · Milk, reduced fat, fluid, 2% milkfat, with added vitamin A and D | **approximate** (toned is 3% fat) | same | 50 | 3.3 | 4.8 | 1.98 | 0 |
| Curd / dahi | dairy | — | 2259793 · Yogurt, plain, whole milk | close | same | 61 | 3.47 | 4.66 | 3.25 | 0 |
| Eggs | eggs | raw | 171287 · Egg, whole, raw, fresh | exact | same | 143 | 12.6 | 0.72 | 9.51 | 0 |
| Chicken | meat_fish | raw | 171447 · Chicken, broilers or fryers, meat and skin, raw | exact | same | 215 | 18.6 | 0 | 15.1 | 0 |
| Rohu | meat_fish | raw | 171952 · Fish, carp, raw | **approximate** (a different carp) | none proposed | 127 | 17.8 | 0 | 5.6 | 0 |

A household would see "approximate" beside the toned milk and rohu values.

## Items with no USDA link, by design

| Item | Category | Route | Why |
|---|---|---|---|
| Paneer | dairy | none until a licensed Indian source | USDA has no paneer; queso blanco is a different cheese |
| Jaggery | staples | none until a licensed Indian source | No USDA record |
| Poha (flattened rice) | grains | none until a licensed Indian source | USDA's "poha" is a groundcherry |
| Makhana | snacks | product label | USDA's lotus seed is a different plant |
| White bread | bakery | product label | Packaged: the pack's own label beats a US generic |
| Dishwash liquid | home_cleaning | no nutrition | Non-food; the trigger refuses a link |
| Toothpaste | personal_care | no nutrition | Non-food; the trigger refuses a link |

## The same rows in table form (one example)

```text
catalog_items     id=<uuid>  canonical_name="Toor dal"  category_id=pulses  item_kind=ingredient
                  food_state=split  variant="split, unpolished"  default_unit=kg  step=0.5
catalog_aliases   "Toor dal"(en, Latn, curated, verified)  "arhar dal"(hi, Latn, curated, verified)
                  "अरहर दाल"(hi, Deva, curated, verified)  "tuvar dal"(gu, Latn, curated, candidate)
nutrition_links   provider=usda_fdc  provider_food_id=172436  food_state=whole  match_type=close
                  is_default=true  review_status=approved  notes="split vs whole seed"
nutrition_values  provider=usda_fdc  provider_food_id=172436  version="SR Legacy 2018-04"  basis=100g
                  nutrients={energy_kcal:343, protein_g:21.7, carbohydrate_g:62.8, fat_g:1.49, fibre_g:15.0}
source_records    source=usda_fdc  source_record_id=172436  source_version="SR Legacy 2018-04"
                  licence="Public domain (USDA ARS)"  rights_status=cleared
```

The aliases above are illustrative. In the pilot, a person verifies each one before it reaches search.
