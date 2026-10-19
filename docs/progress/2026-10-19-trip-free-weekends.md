# "When should we go away?" is answered from the calendar (14-033)

**Date:** 2026-10-19 · **Reported by:** the owner, with a screenshot: "what best time for 2 day getaway" was answered "WonderHome checked 11 things across groceries, family time and nothing needs anyone right now."

## Why it happened

- The rules read it as a status question. `looksLikeStatusQuestion`'s wide net takes any question that starts with "what" and contains "day", and "2 day" did that.
- HomeBrain then had nothing that said when the family was free. The model's draft was refused twice for a "because" with no rule behind it (`unsupported_inference`), so the turn fell back to the attention summary.

## What changed

- **A rule for when** (`homebrain/insights.ts`, `free_window`). `tripQuestion` reads a when-question about a getaway, trip, vacation, outing or break, and how many days ("2 day", "three-day", "a weekend"). "Suggest a getaway" (where) is left to HomePlaces, and "when is the next holiday?" is not a trip.
- **What it works out.** It looks at the next 8 weekends (Saturday to Sunday, or from Friday for three days or more) and lists the ones with nothing on the family calendar. For the others it says what is on: events, school events and exams, someone away, and an exam the morning after. An event's end is exclusive, so an all-day Friday stays on Friday.
- **How it reaches the answer** (`grounding.ts`). The rule's facts answer the question themselves, so the rules' answer leads with them and a model may cite them. Only the viewer's own items are used.
- The status reading is unchanged: the question is still a HomeBrain question, and HomeBrain now has the answer.

## Verified

- `homebrain/free-window.test.ts` (5): the question reader, free and less-free weekends, the exam the day after, the all-day Friday, no insight for other questions, and the live question end to end on golden household A.
- Golden case HT-118. `npm run eval` passes 135/135, with unsafe actions 0/18 and the voice gate passing.
- The homebrain, school and conversation tests (826) pass, along with `npm test`, typecheck and lint.
- Run read-only against the owner's stored context: Sat 24–Sun 25 Oct, Sat 31 Oct–Sun 1 Nov and Sat 7–Sun 8 Nov were free. That run found the all-day-Friday bug, which is fixed and tested.

## Still open

- Public holidays and occasions are not in HomeBrain's context yet, so a long weekend is not suggested. They belong with HomeTalk reading the calendar projection (26-003).
- Where to go is still HomePlaces' answer ("suggest a 2-day getaway").

## Where the code lives

`packages/core/src/homebrain/insights.ts`, `homebrain/grounding.ts`, `homebrain/free-window.test.ts`, `evaluation/cases.ts`.
