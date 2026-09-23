# HomeTalk 2.0, part 3: model contract, confidence, the §21 examples and the §22 matrix (Wave 4, story 14-012 Done)

**Date:** 2026-09-23 · **Area:** HomeTalk / HomeBrain understanding · **Spec:** `design/HOMETALK-2.0-WAVE-4.md` §5, §13–§23

## What this part does

### A real bug first: the model could never say *what*

Live data showed the problem. The only model-understood action on record had
stored `parameters: {}`, and the model's `order_items` turns never became
actions.

The cause was the understanding schema. It declared `parameters` as an open
`z.record`, and Anthropic's structured-output helper turns that into an
object with **no properties** and `additionalProperties: false`. That is an
object that can only ever be empty. So the model could say "add to the list"
but never *what*, "record an absence" but never *when*.

`ai/model-client.ts` now declares every detail the engine reads as a named,
required, nullable field. That is the one shape Anthropic, OpenAI (which
rejects optional fields) and Gemini all accept. Nulls are dropped on the way
in, and Gemini's output is read leniently. A test proves both SDK helpers
accept the schema with real properties.

### §19 "Never let the model invent a trusted database id"

**Before this part, a model's parameters passed straight through to the
executor.** That meant a model-supplied `recipeId`, or a model-invented
`corrects` record ("undo row X"), could reach a write.

Two things now close that:
- The schema has **no id field of any kind**.
- `withoutServerOnly` strips anything that is the server's to decide: every
  `…Id`/`…Ids`, every grounded `…Resolved` date, `corrects` records,
  `awaiting`, `candidates`, `referred`, `forMeal`, and the confidence fields.
  A preference's `corrects: true` is still allowed.

Ids come only from grounding: the Wave 1 resolver, and the household's own
recipes, school items and appliances. A recipe id or school-item id arriving
from an answered question is checked again against what is actually on
record.

### §5 ContextualIntent

The model may return `references` (the phrases that pointed at something).
They are kept on the understanding trace, as phrases only. Any id beside one
is never read.

### §17 Prompt contract

The system prompt now carries a **runtime context** block, stated as facts
rather than instructions:
- the speaker's role;
- the household's local date and time;
- what is waiting (the question just asked, or the proposal awaiting a yes);
- what the conversation was just about.

It all goes through the same minimisation as the utterance, so a name in a
pending question leaves as its placeholder. The model is told to keep day
words as said, because code decides the date. The user message is only the
utterance. The privacy disclosure now says what went with it.

### §20 Confidence UX

