# HomeSend: the model decides, part 5 — measures (14-085), and the whole of 14-081..085

**Why.** The owner, 2026-11-22: "i want the HomeSend to have ai based intelligence and it should be able to decide what to do with incoming info by applying ai algorithms and take decisions. new kind, unseen incoming messages should be analysed by ai and learnt over time to take the right decision in automated way". Design: `docs/design/2026-11-22-homesend-ai-decides.md`.

**What was done.**
- `packages/core/src/evaluation/learning.ts`, run by `npm run eval` as the blocking `learning` gate:
  - 12 unseen-kind cases (HS-L01..12): society notice, wedding invitation, travel ticket, insurance renewal, warranty card, service visit, tuition fee (a bill: money rules), ration list, PTM circular, bank statement (money rules: a note only), prescription (health rules), a Hinglish forward. Each is scored on the capabilities the validated decision accepts, on no unsafe action, and on money and health never becoming a learned rule.
  - 3 replay cases (HS-R01..03), a household's society notices in order with what it did: confirmed three times then held by the rule when the model adds a To Buy nobody wants; decide, Undo, then decided right; one correction demotes the rule.
- Two defects the cases caught in 14-082, fixed in the product (`homesend/decision.ts`), never in the expectation: the note a new kind is kept as had no quote and was rejected for every text item, so memories never held it; and a new kind with nothing dated in it (a bank statement) lost its new kind and so was never counted or learned. A learned rule's operations now need evidence like the model's.
- Platform admin → Overview → "Nothing waits": decided by AI, learned rule applied, new kinds seen (last 30 days), from `public.platform_homesend_decisions` (migration `20261122150000`; service role only, aggregate only; a new kind seen in fewer than 2 households is shown as "other").

**Numbers (deterministic, recorded readings).**

| Measure | Model alone | With learned rules |
|---|---|---|
| Replayed items decided as the household wanted | 10/15 (67%) | 13/15 (87%) |
| Items a learned rule decided | — | 4 |
| Auto-handled (no question, every operation accepted), unseen + replay | — | 27/27 |
| Questions per item | 0.00 | 0.00 |
| Replayed items corrected or undone | 2/15 (13%) | — |
| Unsafe actions | 0 | 0 |

The two items still wrong with learned rules are HS-R03's: after its correction the rule is paused, so the model decides alone, as designed.

**Verified.** Vitest evaluation, homesend, hometalk, platform-admin: all pass (5 new). `npm run eval`: every gate passes, `learning` included; Unsafe Action Rate 0/82. Core and web typecheck; web eslint; `lint:migrations`; tracker check.

**Not verified live.** `WONDERHOME_AI_KEY` was absent in this session (added to the environment after it started), so no provider reading was scored. A provider run (`npm run eval -- --provider configured`) reads the unseen-kind sources with the provider; a fresh session with the key should run it once. Migrations `20261122090000`, `20261122120000` and `20261122150000` are to be run by the owner; until then memory, learned rules and the three measures are inert ("not measured").

**Open.** Live provider run of the unseen-kind set. No test data created.
