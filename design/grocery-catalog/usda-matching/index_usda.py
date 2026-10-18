import json, collections, sys
R = sys.argv[1]
NUM = {"208": "energy_kcal", "957": "atw_g", "958": "atw_s", "203": "protein_g", "205": "carbohydrate_g", "269": "sugars_g", "204": "fat_g", "606": "saturated_fat_g", "291": "fibre_g", "307": "sodium_mg"}
out = []
for f, key in [("FoodData_Central_foundation_food_json_2026-04-30.json", "FoundationFoods"), ("FoodData_Central_sr_legacy_food_json_2018-04.json", "SRLegacyFoods")]:
    d = json.load(open(f"{R}/{f}"))[key]
    for x in d:
        if not isinstance(x, dict):
            continue
        n = {}
        for fn in (x.get("foodNutrients") or []):
            nut = fn.get("nutrient") or {}
            num = str(nut.get("number", ""))
            if num in NUM and fn.get("amount") is not None:
                n[NUM[num]] = fn["amount"]
        if "energy_kcal" not in n:
            for alt in ("atw_s", "atw_g"):
                if alt in n:
                    n["energy_kcal"] = n[alt]
                    break
        cat = x.get("foodCategory")
        out.append({"fdcId": x["fdcId"], "dataType": x.get("dataType"), "description": x["description"], "category": cat.get("description") if isinstance(cat, dict) else cat, "publicationDate": x.get("publicationDate"), "nutrients": {k: v for k, v in n.items() if not k.startswith("atw")}})
    print(f, len(d))
json.dump(out, open(f"{R}/usda_index.json", "w"))
print("total", len(out), collections.Counter(o["dataType"] for o in out))
print(sum(1 for o in out if "energy_kcal" in o["nutrients"]), "with energy")
