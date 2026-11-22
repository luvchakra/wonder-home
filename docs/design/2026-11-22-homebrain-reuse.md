# Reusing HomeBrain's intelligence outside HomeSend

2026-11-22 · analysis only, no code changed · owner's ask: "see if HomeBrain intelligence code can be reused in other modules"

After #617 HomeBrain owns HomeSend's understanding, deciding and learning. A read-only sweep of `packages/core/src` and `apps/web` found that everything else still thinks for itself. **HomeTalk has its own path:** its own confidence bars, person matcher and memory. **Every module also has its own matchers and parsers**, and corrections outside HomeSend teach nothing. All three of the owner's hypotheses hold (evidence below).

## Findings

| Area | Today (file: function) | HomeBrain piece that could serve it | Size |
|---|---|---|---|
| HomeTalk deciding | `ai/model-client.ts` Understanding → `conversation/grounding.ts` (`CONFIDENT_AT` 0.9, ≥0.5) → `proposal.ts`/`executor.ts`; never calls `validateDecision` or `kind-bar` | `intake/decision.ts` `validateDecision` + `capabilities.ts` + `kind-bar.ts` | L |
| Confidence bars | `context/resolution.ts` (0.75/0.9/0.5/0.3), `grounding.ts` 0.9, `hometalk-turn.ts:489` 0.8, `voicelink/readiness.ts:90` 0.8 | `kind-bar.ts` (per kind, follows undo rate) | M |
| Who someone is | ≥6 matchers: `context/resolution.resolvePerson/resolvePet`, `conversation/likes.ts` and `relations.ts` `personNamed`, plus HomeBrain's own `memory-resolve.resolvePerson`, `sleep/consolidate.resolvePerson`, `verify-night-run.memberByName` | one HomeBrain person resolver built on `context/normalize` | M |
| Amounts and dates | `conversation/bill-talk.amountIn`, `plain-corrections.amountOf`, `quantity.readItemAmount`, `commerce/bare-amount`; `conversation/temporal`, `message-time`, `reminder-time`, `finance/email-connector.normaliseDate`, `ai/classify-intake` day phrases | `intake/when.ts` + amount words, as one parser | M |
| Record matching and duplicates | `conversation/bill-talk.matchBill` vs `intake/bill-match.matchOnRecord`; `finance/duplicates` (7-day rule); `commerce/receipts.matchConsumable`, `receipt-stock.duplicateReceipt`; `health/appointments.findLikelyDuplicate`; `calendar/duplicates`; `meals/shortfall.itemFor`; `recipe-catalog.matchCatalogRecipe` | `context/matching.ts` (already the fuzzy core) hosted in HomeBrain + `bill-match` | M |
| Learning from corrections | Only HomeSend paths call `learnFromCorrection`/`learnFromAnswer`/`rememberDecision` (one exception: grocery pick, `hometalk-turn.ts:867`). Silent: `conversation/corrections.ts`, `correct_entry` undo, `conversation/memory.ts` (own store), Tidy up, appointments, meals, school edits | `learning/` decision memory + `rules.ts` + `teach-from-entry.ts` | M |
| Separate memory | `conversation/memory.ts` `extractMemory`/`reconcileMemory` with its own statuses | `context-store.ts` + `learning/` | M |
| Model post-checks | `dish-idea-model.ts` → `meals/dish-ideas.checkDishIdeas`; `health/report-model.ts`; `school/trivia-generate` + `trivia-safety` | `validate.ts` (generic: draft + facts) | S each |
| Rule tweaks after reading | `ai/intake-kind-check.ts` (`reviewIntakeKind`), outside HomeBrain although it only feeds intake | move into `homebrain/intake` | S |
| Predictions | `ai/predictions.ts` (`predictStockOuts`, `predictBillBunching`), `ai/orchestrator.approvalMatches`, `notifications/learning.learnedMinuteFrom` | `insights.ts`; learning loop | S–M |

Checked and left alone (deterministic, not guessing): `finance/autopay`, `finance/recurring.repeatOf`, `finance/bill-filter`. WhatsApp intake already goes through HomeSend. No "usual/unusual amount" logic exists outside HomeBrain.

