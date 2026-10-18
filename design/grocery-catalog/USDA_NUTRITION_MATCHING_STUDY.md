# USDA nutrition matching study

**Status:** research for the owner's decision (18 Oct 2026). Offline only: nothing was written to any WonderHome database. The owner asked: "use USDA data for nutrient profiling, figure out the best way to match the food items in the grocery catalog and USDA data."

## TL;DR

1. **Use USDA's two generic-food datasets, not Branded.** These are Foundation Foods (2026-04-30, 363 foods) and SR Legacy (2018-04, 7,793 foods). Both are public domain, have stable `fdcId`s and state nutrients per 100 g. Branded Foods are US products, the wrong source for Indian packs.
2. **Match with a structured method, then have a person approve it.** No method tested here can link nutrition to a household's food unreviewed.
   - **The method:** each catalog item carries an English generic name and its buying state, curated by WonderHome. That name is searched with USDA's own "Head, qualifier, state" grammar. The search prefers raw or dry records and Foundation over SR Legacy. It penalizes cooked, canned, toasted, leaves, oil and juice records unless the item asks for them, and excludes branded records.
   - **Results:** 85.9% top-1 correct against hand-labelled truth. The right record is in the top three for 92.1% of the items that have one.
   - **Errors:** 8 wrong links and 1 false link out of 170 foods. The review step exists for exactly these.
3. **Route by what the item is, before matching:**
   - fresh produce, pulses, grains, flours, spices, oils, dairy and meat → USDA generic;
   - packaged and processed foods → the product's own label (Open Food Facts), never a generic US food;
   - cleaning and personal care → **no nutrition at all**;
   - Indian foods with no honest USDA equivalent (paneer, jaggery, poha, ragi, makhana, curry leaves, khoa) → no nutrition, until a licensed Indian source exists.
4. **Generic text search is dangerous.** Plain BM25 over USDA descriptions got 32.4% right. It gave **food nutrition to 10 of 30 cleaning and personal-care items**, and linked 19 foods that have no USDA equivalent.

## Data

| Dataset | File | sha256 (zip) | Foods |
|---|---|---|---|
| Foundation Foods | `FoodData_Central_foundation_food_json_2026-04-30.zip` | `186e988e…c77a` | 363 |
| SR Legacy | `FoodData_Central_sr_legacy_food_json_2018-04.zip` | `0fe8ae48…38ef` | 7,793 |

**Nutrients kept per 100 g,** by USDA nutrient number:
- energy (208; for Foundation records that only give Atwater energy, 958 or 957);
- protein (203), carbohydrate (205), sugars (269), fat (204), saturated fat (606), fibre (291), sodium (307).

8,114 of the 8,156 records state energy. Licence: public domain (USDA ARS), with citation requested.

**Test set:** 200 everyday Indian household items weighted to a weekly basket (`findings/test-items-200.csv`): 170 foods and 30 cleaning or personal-care products.

**Ground truth:** labelled by hand on 18 Oct 2026 against USDA descriptions. This is a reviewer's judgement, not a source fact, and should be reviewed once more by a second person before it is trusted. For each food it records the acceptable `fdcId`s (Foundation and SR Legacy duplicates both count) and a match type:

| Match type | Count | Meaning |
|---|---|---|
| exact | 90 | The same food in the same state, e.g. Onions, raw |
| close | 34 | Same food, minor difference: toor *dal* (split) vs pigeon peas (whole), *curd* vs plain whole-milk yogurt |
| approximate | 15 | A stand-in that must be labelled as approximate: toned milk (3% fat) vs 2% milk; rohu vs carp; surmai vs king mackerel |
| none | 31 | USDA has no honest equivalent |

## Methods compared