The numbers stay internal.
- **Resolved with high confidence:** nothing extra is said.
- **Resolved at medium confidence** (below 0.9, for example "the younger
  one" at 0.88): the reply leads with *"I think you mean Manan (you said "the
  younger one") — if not, say who."* A wrong guess is then one "no, I meant
  Asmi" away (§9).
- **Two equally likely people:** *"I found two possibilities — Asmi or
  Manan. Which did you mean?"*

### §21 required examples

All fifteen are understood and handled for real through their own domain
services. The deterministic safety net (§18) now reads each one, and the
model is taught the new actions.

| Example | Handling |
|---|---|
| "What does Asmi have tomorrow?", "What are we eating tonight?", "Which bills are due this week?", "When is my next checkup?" | HomeBrain answers from the facts. |
| "Move Manan's science project to Friday." | `adjust_schedule` grounded to the one open school item. After a yes, `updateSchoolItem` moves it and keeps the time of day it was due. |
| "Mark Asmi's worksheet complete." | New `complete_school_item`, through `completeSchoolItem`. Several matches → which one; none → said so. |
| "We're out of atta.", "Add the same milk we bought last week." | Add, with "same … we bought last week" read as the milk already tracked. |
| "Remove the bananas." | New `remove_from_list` → `retireConsumable`. Something that isn't on the list is said so. |
| "Plan something vegetarian for tomorrow." | Asks which dish, offering the household's own recipes. Never makes a dish up. |
| "Prepare the electricity payment." | `make_payment`: always waits for a person, and nothing is paid without a provider. |
| "The washing machine is making that noise again.", "Raise a service request." | New `raise_service_request` → `createServiceRequest`, against the household's own appliance. It asks which appliance when none was named. Nobody is contacted. |
| "Protect Saturday evening for family time." | `plan_event` becomes a real, protected, owned block on the family calendar through `createEvent` once approved. A plan with no real time ("this weekend") still is not put on the calendar. |
| "Log my weight as 71.5 kg." | The existing vital log. |

### §22 evaluation matrix

`conversation/evaluation.test.ts` runs the §21 examples and every §22
dimension through the whole deterministic turn (rules → grounding → gates →
proposal) on one fixed household:
- contextual references;
- Asmi vs Manan;
- an ambiguous child reference;
- date expressions;
- corrections before and after a write;
- voice confidence (a shaky consequential transcript is read back, never
  acted on);
- payments, orders and access changes (always wait, or are refused for a
  child);
- cross-domain plans with the premise rule;
- HomeSend-created context;
- corrections of executed actions.

### §15 HomeTalk and HomeSend share one truth

`operations.test.ts` proves it in both directions:
- what HomeTalk adds is what `reconcileHomeSend` then calls a duplicate;
- what HomeSend put on the list is what HomeTalk will not add twice.

## Verified

- **Gates:**
  - `npm run verify` passed (typecheck, lint, the migration, embed,
    boundary and secret lints, tracker, brand, security). Test counts: 2159
    unit, 414 database, 364 Playwright, plus the build.
  - 44 unit tests are new since part 2: `evaluation.test.ts` (30), and
    additions to `operations.test.ts`, `model-client.test.ts` and
    `rules.test.ts`.
  - No migration was needed.
- **Live QA** through the real signed-in route on the QA household, with
  school items and a washing machine seeded. Every write was checked in the
  database:
  - the worksheet was marked done;
  - the science project moved to Friday at its old 17:00 IST;
  - a service request was linked to the washing machine;
  - a protected Family time event, owned by the speaker, was created for
    Saturday 17:00–21:00 IST;
  - bananas were retired;
  - "the younger one is away tomorrow" gave "I think you mean Manan…";
  - "something vegetarian" offered Tomato pasta, and answering "Tomato
    pasta" proposed that meal.
- **Browser:** checked at 360px and 1280px, with no horizontal scroll. The
  "I think you mean Asmi" reply and its preview render cleanly.
- **Model path:** no model key is configured locally. The provider path is
  covered by the schema, SDK-helper, stripping and prompt tests; the
  post-merge production check is recorded below.

## Still open

- **Undo from HomeTalk:** a planned meal, a completed school item, a
  removed item and a service request are not yet undone *from HomeTalk*.
  A correction of one refuses and changes nothing. Each is undoable on its
  own screen.
- **Tidying the Kids & School service:** `completeSchoolItem` scopes its
  update by id and RLS, not by household, as the other school writes do.
  RLS is authoritative, so this is tidiness rather than a hole.
- **Reminder delivery:** push and email delivery of reminders is still the
  delivery-channel work. The in-app inbox is what is live.

## Where the code lives

- `packages/core/src/ai/model-client.ts`: the named parameters schema,
  `withoutServerOnly`, `systemFor`, and the lenient Gemini read.
- `packages/core/src/conversation/`:
  - `grounding.ts`: school items, appliances, protected time, dietary meals,
    `confidenceLead`, and the "two possibilities" wording;
  - `executor.ts`: `removeFromGroceries`, `markSchoolItemDone`,
    `moveSchoolItem`, `raiseServiceRequest`, `putOnCalendar`;
  - `rules.ts`, `clarify.ts`, `proposal.ts`, `intent.ts`, `engine.ts`
    (`RuntimeContext`), `references.ts`, `corrections.ts`;
  - `evaluation.test.ts` (new), `operations.test.ts`.
- The conversation route: runtime context, the new loaders, the "I think you
  mean" line, and the new entitlements.