## HomeBrain parts that are still HomeSend-shaped (generalise first)

- **Capability registry** (`intake/capabilities.ts`): the shape is generic (id, owner, safety, writer, zod fields, ops), but each entry carries `legacyKind: HomeSendKind`. HomeTalk's `REPLY_CLASSES` actions would need their own entries plus a source tag (`talk` | `send`).
- **Decision memory** (`learning/decision-memory.ts`): keyed by `intakeId` and sender. It takes a `ValidatedDecision`. It needs a source-neutral key (`source`, `sourceId`) so that a HomeTalk turn or a screen edit can be remembered too.
- **Rules and bar** (`rules.ts`, `kind-bar.ts`): keyed by `HomeSendKind`. Sender, vendor and phrase keys generalise, but the kind type has to widen to a capability id.
- **`memory-resolve.ts`**: its input is `HomeSendKind`/`IntakePerson`. Its person and payee logic should split out from the gap-filling.
- **`validate.ts`** is already generic, so it is ready to reuse. The generic fuzzy matcher (`context/normalize`, `context/matching`) lives outside HomeBrain even though HomeBrain imports it.

## Ranked plan (value per effort)

1. **One person resolver** (M, low risk). Fold the six matchers into `homebrain/people.ts` on `context/normalize`. *For the family:* "Riya", "my daughter" and "Ri" mean the same person whether they type it, say it or forward it.
2. **Corrections teach everywhere** (M, low–medium risk). Generalise the decision-memory key first. Then call `teachFromEntry` from HomeTalk `correct_entry`/undo, bill edits, Tidy up keep/remove, appointment and meal changes. *For the family:* fix something once and WonderHome stops repeating the mistake on every screen, not only for forwarded messages.
3. **One amount and date parser** (M, medium risk: many callers and eval cases). *For the family:* "₹1,200 on the 12th" reads the same in a chat, a receipt and a forwarded email.
4. **One record matcher** (M, medium risk). Move `context/matching` into HomeBrain, and have `bill-talk.matchBill`, receipts, appointments and calendar duplicates call it. *For the family:* "the electricity bill" finds the same bill everywhere, and duplicates are caught the same way.
5. **Shared validated decision for HomeTalk** (L, highest value, highest risk). Extend the capability registry to HomeTalk actions and run HomeTalk proposals through `validateDecision`. Retire `grounding.ts`'s own 0.9 bar in favour of `kind-bar`. *For the family:* a sentence and a forwarded message are understood and checked the same way, and the confidence bar tunes itself from both.
6. **Merge `conversation/memory.ts` into HomeBrain learning** (M). *For the family:* one memory, so "we're vegetarian" said once shapes the grocery list, meal ideas and HomeSend.
7. **Model post-checks through `validate.ts`** (S each): dish ideas, health report reading, trivia. *For the family:* the same "no unvalidated model answer" guarantee on every screen.
8. **Move `intake-kind-check.ts` into `homebrain/intake`** (S). This is housekeeping that finishes #617's boundary.

**Build first: 1 then 2.** Both are low risk, and they make step 5 much smaller. Step 5 then reuses the person resolver and an already source-neutral memory.

## Guardrails that must hold through every step

- **Consent unchanged.** Recording happens at once with Undo, and actions still ask (`conversation/consent.ts`). A shared validator never turns an action into a recording.
- **Money and health.** A learned rule never carries money, approval or permission. It never fills who a health document is for, except for an Admin-listed filer (`health-filers.ts`). Paying and ordering stay off voice.
- **Never across households.** Every memory, rule and bar stays keyed by household. Generalising the key adds `source` and never drops `household_id`.
- **Untrusted content.** HomeTalk text, mail, OCR and model output all go through `injection.ts` before any shared matcher or learner sees them.
- **Evaluation.** Each step keeps Unsafe Action Rate at zero and adds eval cases for the merged path. A caught defect fixes the product, not the expectation.
- **Boundary.** HomeSend still only moves data (`intake-boundary.test.ts`). New callers import from `homebrain/*`, never the reverse.
