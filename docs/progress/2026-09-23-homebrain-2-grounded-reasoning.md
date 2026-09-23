# HomeBrain 2.0, part 1: grounded reasoning (story 14-010, Wave 2)

**Date:** 2026-09-23
**Story:** 14-010 (new, P0, module 14). This note covers part 1 of 2; part 2 is [current truth and HomeBrain Review](2026-09-23-homebrain-2-current-truth-review.md).
**Spec:** `design/HOMEBRAIN-2.0-WAVE-2.md` ("WonderHome Wave 2 — HomeBrain 2.0", Product Council approved). Committed with this work so later sessions have it. The Wave 1 spec never was.

## Why

Wave 1 (14-009) gave HomeBrain the right facts. What it did not do was check the answer. The model's own `grounded: true` flag was the only thing between a draft and the household, and three other gaps remained:
- "why?" questions had no answer path.
- Questions that span domains didn't reach across them. "Can we make tonight's dinner?" never pulled in the groceries.
- Approving an action said "Done — … it is on its way" before anything had run.

## What was done

A new module, `packages/core/src/homebrain/`:

| File | Role |
|---|---|
| `question.ts` | Reads a question before retrieval (§5): its domains, its **focus** (domains named by strong words only; "does" is not a question about responsibilities), the domains it **connects** to (meals → groceries, school → calendar and groceries, "need" + a day → school, calendar, groceries and meals, clash words → calendar), a **time window** in the household's zone, **people** resolved through the context engine ("the older one", "my son", "me"), **follow-ups** ("And Manan?", or a bare "Asmi" answering "which one?"), and an ambiguous person becomes **one focused clarification** instead of a guess. |
| `grounding.ts` | The **`GroundedFact` contract** (§6): opaque `F1…Fn` ids in relevance order, `statement`, `sourceIds` (row plus HomeSend intake, never sent), `confidence`, `privacyClass`. Ranking starts from Wave 1's relevance, then applies the reading: connected domains are pulled in, a named person narrows personal facts to them, facts outside a focused question's scope drop out, the time window lifts what falls in it, and matches on a common word alone are capped low. Clash questions get the clash itself, phrased Wave 1's privacy-safe way ("an appointment"). |
| `validate.ts` | **Post-generation validation** (§7), run against exactly the pseudonymised facts that were sent. It refuses unsupported names, including placeholders never given and sentence-initial invented names, unsupported dates, weekdays, amounts (a total of cited amounts is allowed) and events. It also refuses diagnoses, doses and treatments, connected-service claims, and any claim to have done something, plus cited ids that were never given. It is tuned against false alarms, so "sat", "sun", "match" as a verb and app screen names don't trip it. |
| `answer.ts` | `composeGrounded`: draft → validate → **one regeneration** with only the cited facts and the problems named → otherwise `rejected`. `composeFromFacts` is the deterministic answer from the same facts. `unknownAnswer` is the honest "not on record". `modeFor` gives the five **modes** (§11), where `done` needs a confirmed execution. |
| `why.ts` | **"Why?" as a first-class capability** (§10), answered with no model: why approval (the reason recorded with the proposal's preview), why a question (the question and the words that prompted it), why not done (failure reason, rejection, still waiting), where a fact came from and why it is for a person (records the last reply named, plus `explainProvenance`), what I just sent (the member's own latest HomeSend intake), what changed after I sent it (the records carrying that intake as evidence), and what changed since yesterday. |
| `turn.ts` | `answerWithHomeBrain`, the whole §5 pipeline in one pure function around a `compose` call: read → ground → consent gate (the existing `minimiseContext`, `F`-ids as candidate ids) → compose → validate → restore names → fallbacks. |

