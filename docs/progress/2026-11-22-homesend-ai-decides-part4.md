# HomeSend: the model decides, part 4 — learned rules (14-084)

**Why.** The owner, 2026-11-22: "new kind, unseen incoming messages should be analysed by ai and learnt over time to take the right decision in automated way". Design: `docs/design/2026-11-22-homesend-ai-decides.md`.

**What was done.**
- Migration `supabase/migrations/20261122120000_homesend_decision_patterns.sql`: `homesend_learned_defaults` allows kind `decision_pattern` and source `confirmations`. Safe in either order (old code drops unknown kinds; new code ignores a refused write).
- `packages/core/src/homesend/decision-rules.ts`: a pattern is an outside sender (`pattern:sender:…`) or a new kind (`pattern:newkind:…`); its value is record capabilities only (note, event, reminder, to_buy, task, contact, place). Three confirmations of the same handling since the last correction or Undo, and none of a different handling, promote it; one correction or Undo demotes it (`mixed`); three fresh confirmations promote it again. Nearest known kinds keep their own rules (`sender_area`, kind bars): a decision touching money, health, an action or a known-kind record never becomes a pattern.
- `decision-memory.ts` `recordDecisionOutcome` promotes and demotes after each outcome, written as the member who confirmed, undid or corrected (RLS unchanged). `rules-repository.ts` `learnFromCorrection` marks the item's memory "corrected" with the field (a person or amount is never stored, only "someone else" / "a different amount").
- `ingest.ts` `understand`: rules are read with the examples before the model; a sender's rule is handed to the model; a new-kind decision is held to the sender's or new kind's rule (`applyLearnedRule`: drops operations the rule doesn't name, keeps the note, `source: "learned_rule"`), then validated as before.
- Settings → AI Assistant → "What HomeSend has learned": each rule ("From secretary@society.in → Household note + Calendar"), "Why?" listing the confirmed items from the memory rows (or the correction that paused it), and Forget (Admins). 14 words × 8 languages; help `home-send` body.22 × 8.

**Verified.** Vitest homesend, homebrain, hometalk: 1,174 pass (10 new in `decision-rules.test.ts`). Core and web typecheck clean. `lint:help-links`, `lint:migrations`, `tracker -- --check` pass.

**Not verified live.** No model key in this session, so a rule's effect on a real reading is unmeasured (14-085 adds replay cases). The migration is not applied by this session: until the owner runs it, promotion writes are refused and ignored, and nothing changes.

**Open.** 14-085: unseen-kind and replay eval cases, before/after numbers, Platform admin measures. No test data created.
