# Wave 5, part 1: one evaluation framework for HomeTalk, HomeSend and HomeBrain (story 14-013)

**Spec:** `design/AI-EVALUATION-WAVE-5.md` §2–§12, §18, §21, §22.
**Code:** `packages/core/src/evaluation/`, `scripts/eval.mjs`, `npm run eval`.

## What was done

- **One case, one comparison, three surfaces.** A golden case (`evaluation/types.ts`)
  says what a household sent and what should come of it: the interpretation, the
  grounded date, the person, the matched record, whether there's a conflict, the
  proposal, and whether anything consequential ran. `compare.ts` compares each §2
  stage the case states. A stage the case doesn't state is not scored. Every
  mismatch maps to a §10 error type, such as `wrong_entity`, `wrong_date`,
  `missed_duplicate`, `unsafe_execution` or `privacy_leak`.
- **The real pipelines, not copies of them.** Each runner (`runners.ts`) drives
  the same functions production calls:
  - HomeTalk runs through `converse` + `groundIntent` + `canExecute`.
  - HomeSend runs through `buildUnderstanding`, `detectInstructionInjection`,
    `resolveIntakePeople`, `reconcileAgainstRecords` and `decideConfirmation`.
  - HomeBrain runs through `answerWithHomeBrain`.

  To make HomeSend runnable, `reconcileHomeSend` was split, so the decision over
  already-read records is its own exported function. The live path and the
  evaluation run the same code.
- **Five synthetic golden households** (`households.ts`, fixed clock
  2026-09-23 10:00 Asia/Kolkata), never production data:
  - A: the Mehta family.
  - B: Arjun alone, with two electricity bills.
  - C: the Iyers, with nicknames and a grandparent generation.
  - D: the Kapoors, with private health appointments, a child under
    guardianship and a helper.
  - E: the Singhs, a busy school household.

  The household viewers are built with the real `permissionsFor`, so the
  helper's view carries no health or financial items.
- **45 golden cases** (`cases.ts`): 20 HomeTalk, 13 HomeSend and 12 HomeBrain.
  Together they cover all twelve §4 categories and all five households.
  - HT-19 and HT-20 simulate a provider error and an unreadable model answer.
    They check that the household still gets the deterministic result (§16).
  - HS-13 is an older email against a record changed since, so it is a
    conflict. Before it, the conflict metric had nothing to measure.
- **§8 metrics** (`metrics.ts`) are shown as counts out of counts, for example
  "12/12 (100%)", or "not measured" when no case exercised them. There is no
  invented figure. The **§9 Unsafe Action Rate** counts any consequential case
  whose action executed.
- **Versions recorded per run** (`versions.ts`). Each is a content hash, so any
  change to what it covers produces a new version:
  - The prompt version hashes the understanding and intake system prompts plus
    the JSON schema of the model's output.
  - The context version hashes household A's context items.
  - The dataset version hashes the sorted cases.
- **Same cases for every provider** (`run.ts`, `cli.ts`).
  `npm run eval -- --provider configured` runs the golden set through whichever
  provider `WONDERHOME_AI_KEY` belongs to: understanding, intake classifier and
  answer composer. The comparison is the same one the deterministic run uses.
- **Release gates and artifact** (`report.ts`).
  - Blocking gates: functional, security, privacy, reliability and product.
  - The operations gate is non-blocking and reads "not yet" until the part 3
    telemetry exists. It never claims a dashboard nobody built.
  - `--write` produces the §22 artifact in `docs/ai-releases/`. It records
    provider, model, versions, pass rate, safety result, per-stage accuracy,
    errors, known limitations and a rollback plan.
  - The first artifact is `docs/ai-releases/2026-09-23-deterministic-p-fbca759c77b2.md`.
- **CI.** `npm run eval` runs in the lint job and in `npm run verify`. Its exit
  code follows the blocking gates, so a failing golden case or an unsafe
  execution fails the build like a failing test.
- **§18 adversarial checks** (`evaluation.test.ts`). The hostile stand-ins behave
  as follows:
  - A reckless model that proposes a payment for an adult, with autonomy set to
    execute, does not execute.
  - The same model, used for a child, is refused.
  - A classifier that calls everything a bill never auto-applies.

## Defects the golden set found and fixed

These defects were fixed in the product. No expectation was loosened to make a
case pass.

1. "Upasana won't be home for dinner", "Manan is off sick" and "Kunal isn't home
   tonight" were not read as absences. The absence rule in
   `conversation/rules.ts` now covers these phrasings.
2. A parent asking "what does my day look like" got only their own items.
   HomeBrain's question reading now carries the children the viewer is guardian
   of as *dependants*, so their school items and events count as the parent's
   own. Health stays per person (`homebrain/question.ts`, `grounding.ts`,
   `turn.ts`, and the conversation route passes `guardianOf`).
3. A question with a time window ("this week") could be answered from undated
   facts. `homebrain/answer.ts` now only composes from facts dated inside the
   window.
4. A dated fact inside the question's window could be dropped by the weak-link
   cap. The cap now exempts in-window dated facts.
5. A calendar question for the week did not reach school deadlines. Calendar
   plus a time window now connects school.

## Verified

- `npm run typecheck`, `npm run lint`, `lint:migrations`, `lint:embeds`,
  `lint:boundaries` and `lint:secrets` all pass.
- `npm run test`: 143 files, 2189 tests passed, including the existing HomeBrain,
  conversation and context suites, unchanged.
- `npm run security` shows 9/9 areas covered.
- `npm run eval`:
  - 45/45 cases pass, and the Unsafe Action Rate is 0/13.
  - Every stage is measured, with conflict at 1/1.
  - All blocking gates pass, and operations reads "not yet".
- `evaluation.test.ts`: 18 tests.

## Still open

- **Provider run.** No local `WONDERHOME_AI_KEY` exists in this container. The
  platform key sits in Vercel and was deliberately not decrypted, so the first
  Gemini artifact has not been written. To run it:
  `WONDERHOME_AI_KEY=… npm run eval -- --provider configured --write`.
- **Wave 5 part 2:**
  - corrections as structured evidence (§13);
  - an approval fingerprint that binds a yes to the exact proposal, with stale
    and changed approvals rejected (§20);
  - HomeTalk and HomeBrain rate metrics (§23).
- **Wave 5 part 3:**
  - rate, payload and timeout limits;
  - email-forwarding telemetry and alerts (§14);
  - failure codes (§16);
  - idempotency and retries (§17);
  - HomeSend security tests counted in `npm run security`.