Integration:
- **Prompt contract (§14)**, `ai/model-client.ts`. Facts are sent as `[F3] …`. The system prompt now states every §14 clause: facts are the whole world, missing means unknown, never invent, never claim an action, no sensitive inference, no diagnosis or dose, no unrecorded integrations, prefer confirmed or recent facts when they disagree, ask one targeted question when one detail decides it. Structured output adds `mode` (answer, clarify or unknown) and `usedFacts`. On a regeneration the prompt names what the last draft got wrong, in terms of what it said, never reasoning.
- **Rules**, `conversation/rules.ts`. A first rule reads "why?" questions as `ask_status` with `parameters.explain`, so they are recognized deterministically, before any model.
- **Engine**, `conversation/engine.ts`. A "why are you asking me this?" is never consumed as the answer to the pending clarification, and approving says "Got it — I have your go-ahead." rather than "Done".
- **Route**, `apps/web/.../conversation/route.ts`. The context read now starts for any possible question, not only when a provider is configured, because deterministic answers need it. `ask_status` either explains (topic set) or goes through `answerWithHomeBrain`, with the agenda summary kept for broad "what's going on?" questions. Unknown-intent questions are answered from facts without needing a provider. Each reply records `mode` and, where a model was involved, `brainValidation` (attempt count and violation codes, never content). A "why are you asking?" turn keeps the original question open for the next turn. An approval whose action can't be found now says nothing was changed, instead of "Done".
- **Repository.** `conversation/repository.ts`'s `latestAction` reads the session's last recorded action (preview reason, status, executor failure) for the "why" answers.
- `DOMAIN_WORDS` in `context/retrieval.ts` is now exported so the focus can be computed from the same list.

## Verified

- `homebrain/evaluations.test.ts`, 63 cases. Every §16 evaluation question:
  - What do we need today?
  - What does Asmi have tomorrow? / What does Manan have tomorrow?
  - Which bills are due this week?
  - What groceries are running low?
  - Can we make tonight's planned dinner?
  - What changed since yesterday?
  - Why are you asking for approval?
  - Where did this date come from?
  - What did I just send you?
  - What did WonderHome change after I sent it?
  - What responsibilities belong to me?
  - Which family events are protected?
  - What health appointments do I have? (authorized, and unauthorized with no health facts and an honest answer)

  It also covers the §4 cross-domain examples (What does Asmi need for Saturday?, a clash that never names the appointment), follow-ups, focused clarification, the fact contract, every validator rule plus its false-alarm guards, the regenerate-then-fallback chain, modes, and full turns with a stand-in model. Those turns show only consented classes leave, pseudonymised, and that names are restored.
- `conversation/rules.test.ts` (+11: every "why?" phrasing, each an `answer` proposal whatever the autonomy) and `conversation/engine.test.ts` (+2: approval never says done; "why are you asking?" is not the clarification's answer).
- Full `npm run verify` green: typecheck, lint, lint:migrations, lint:embeds, lint:boundaries, lint:secrets, tracker check, brand check, security, unit (1775), scripts (43), database (381), build, E2E (360).

## Not done / next

- **Part 2 (same story): current truth and HomeBrain Review (§8, §9, §12).** HomeTalk writes preferences to `memories`, which HomeBrain reads. HomeBrain Review reads and writes `certification_items`, which HomeBrain never reads. Nothing populates `certification_items.memory_id`. So a correction in either place is invisible to the other. The spec's own example also fails: "Asmi doesn't like mushrooms" matches no preference rule, and "Actually Asmi is okay with mushrooms now" would get a different key, so it could never supersede. Part 2 links the two stores, keys preferences by subject and object, makes Review show source, when learned, confidence and confirmation, and has Review decisions update what HomeBrain reads.
- No migration, so nothing to apply live.
- A live check against a real provider was not run from this sandbox. The model path is covered by the stand-in tests; the validator is the guarantee, whatever the model does.
- "What changed since yesterday?" can only see items that carry their own timestamp (HomeSend intakes, orders, proposals, notifications, memories). Most domain rows have no `updated_at` in the context engine yet, and the answer says so.
