import json, sys, csv
sys.path.insert(0, sys.argv[1]); from labels import L; from aliases import ALIAS
import match as M
R = sys.argv[2]
U = {u["fdcId"]: u for u in M.U}
rows = json.load(open(f"{R}/usda/match_candidates.json"))
w = csv.writer(open(f"{R}/usda/usda-matching-results.csv", "w", newline=""))
w.writerow(["item", "category", "route", "label_match_type", "label_fdc_ids", "label_description", "m4_top1_fdc_id", "m4_top1_description", "m4_top1_correct", "m4_top3", "energy_kcal_per_100g", "protein_g", "carbohydrate_g", "fat_g", "fibre_g"])
for r in rows:
    name, cat = r["item"], r["category"]
    if cat in M.NONFOOD:
        w.writerow([name, cat, "non-food: no nutrition", "", "", "", "", "", "", "", "", "", "", "", ""]); continue
    t = L[name]; picks = M.m4(name, cat)
    route = "USDA generic" if picks or (t and cat not in M.PACKAGED) else ("product label (Open Food Facts)" if cat in M.PACKAGED and name not in M.PACKAGED_GENERIC_OK else "no USDA equivalent")
    lab = sorted(t[0]) if t else []
    first = U.get(lab[0]) if lab else None
    p = picks[0] if picks else None
    n = (first or {}).get("nutrients", {})
    w.writerow([name, cat, route, t[1] if t else "none", " ".join(map(str, lab)), first["description"] if first else "", p["fdcId"] if p else "", p["description"] if p else "",
                ("yes" if (p and t and p["fdcId"] in t[0]) or (not p and not t) else "no"), " | ".join(f"{u['fdcId']}:{u['description']}" for u in picks[:3]),
                n.get("energy_kcal", ""), n.get("protein_g", ""), n.get("carbohydrate_g", ""), n.get("fat_g", ""), n.get("fibre_g", "")])
print("written")
