import json, sys, csv, collections
sys.path.insert(0, sys.argv[1]); from labels import L
import match as M
R = sys.argv[2]
rows = json.load(open(f"{R}/usda/match_candidates.json"))
nonfood = [r for r in rows if r["category"] in M.NONFOOD]
food = [r for r in rows if r["category"] not in M.NONFOOD]
def grade(pick, truth):
    if truth is None: return "correct_none" if pick is None else "false_link"
    if pick is None: return "missed"
    return "correct" if pick["fdcId"] in truth[0] else "wrong"
out = {}
for name, get in [("M1 naive", lambda r: r["m1"]), ("M2 BM25", lambda r: r["m2"]), ("M3 structured", lambda r: (r["m3"] or [None])[0])]:
    c = collections.Counter(grade(get(r), L[r["item"]]) for r in food)
    nf = sum(1 for r in nonfood if (M.m1(r["item"]) if name.startswith("M1") else M.m2(r["item"]) if name.startswith("M2") else []))
    out[name] = (c, nf)
    ok = c["correct"] + c["correct_none"]
    print(f"{name}: {ok}/{len(food)} foods right ({100*ok/len(food):.1f}%) — correct link {c['correct']}/139, correct 'none' {c['correct_none']}/31, wrong {c['wrong']}, false link {c['false_link']}, missed {c['missed']} | non-food given food nutrition: {nf}/{len(nonfood)}")
top3 = sum(1 for r in food if L[r["item"]] and any(u["fdcId"] in L[r["item"]][0] for u in r["m3"][:3]))
print(f"M3 top-3 contains a correct record: {top3}/139 ({100*top3/139:.1f}%)")
by = collections.defaultdict(collections.Counter)
for r in food:
    t = L[r["item"]]; g = grade((r["m3"] or [None])[0], t)
    by[t[1] if t else "none"][g] += 1
for k, v in by.items(): print(" M3 by truth type", k, dict(v))
print("M3 errors:")
for r in food:
    g = grade((r["m3"] or [None])[0], L[r["item"]])
    if g in ("wrong", "false_link", "missed"):
        p = (r["m3"] or [None])[0]
        print(f"  {g}: {r['item']} -> {p['description'][:60] if p else '—'}")

c = collections.Counter(); top3 = 0; errs = []
for r in food:
    picks = M.m4(r["item"], r["category"]); t = L[r["item"]]
    g = grade((picks or [None])[0], t); c[g] += 1
    if t and any(u["fdcId"] in t[0] for u in picks[:3]): top3 += 1
    if g in ("wrong", "false_link", "missed"): errs.append((g, r["item"], (picks or [None])[0]))
ok = c["correct"] + c["correct_none"]
print(f"M4 structured+rules: {ok}/{len(food)} foods right ({100*ok/len(food):.1f}%) — correct link {c['correct']}/139, correct 'none' {c['correct_none']}/31, wrong {c['wrong']}, false link {c['false_link']}, missed {c['missed']}; top-3 {top3}/139")
for g, item, p in errs: print(f"  {g}: {item} -> {p['description'][:60] if p else '—'}")
