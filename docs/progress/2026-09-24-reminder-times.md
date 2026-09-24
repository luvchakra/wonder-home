# HomeTalk reminders: "later today", the trip home, and never a time in the past

**Date:** 2026-09-24 · **Area:** HomeTalk (conversation engine) · **Code:** `packages/core/src/conversation/reminder-time.ts`, `temporal.ts`, `grounding.ts`, `rules.ts`, `executor.ts`

## What was wrong

A household reported this conversation on production at 8:34 pm in Kolkata:

1. "remind me to pick some coriander while my back way back from office"
   → "When should I remind you — later today, tomorrow, or another day?"
2. "later today" → "I still cannot pin that to one day…"
3. "today" → "I will remind you today (Thu 24 Sep) at 9am to pick some
   coriander while my back way back from office."

There were four defects:
- **The trip home was not understood.** "On my way back from office" means
  this evening, but no rule or temporal phrase recognised it. It was left
  inside *what* to be reminded of, and the reminder was asked for again.
- **Our own offered answer was refused.** The question offers "later today",
  but `temporal.ts` did not recognise it.
- **A day alone meant 9am, even today.** At 8:35 pm, 9am had already gone.
  The writer clamped the time to "now", so the reminder fired at once while
  the reply still said 9am. The reply named a time the reminder did not keep.
- **The when stayed in the reminder's words**, even when it had been read
  correctly.

## What changed

- **`temporal.ts` understands moments from now:**
  - "later", "later today" and "later on" mean about an hour from now, on the
    quarter hour.
  - "later this evening" and "later tonight" said before that part of the
    day mean that part of the day.
  - "in 2 hours", "in half an hour" and "in 45 minutes" are counted from now,
    crossing into tomorrow when they have to.
  - The trip home ("on my way back from office", "on the way home", "after
    work", "when I'm coming home") is this evening. Once the evening is
    over, it means shortly.
  - `splitTrailingWhen` takes such a clause off the end of *what*.
- **`reminder-time.ts` decides when a reminder goes off, once.** Grounding
  and the writer both use it, so the reply and the stored reminder always
  agree:
  - "today" with no time means later today, not 9am.
  - A part of today that is under way means shortly, within that part.
  - A day ahead means 9am.
  - A stated time is kept exactly.
  - A time already gone becomes one question: "9am today has already
    passed. Should I remind you later today, or tomorrow at 9am?" It is
    never written for now and described as something else.
- **Grounding** splits the clause off *what* (whether the model or a rule
  left it there) and stores `remindAtResolved`. It is server-only: its
  `…Resolved` suffix means `withoutServerOnly` strips it from anything a
  model sends. The proposal ("Remind you today (Thu 24 Sep) at 9:45pm to…")
  and the reminder's own note now name the real time.
- **The model prompt** lists "later today", "in 2 hours" and "on my way
  home" as whens, never to be left inside *what*.
- **The second ask** now offers answers that work: "later today", "in 2
  hours", "tomorrow at 9am", "next Friday" or a date.

## Verified

- New `reminder-time.test.ts` (13 tests) covers moments from now, the trip
  home, splitting the clause, today at 10 am and at 8:35 pm, a part of the
  day under way, a time already gone, and a stated time kept exactly.
- `evaluation.test.ts` replays the reported conversation through the whole
  deterministic turn:
  - the first sentence is not asked "when?";
  - "later today" and "today" both land at 9:45 pm;
  - "9am today" at 8:34 pm is one question, and "tomorrow" answers it.
- `engine.test.ts` covers a model (the Gemini path) that leaves the when
  inside *what*.
- `operations.test.ts`: the reminder's note now names its time ("…on Fri
  25 Sep at 9am").
- Two new golden cases, HT-13b (the trip home) and HT-13c ("later today").
  `npm run eval` passes 49/49 with 0 unsafe actions. Both cases fail on the
  old code.
- The full `npm run verify` result is in the PR.

## Still open

- **No browser check.** There is no model key locally, so a local run only
  exercises the rules. The model path is covered by the engine test.
- **Needs a person after deploy:** say "remind me to pick up coriander on my
  way back from office" to HomeTalk on production and confirm that the
  reminder is set for this evening without a question.
- **Hindi, Marathi and other languages** are not covered. These phrases are
  English only; that is i18n PR 2.
