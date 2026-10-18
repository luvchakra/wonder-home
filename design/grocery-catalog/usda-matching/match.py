import json, math, re, sys, csv, collections
sys.path.insert(0, sys.argv[1]); from aliases import ALIAS
R = sys.argv[2]
U = json.load(open(f"{R}/usda/usda_index.json"))
ITEMS = [row for row in csv.DictReader(open(f"{R}/findings/test-items-200.csv"))]
NONFOOD = {"Cleaning", "Personal care"}

def toks(s): return re.findall(r"[a-z0-9%]+", s.lower().replace("-", " "))
STOP = {"and", "or", "with", "of", "the", "a", "in", "type", "types", "all", "includes", "usda", "commodity"}
# BM25 over full descriptions
docs = [[t for t in toks(u["description"]) if t not in STOP] for u in U]
df = collections.Counter(t for d in docs for t in set(d)); N = len(docs); avg = sum(map(len, docs)) / N
def bm25(q, d, k1=1.2, b=0.75):
    tf = collections.Counter(d); s = 0.0
    for t in q:
        if t in tf:
            idf = math.log(1 + (N - df[t] + 0.5) / (df[t] + 0.5))
            s += idf * tf[t] * (k1 + 1) / (tf[t] + k1 * (1 - b + b * len(d) / avg))
    return s

def plural(t): return [t, t + "s", t + "es", t[:-1] if t.endswith("s") else t]
def m1(name):
    """Naive: the item's own name words all appear in the description; shortest description wins."""
    words = [w for w in toks(re.sub(r"\(.*?\)", "", name)) if w not in STOP]
    hits = [u for u in U if all(any(v in toks(u["description"]) for v in plural(w)) for w in words)]
    return sorted(hits, key=lambda u: len(u["description"]))[:1]

def m2(name):
    """Generic text search: BM25 of the item's own name over every description."""
    q = [t for t in toks(re.sub(r"\(.*?\)", " ", name)) if t not in STOP]
    q = [v for t in q for v in plural(t)]
    scored = sorted(((bm25(q, d), i) for i, d in enumerate(docs)), reverse=True)
    return [U[i] for s, i in scored[:1] if s > 0]

BAD = {"cooked", "boiled", "canned", "frozen", "babyfood", "fried", "roasted", "drained", "microwaved", "stewed", "braised", "baked", "heated", "prepared", "restaurant", "fast", "school", "lunch", "infant", "formula", "toddler", "kraft", "kellogg", "oscar", "mayer", "pillsbury", "campbell", "nabisco", "keebler", "mcdonald", "burger", "kfc", "dehydrated", "sweetened", "imitation", "reduced", "low", "fat free", "sodium", "unsalted"}
def m3(name, k=3):
    """Structured: curated English generic + state, the USDA 'Head, qualifier, state' grammar, state and source preferences."""
    entry = ALIAS.get(name)
    if entry is None: return []
    phrase, state = entry
    q = [t for t in toks(phrase) if t not in STOP]
    head = q[0]
    out = []
    for i, u in enumerate(U):
        d = docs[i]
        first = toks(u["description"].split(",")[0])
        if not any(v in first for v in plural(head)):
            continue
        s = bm25(q + ([state] if state else []), d)
        words = set(d)
        s -= 2.0 * len(words & BAD - set(q))
        if state and state in words: s += 1.5
        if u["dataType"] == "Foundation": s += 0.8
        s -= 0.05 * len(d)
        out.append((s, i))
    out.sort(reverse=True)
    return [U[i] for s, i in out[:k]]


# M4 = M3 plus three general rules (no item-specific fixes):
#  1. state words a household's purchase is not in are penalised unless the item asks for them;
#  2. a branded record (USDA writes brands in capitals) is never a generic match;
#  3. packaged / processed categories take nutrition from the product's own label (Open Food Facts),
#     never from a generic USDA food.
STATE_WORDS = {"toasted", "leaves", "leafy", "oil", "spread", "juice", "dried", "dehydrated", "powder", "pickled", "sprouted", "flour", "mix", "babyfood"}
PACKAGED = {"Snacks", "Beverages", "Bakery"}
PACKAGED_GENERIC_OK = {"Peanuts", "Cashew nuts", "Coconut water", "Popcorn", "Pasta / macaroni", "Coffee powder"}  # single-ingredient staples sold in packs
def m4(name, category, k=3):
    if category in PACKAGED and name not in PACKAGED_GENERIC_OK:
        return []
    entry = ALIAS.get(name)
    if entry is None: return []
    phrase, state = entry
    q = [t for t in toks(phrase) if t not in STOP]
    qs = set(q) | ({state} if state else set())
    out = []
    for i, u in enumerate(U):
        first = toks(u["description"].split(",")[0])
        if not any(v in first for v in plural(q[0])): continue
        if re.search(r"\b[A-Z][A-Z'&]{2,}\b", u["description"]): continue
        d = docs[i]; words = set(d)
        s = bm25(q + ([state] if state else []), d)
        s -= 2.0 * len(words & BAD - qs)
        s -= 2.5 * len(words & STATE_WORDS - qs)
        if state and state in words: s += 1.5
        if u["dataType"] == "Foundation": s += 0.8
        s -= 0.05 * len(d)
        out.append((s, i))
    out.sort(reverse=True)
    return [U[i] for s, i in out[:k]]


if __name__ == "__main__":
    rows = []
    for it in ITEMS:
        name, cat = it["item"], it["category"]
        if cat in NONFOOD:
            rows.append({"item": name, "category": cat, "m1": None, "m2": None, "m3": []}); continue
        rows.append({"item": name, "category": cat, "m1": (m1(name) or [None])[0], "m2": (m2(name) or [None])[0], "m3": m3(name)})
    json.dump(rows, open(f"{R}/usda/match_candidates.json", "w"))
    for r in rows:
        if r["category"] in NONFOOD: continue
        f = lambda u: f"{u['fdcId']}:{u['description'][:70]}" if u else "—"
        print(f"{r['item']} | M1 {f(r['m1'])} | M2 {f(r['m2'])} | M3 " + " || ".join(f(u) for u in r["m3"][:2]))