| Method | What it does |
|---|---|
| **M1 naive** | The item's name words all appear in a USDA description; the shortest such description wins |
| **M2 BM25** | Generic relevance ranking of the item's name over every USDA description |
| **M3 structured** | A curated English generic name and buying state per item (`aliases.py`, written *before* looking at USDA's descriptions). The head noun must match the first comma segment of the USDA description. BM25 on the qualifiers, plus the state; penalties for cooked, canned, babyfood and brand words; a Foundation preference; a length penalty |
| **M4 structured + rules** | M3 plus three general rules, with no item-specific fixes: (1) penalize state words the item doesn't ask for (toasted, leaves, oil, juice, powder, dried…); (2) never match a branded record (USDA writes brands in capitals); (3) packaged and processed categories go to the product label, except single-ingredient staples (peanuts, cashews, pasta, coffee, coconut water, popcorn) |

## Results (170 foods; 30 non-food)

| Method | Right | Correct link (of 139) | Correct "none" (of 31) | Wrong link | False link | Non-food given food nutrition |
|---|---|---|---|---|---|---|
| M1 naive | 78 (45.9%) | 55 | 23 | 36 | 8 | 0 of 30 |
| M2 BM25 | 55 (32.4%) | 43 | 12 | 73 | 19 | **10 of 30** |
| M3 structured | 144 (84.7%) | 122 | 22 | 14 | 9 | 0 of 30 |
| **M4 structured + rules** | **146 (85.9%)** | 116 | 30 | **8** | **1** | 0 of 30 |

- M3's top three hold a correct record for **128 of 139** foods (92.1%). M4's hold one for 118 of 139, because 13 packaged foods are deliberately routed to product labels instead.
- **By truth type, for M3:** exact 86/90 correct; close 27/34; approximate 9/15; none 22/31.
- **M4's "missed" rises to 15 by design.** Packaged foods (bread, chips, cola, chocolate, ketchup, malted drinks) are sent to their own label instead of a US generic. That counts as a miss against the USDA labels, and it is the right outcome.

**Caution:** M4's three rules were chosen after seeing M3's errors on this set, so its score is a development-set figure. The pilot must check M4 on a **held-out** set of new items before quoting it as an accuracy.

## What the errors teach

M4's remaining errors are listed in `usda-matching/usda-matching-results.csv`.

- **Name traps no generic matcher catches.** Each needs a curated "no":
  - **makhana** is fox nut (*Euryale ferox*), not USDA's "lotus seeds" (*Nelumbo*);
  - **mosambi** (*Citrus limetta*) is not "Limes, raw";
  - **pomfret** is not Florida pompano;
  - **poha** in USDA is a *groundcherry* ("cape-gooseberries or poha"), not flattened rice;
  - **corn flour** in India means cornstarch, not US whole-grain corn flour;
  - **red chilli powder** is closer to "pepper, red or cayenne" than to US "chili powder", which is a spice blend.
- **USDA has some Indian staples under names a guess misses:**
  - "Butter, Clarified butter (ghee)"
  - "Papad"
  - "Mothbeans" (one word)
  - "Crackers, rusk toast"
  - "Chickpea flour (besan)"
  - "Balsam-pear (bitter gourd)"
  - "Gourd, white-flowered (calabash)" for lauki
  - "Gourd, dishcloth (towelgourd)" for turai
  - "Drumstick pods"
  - "Sapodilla"

  The curated table is where these live. In the pilot they come from the review step, not from tuning the matcher.
- **State matters more than name:**
  - "Sweet potato" still loses to "Sweet potato leaves" on length;
  - "Sardine" lost to "Fish oil, sardine";
  - dry tea leaves have no USDA record, only brewed tea, so per-100 g values would be wrong by orders of magnitude.

  The item's `food_state` must be a hard filter, not a hint.

## Recommended design (fits `GROCERY_CATALOG_SCHEMA_PROPOSAL.md`)

1. **Route first, by category:**
   - **non-food:** no link, enforced by trigger;
   - **packaged or processed:** product label;
   - **produce, staples, dairy, meat:** USDA generic.
2. **Every catalog item carries `canonical_name` (English generic), `food_state` and `variant`.** These are what the matcher reads. A household's own word ("bhindi") is an alias that resolves to the item; it never searches USDA directly.
3. **Candidate generation with M4.** It returns the top 3 with their descriptions, nutrients and basis, and stores them as `nutrition_links` with `review_status: candidate` and the matcher's version.
4. **A person approves** one candidate, picks a different one, or says "no USDA equivalent", and records the `match_type`.
   - With the right answer in the top three about 92% of the time, review is mostly one tap.
   - **Nothing is auto-approved in the pilot.**
5. **Values are copied from the pinned release** into `nutrition_values`, with provider `usda_fdc`, the `fdcId`, the release version (`SR Legacy 2018-04` / `Foundation 2026-04-30`) and basis `100g`. The household sees **"approximate"** wherever the link is approximate.
6. **Refresh:**
   - SR Legacy is frozen (2018).
   - Foundation is released about twice a year. A new release is re-imported as a new version. Its links are re-proposed, never silently changed, and a changed value is a review task.
7. **What USDA cannot cover**, about 18% of everyday Indian foods in this set (31 of 170): an Indian licensed source (ICMR-NIN IFCT 2017, *with NIN's written permission*), or a product label, or nothing. See the decision request.

## Reproduce

`usda-matching/` holds the scripts (`index_usda.py`, `aliases.py`, `labels.py`, `match.py`, `score.py`, `export.py`), the test list and the per-item results.
- Download the two zips from <https://fdc.nal.usda.gov/download-datasets> and unzip them next to the scripts.
- Then run `index_usda.py`, `match.py`, `score.py` and `export.py` as in that folder's README.

Every number in this document comes from those scripts.
