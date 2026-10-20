# HomeTalk queue: bill totals, corrections in the golden runner, the place book's words (H-1 to H-3)

**Date:** 2026-10-20 · **From:** `tracking/PRIORITY-ITEMS-REPORT.md` rows 6–8. Row 5 (25-004 Send to Cook) waits: it is built on WhatsApp, which the owner parked.

## What was built

- **H-1, "How much do I owe this month?"** `homebrain/insights.ts` rule `total`: the open bills due in the window (this month; "next month"; "this week" = the next 7 days) added up per currency, each bill listed with its amount and due day. A bill with no amount is said apart, never counted as nothing. The sum leads the deterministic answer (`answer.ts`) and is not dropped by the day filter. Golden HT-121 (household B: ₹4,960 across the two electricity bills; rent not in it).
- **Money is no longer rounded.** `context/format.ts`'s `money` showed ₹18,450.50 as ₹18,451. Whole amounts still show without decimals; anything else shows two (rule 22).
- **H-2, corrections in the golden runner.** `evaluation/runners.ts` carries the last action (waiting or done) and reads a correction against it with `applyCorrection`, exactly as `hometalk-turn.ts` does. Golden HT-122 ("actually, make that Friday" replaces a waiting absence) and HT-123 ("not bread, eggs" after an executed add).
- **H-3.** The place book's lede says places are saved from HomeTalk **or added here**, in all eight languages.
- **Test cases for review.** `docs/testing/HOMETALK-HOMEBRAIN-INTEGRATION-TEST-CASES.md`: 380 cases and 12 long conversations across every module, not yet run, waiting for the owner's review.

## Verified

`bill-total.test.ts` (5), the homebrain, context and evaluation suites, typecheck, and `npm run eval` (140/140 golden cases, every gate as before).

## Still open

H-4 (a paragraph of family facts split into one fact each) is next. Then running the integration test document once the owner has reviewed it.
