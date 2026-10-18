# HomeTalk across the home: 48 golden cases and multi-turn conversations, and the defects they found

**Date:** 2026-10-18 · **Area:** HomeTalk, HomeBrain, HomeEvents, the Wave 5 evaluation

## What was asked

More detailed HomeTalk tests: HomeTalk connected to every other module,
asked detailed questions, holding conversations, and checked for the right
answer from what the household actually keeps.

## What changed in the evaluation

- **HomeTalk answers are now real in `npm run eval`.** Before, a HomeTalk
  question scored the engine's placeholder ("Here is what I know about
  that."), so no HomeTalk case could check what a person was told.
  `runners.ts`'s `composedAnswer` now composes each answer the way the
  conversation route does:
  - the roster from the whole member list;
  - a month-sized span from the calendar (`calendarFor`, which applies the
    same visibility rule as `wh.may_see_event`);
  - everything else from HomeBrain over the facts that member may see;
  - an unknown request that reads as a question, from HomeBrain too.
  "Why?" answers are still not composed here, because the route reads them
  from recorded evidence at the time.
- **Conversations.** A `HomeTalkCase` can carry `followUps`. Each turn runs
  with what the turn before it left, as the route carries it:
  - the question it asked;
  - the proposal waiting for a yes;
  - what it was about (its focus);
  - the history so far;
  - the last question.

  Every turn's expectation is compared, and the case passes only if all of
  them pass.
- **Golden data.**
  - Events beyond the week, with visibility (`GoldenHousehold.calendar`):
    - a private event for one adult;
    - a participants-only evening;
    - a cancelled dinner;
    - an all-day trip;
    - a proposed puja;
    - an anniversary lunch;
    - Annual Day and a recital.
  - A slice of the DoP&T holidays (`GOLDEN_HOLIDAYS`).
  - Birthdays come from members' own dates of birth.
- **48 new cases, HT-28 to HT-75.** They cover the family roster, bills,
  school, meals, groceries, pets, appliances, responsibilities, health
  privacy, calendar months by member, and 11 multi-turn conversations:
  - "and Manan?"
  - "and Paati?"
  - a name given back to "which one?"
  - "move it to Friday" then "yes"
  - "mark it complete"
  - "pay it"
  - a declined payment
  - a yes with nothing waiting
  - a conversation that crosses calendar, bills and dinner

  HT-26 and HT-27 are unchanged.

## Product defects the cases found, and the fixes

| Found | Fix |
|---|---|
| "Which bills are due this week?" also listed the week's events and homework: the common word "week" put the calendar in scope, and the calendar pulled in school. | `homebrain/question.ts` connects domains from the focus when there is one; `grounding.ts` keeps facts to the focus and what it connects to. |
| "Which bills are due this month?" was answered as a list of the month's events. | `calendar/answer.ts`'s `asksTheCalendar`: a month question naming another part of the home goes to HomeBrain. The route and the runner both use it. |
| "Which bills are due next month?" listed every bill. | HomeBrain's `timeWindow` reads "next month". |
| "And Paati?" after "When is Thatha's appointment?" repeated Thatha's appointment: his nickname was not stripped from the inherited question. | A follow-up strips every name the earlier person goes by: name, first name, nickname and relationship. |
| A helper asking "When are the school fees due?" got a milk fact (school → groceries). | "School fees" reads as a bill. School no longer connects to groceries on every question; "need"/"bring" still does that. |
| "What is Manan working on for school?" listed the groceries. | Same change. |
| "Who is responsible for the bills?" was read as assigning a responsibility to someone called "Who". | The rule in `conversation/rules.ts` never takes a question word as a name. |
| "When is the Science project due?" then "Move it to Friday" proposed "move it", and "Mark it complete" could not find "it". | `homebrain/focus.ts`'s `focusFromAnswer`: a turn HomeBrain answered keeps, as its focus, the records it answered from (up to three, never a person). The route persists it. `grounding.ts`'s `schoolItemFor` resolves "it" to school work through the references, with one question when two pieces fit. |
| The calendar listing wrote "Sept". | It writes "Sep" like every other date. |

## Verified

- `npm run eval`: 105/105 cases (HomeTalk 77/77), unsafe actions 0/17, all
  release gates pass.
- `npm run test -w packages/core`: 226 files, 3,213 tests. New unit tests:
  - `homebrain/focus.test.ts`;
  - `calendar/answer.test.ts` (`asksTheCalendar`, "Sep");
  - `conversation/rules.test.ts` (question words);
  - `conversation/grounding.test.ts` ("it" for school work).
- `npm run typecheck` (all workspaces), ESLint on the route, and
  `npm run security`, `lint:boundaries`, `lint:secrets` and
  `lint:help-links` pass. A local production build of `apps/web` was run.
- No model was called: every case runs on the rules and the golden
  fixtures.

## Still open

- Corrections ("actually, make that Friday", "not bread, eggs") are applied
  in the route against the executed action record. They stay covered by
  `conversation/evaluation.test.ts` and are not replayed in the golden runner.
- A child asking about his own private health appointment (household D,
  Kabir) is told nothing is on record. Whether a child sees his own private
  appointment is a product decision, not something these cases settle.
- "How much do I owe this month?" lists the bills but gives no total. A
  total would be a new answer rule.

## Where it lives

- `packages/core/src/evaluation/{runners,households,types,cases}.ts`
- `packages/core/src/homebrain/{question,grounding,focus}.ts`
- `packages/core/src/calendar/answer.ts`
- `packages/core/src/conversation/{rules,grounding}.ts`
- `apps/web/app/_lib/hometalk-turn.ts`
