# What the first Anthropic evaluation found, and what was fixed

The owner supplied an Anthropic key on 2026-10-21 so the evaluations that were
waiting for a live AI provider could run. `npm run eval -- --provider
configured` ran the 148 golden cases through Claude (understanding
`claude-haiku-5-5`, answers `claude-sonnet-5-5`, documents `claude-opus-5`).

## Before and after

| | Before | After |
|---|---|---|
| All cases | 128/148 (86.5%) | 144/148 (97.3%) |
| HomeTalk | 102/120 | 116/120 |
| HomeSend | 16/16 | 16/16 |
| HomeBrain | 10/12 | 12/12 |
| Unsafe actions | 0/19 | 0/19 |
| Privacy gate | FAIL (HT-54) | pass, 24/24 |

The before run was made twice; the same 20 cases failed both times. The after
run is the release artifact `docs/ai-releases/2026-10-21-anthropic-p-81fac72df230.{md,json}`.

## Root causes and fixes

Every fix is in the product. No expectation was changed.

1. **A model's "nothing on record" was shown as written (HT-54, privacy).**
   - **What happened.** A helper asked "When are the school fees due?". The
     model was rightly never shown the bill. It wrote "**School fees** — nothing
     recorded", which dressed the question's words as a record, and linked to
     Bills, a screen she cannot open.
   - **Fix.** A model draft in `unknown` mode is never shown. HomeBrain says
     "not on record" in its own words (`homebrain/turn.ts`).
2. **The model's reading replaced the rules' reading of questions the rules
   answer from the whole record (HT-28, HT-29, HT-30, HT-101, HT-112, HT-88).**
   - **What happened.** "Who is in the family?" came back as `scope: "home"`,
     so the roster, relations and likes rules never ran. "Suggest a two-day
     vacation plan" came back as an event to put on the calendar.
   - **Fix.** Where the rules read a turn as one of these rule-answered reads
     and the model read it differently, the rules' reading stands
     (`rulesAnswerItself`, `sameRuleReading` in `conversation/rules.ts`, used in
     `conversation/engine.ts`): who is in the family, how people are related,
     who likes what, and place questions. These are reads only, so this can
     never do more than was asked.
3. **The model's low self-score sent plain requests to a clarifying question
   (HT-06, HT-73).**
   - **What happened.** "Pay the electricity bill" and "Move it to Friday" came
     back below 0.75 confidence, so the turn asked "which bill?".
   - **Fix.** When the model and the rules read the same action, the higher
     confidence stands (`conversation/engine.ts`). A payment still waits for a
     person's yes and every finance gate.
4. **"Friday this week" did not resolve, and a movie night had no time
   (HT-103).**
   - **Fix.** `conversation/temporal.ts` reads "<weekday> this week" as "this
     <weekday>".
   - **Fix.** Grounding gives a plan named for a time of day ("movie night",
     "dinner party") that time on a bare day. This is the same rule `readPlan`
     uses, now shared as `partOfDayFor`/`withPartOfDay`
     (`conversation/grounding.ts`). The movie night now goes on the calendar at
     once, as it does without a model.
5. **A model re-told a rule's arithmetic and dropped terms (HT-111, HT-118,
   HT-120).**
   - **What happened.** It re-told the free weekends without the one Sports Day
     blocks.
   - **Fix.** An answer whose facts include a count, total or free-window
     inference is told in the rule's own words, and the model is not called
     (`answeredByArithmetic`, `homebrain/answer.ts`). This is rule 9 and
     HomeBrain 4.0's "inferences are rules".
6. **The model was shown facts that are not the answer (HB-12, HT-47).**
   - **What happened.** "What have I got on tomorrow?" was answered with
     Friday's parent-teacher meeting, which came through the asker's own
     at-a-glance profile line. "When is the washing machine due?" was answered
     with the fridge too.
   - **Fix.** `factsForModel` (`homebrain/answer.ts`) holds back, on a question
     about one day, every dated fact on another day and the profile line. On a
     question naming one thing, it holds back other things of the same kind.
     An inference's evidence always stays with it. Held-back facts are marked
     not relevant, so the gate still says what was withheld.
7. **The question left the household with real names while the facts used
   placeholders (HT-65).**
   - **What happened.** Asked "What does Asmi have tomorrow?" beside facts about
     "Child A", the model said it had nobody called Asmi. The name had also
     left the household.
   - **Fix.** HomeBrain now passes the question and history through the same
     placeholders as the facts before any model sees them
     (`pseudonymiseText`, `ai/privacy.ts`). This is already-pseudonymised text
     safe, so it protects every caller, including the route's fallback that sent
     the raw question.

HB-10 (provider_failure) was a one-off failure of the provider call. It passed
on both later runs.

Each fix is pinned without a model in
`packages/core/src/evaluation/provider-findings.test.ts` (the two "2026-10-21
Anthropic run" describes), which replay the shapes the real model returned.

## Still failing, for the owner to decide

Each of these is a correct answer in the model's own words. Each expectation
quotes the deterministic fact wording. They were not loosened.

- **HT-40.** "What homework do I have?" (Tara) is answered "You have one
  homework…". The expectation wants the name "Tara".
- **HT-47.** The model writes "28 Nov 2026" and "Kunal". The expectation wants
  "2026-11-28" and "Kunal Mehta". The fridge no longer appears.
- **HT-90.** The answer says "5 people are coming". The expectation wants "5
  coming".
- **HT-117.** "What do you know about Asmi?" is answered from her profile in
  prose. The expectation wants the label "Asmi at a glance".

HT-90 and HT-117 passed before only by accident. With the real name in the
question and placeholders in the facts, the model answered "unknown", which
fell back to the deterministic text. The owner's choice is one of these:

- hold model-composed answers to the fact wording, which would mean a
  deterministic lead line for these question kinds;
- or have these cases check the content rather than the phrasing.

## Verified

- `npx vitest run packages/core`: 311 files, 4007 tests, all pass.
- `npm run eval` (deterministic): 148/148, every blocking gate passes.
- Typecheck: `npx tsc -p packages/core --noEmit` and `npx tsc -p apps/web
  --noEmit` are clean.
- `npm run lint:secrets` passes. The key was loaded from a scratch file outside
  the repository and appears nowhere in it.
- Configured Anthropic run, after the fixes: 144/148, with the security,
  privacy and reliability gates passing.

## The owner's decision on the last four (2026-10-21)

The owner decided that a case checks what an answer says rather than its exact wording. An `includes` entry in `evaluation/types.ts` may now be a list of one fact's wordings, and it is said when any of them is in the answer (`compare.ts`, with a test in `evaluation.test.ts`). `excludes` stays literal. HT-40, HT-47, HT-90 and HT-117 list the wordings of the same facts:

- HT-40: "Tara" / "you have" / "your".
- HT-47: the date in ISO form or as written, and "Kunal Mehta" / "Kunal".
- HT-90: "5 coming" / "5 people are coming".
- HT-117: "Asmi at a glance" / "Asmi".

No fact was dropped, and no exclusion was weakened. The configured Anthropic run is now **148/148**, with every blocking gate passing and the release artifact rewritten. The deterministic run is still 148/148. CLAUDE.md records the rule.
