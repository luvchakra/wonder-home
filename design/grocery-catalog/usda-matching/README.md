# USDA matching study: scripts and results

Research tooling for `../USDA_NUTRITION_MATCHING_STUDY.md`. It runs offline and writes nothing to any database.

| File | What it is |
|---|---|
| `test-items-200.csv` | 200 everyday Indian household items (170 food, 30 non-food) |
| `aliases.py` | WonderHome's curated English generic and buying state per item, written before looking at USDA |
| `labels.py` | Hand-labelled ground truth: acceptable `fdcId`s and match type, or none. A reviewer's judgement |
| `index_usda.py` | Builds `usda_index.json` (8,156 foods, 8 nutrients per 100 g) from the two USDA releases |
| `match.py` | Methods M1 (naive), M2 (BM25), M3 (structured) and M4 (structured + general rules) |
| `score.py` | Scores every method against `labels.py` |
| `export.py` | Writes `usda-matching-results.csv`: route, label, M4 top-1/top-3 and the labelled record's nutrients per item |
| `usda-matching-results.csv` | The per-item results the study reports |

## Run

**Layout:** create a data directory with two subfolders:
- `usda/`: holds the unzipped `FoodData_Central_foundation_food_json_2026-04-30.json` and `FoodData_Central_sr_legacy_food_json_2018-04.json`, from <https://fdc.nal.usda.gov/download-datasets>;
- `findings/`: holds `test-items-200.csv`.

Then, from this folder, with `DATA` set to that directory:

```bash
python3 -I index_usda.py "$DATA/usda"
python3 -I match.py . "$DATA" > /dev/null   # writes $DATA/usda/match_candidates.json
python3 -I score.py . "$DATA"
python3 -I export.py . "$DATA"              # writes $DATA/usda/usda-matching-results.csv
```

Running all four reproduces the study's figures.
