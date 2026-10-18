# Data sources — licence and quality audit

**Status:** Phase B of the owner's brief (18 Oct 2026). Every repository was cloned at a pinned commit into a research workspace and read; nothing was imported. Figures are what was observed then. Licence readings are a product team's, **not legal advice**. Anything marked "needs legal review" stays out of production.

## Licensing matrix

| Source (pinned) | Stated licence | Upstream rights concern | Can WonderHome use it commercially? |
|---|---|---|---|
| **USDA FoodData Central**: Foundation 2026-04-30, SR Legacy 2018-04 | Public domain (US Government work), citation requested | None | **Yes**: the nutrition source for generic foods |
| **Open Food Facts** (India subset, live API) | ODbL (database), DbCL (contents), CC BY-SA (pictures). Widely published, but the terms page was bot-blocked here and must be confirmed | Share-alike if WonderHome publishes a derived database | **Yes, with attribution, kept as its own source layer** (never blended into a proprietary master), and pending confirmation of the terms |
| **IFID**: isrl-research/ifid-encyclopedia @ `9381def` | ODC-By, stated in README and JSON; there is no licence file | None claimed; the prose entries cite no sources | **Probably, with attribution.** An explicit licence file, or written confirmation from the authors, is needed first |
| **indian-nutrition-data**: prabhubng @ `81b8a93` | CC0 (`LICENSE`) | README: 528 rows from **IFCT 2017** and 92 from **Gopalan 2004**, both ICMR-NIN publications | **Unclear, needs legal review.** CC0 on a copy does not clear NIN's rights |
| **IndianFoodComposition**: nithyamani @ `fa99af9` | No licence file ("for public use") | A direct copy of IFCT 2017, and the full IFCT PDF is committed in the repo | **No** without NIN's permission |
| **indian-foods-composition-table**: bhargavaman @ `b65621d` | AGPL-3.0 (MIT before Apr 2025) | Its own data files say "Copyright © 2017 by National Institute of Nutrition" | **No** without NIN's permission; AGPL also does not fit |
| **OpenMRP**: openmrp-in @ `b5ab0d1` | Code Apache-2.0, data ODbL, media CC BY-SA | Seeds from Open Food Facts | Allowed by its licence, but **there is no data**: `dump/` holds a README only, and the project says it is pre-launch |
| **ICMR-NIN IFCT 2017** (the original) | © National Institute of Nutrition | The book's copyright page (IFCT PDF p.3) forbids storing or reproducing the data "in any electronic format for creating a product without the prior written permission" | **Only with NIN's written permission** |

**What this means for the design:**
- Indian-specific nutrition (paneer, jaggery, ragi, poha and the like) has **no cleanly licensed source today**.
- USDA covers the rest of everyday food generically (see the matching study).
- The Indian gap is either a request to NIN or nutrition left blank. That is the first decision request.

## Quality notes (observed)

| Source | Records | Observations |
|---|---|---|
| USDA Foundation and SR Legacy | 363 + 7,793 | 8,114 of 8,156 records state energy (Foundation sometimes only as Atwater energy). Names follow a "Head, qualifier, state" grammar. Branded and restaurant records appear inside SR Legacy and are recognisable by capitals |
| Open Food Facts India | at least 10,000 (count not exact) | Crowd-sourced. Of 34 packaged-type test queries, all had relevant hits, but **only about half of the sampled top hits have calories**. Parle-G (8901719255151) had no energy or macros filled in. Names are English only in the sampled products |
| indian-nutrition-data | 620 foods, 8 nutrients per 100 g | 7 duplicate codes (the Gopalan rows reuse the "G" prefix); some Hindi names are wrong |
| IndianFoodComposition | 542 foods, about 150 nutrients | Energy in kJ; values held as text like "1340Â±7" with broken characters |
| indian-foods-composition-table | 542 foods | All 14 oils show 0 kJ energy, which is wrong |
| IFID | 623 entries, prose only, no nutrients | 263 (42%) are "Additives & Functional" by its own category field, so they are not household groceries |

## Coverage of the 200-item test basket (naive string checks, not verified mappings)

| Source | Food items matched | Notes |
|---|---|---|
| USDA (structured matcher, hand-checked) | 139 of 170 have an honest USDA equivalent; M4 picks the right one first for 116 | See `USDA_NUTRITION_MATCHING_STUDY.md` |
| indian-nutrition-data | 68% | Weak in snacks, beverages and bakery (14–30%) |
| IndianFoodComposition | 68% | Same IFCT base |
| IFID | 82% | Inflated by additive keyword hits |
| Open Food Facts | 34 of 34 packaged queries returned relevant products | Nutrition completeness about 50% |
| Any source, for the 30 cleaning and personal-care items | 0 | As it should be: non-food items carry no nutrition |

## Unresolved rights (need a person)

1. **ICMR-NIN permission** for IFCT 2017 values. This is the only route to Indian-specific nutrition.
2. **Confirmation of Open Food Facts' terms,** read on a non-blocked machine, and of how WonderHome credits ODbL and CC BY-SA.
3. **IFID:** an explicit licence file or written confirmation from the authors of ODC-By for commercial use.
