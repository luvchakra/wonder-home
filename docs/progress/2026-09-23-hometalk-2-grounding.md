# HomeTalk 2.0, part 1: grounding — Wave 4 (story 14-012)

**Date:** 2026-09-23 · **Area:** HomeTalk / conversation engine · **Spec:** `design/HOMETALK-2.0-WAVE-4.md`

## What this part does

Wave 4's aim is "HomeTalk should understand the household, not just the
sentence". Part 1 adds the step that was missing between understanding and
proposing: **grounding**. Every action intent is grounded before a proposal
exists. What the household meant, given this household, is decided by
deterministic code and the Wave 1 resolver, never by the model.

- **Temporal grounding (§7)** — `conversation/temporal.ts`. One resolver
  replaces three partial parsers. It works in the household's own timezone.
  - It understands today, tomorrow, tonight, day after tomorrow and yesterday.
  - Weekdays: "this Friday" is the coming Friday; "next Friday" is next week's.
  - Ranges: this weekend, next weekend, this week, next week.
  - Parts of the day, as windows rather than guessed times: this
    morning/afternoon/evening, after school (15:30–18:00), before dinner
    (17:00–19:00).
  - Explicit dates: "2 Oct", "october 2nd", ISO. A passed date said without a
    year means next year's.

  The model only names the phrase; the resolver decides the day. The
  executor's `resolveWhen` now delegates to it. The conversation route's
  `windowFor`, which used the server's clock, now uses it too.
- **Entity grounding (§6)** — `conversation/grounding.ts`. A person mention
  on an absence or an assignment becomes a member id through `resolvePerson`.
  That covers names, relationships ("my daughter") and age comparisons
  ("the younger one").
  - Two people fit: one focused question — "Which person did you mean —
    Asmi or Manan?"
  - Nobody fits: "I do not know anyone called … in your household."
  - A model-supplied id is used only if it belongs to someone in this
    household.

  Before this, an ambiguous name only surfaced as a failure after the write
  was attempted.
- **Reference resolution (§8)** — `conversation/references.ts`. "This",
  "that", "it", "them", "him", "the other one" resolve in the spec's order:
  1. the question just asked;
  2. the proposal waiting for a yes;
  3. recent conversation and recent HomeSend, weighed together by recency.

  If two different things came into play within half an hour, the answer is
  a question: "Do you mean the white T-shirt from the school notice or the
  printer paper?"
  - "Them" is the group that came in together.
  - "The other one" is the other of exactly two children.
  - With nothing to point at, HomeTalk asks. Before this, it would have
    added a grocery item literally called "that".
- **Conversation state (§16)**. Each turn records its **focus** on its own
  reply's metadata, as ids and labels only: what it grounded, what a
  proposal is about, and what an executor actually wrote. The next turn
  reads it back through `recentFocus`. Recent HomeSend intake is read under
  the member's own RLS (`listHomeSendItems` gained `since`/`limit`). A
  notice's requested items ("a white T-shirt") are candidates for "that".
- **Clarification answers**. Grounding's questions (who, which day, which
  one) are answered through `answerClarification`, folded back into the
  original request and grounded again. Asking the same grounding question a
  second time gives the escalated wording instead.

Nothing here authorizes anything. Scope, entitlement, permission and
autonomy run after grounding exactly as before. A payment whose "it"
resolves to one bill becomes a proposal needing approval, and is still not
executable from HomeTalk.

## Verified

- **Gates:** typecheck, lint and the migration/embed/boundary/secret lints
  pass.
  - Unit tests: 2069, then 2072 after the live-QA fixes. 42 are new: the
    temporal resolver 11, references 15, grounding 18.
  - Database tests: 414.
  - Build: pass.
  - Playwright: 364.
  - No migration was needed. Focus is stored in the existing
    `conversation_messages.metadata`.
- **Live QA** through the real signed-in conversation route, on a synthetic
  QA household (Priya; children Asmi and Manan; helper Sunita):
  - "Kid is away tomorrow" → "Which person did you mean — Asmi or Manan?";
    "Manan" → a proposal for Manan, tomorrow.
  - "Zorawar is away tomorrow" → "I do not know anyone called "zorawar" in
    your household."
  - "Sunita is away next friday" → "record that Sunita is away on Fri 2
    Oct"; "yes" → the absence was written for Sunita on 2026-10-02
    (checked in the database).
  - A school notice asking for "a white T-shirt" was seeded into HomeSend.
    "put that on the list" → the white T-shirt was added.
  - After "we need printer paper", "put that on the list" → "Do you mean the
    printer paper or the white T-shirt from the school notice?"; "the
    second one" → the T-shirt, already on the list, said so honestly.
  - Focus is persisted on each reply with real member and item ids.
  - HomeTalk checked in the browser at 360px and 1280px: no horizontal
    scroll, and the questions and previews read as intended.
- **Live QA found two bugs, fixed before merge, each with a regression
  test:**
  - A whole new request made straight after an open question ("Sunita is
    away next friday" after "Who did you mean?") was swallowed as the
    answer. Answers must now be short and must not be a request of their
    own.
  - The which-one question dropped "the" and the item's origin once the
    item had been added.

## Still open (parts 2 and 3)

- Seen in live QA, predating this change: when an item is already on the
  list, the Action Preview still shows "Done" and "What I did: Add …",
  although the reply text correctly says nothing was added. §12 says never
  "Done" when nothing was written. Part 2 fixes it.

- **Part 2:** corrections, multi-step requests and cross-domain requests.
  - Corrections before a write amend the pending operation; after a write
    they go through update/undo.
  - Multi-step requests decompose into independently validated operations.
  - Cross-domain requests propose per domain.
- **Part 3:** the rest of the spec.
  - The §17 model prompt contract: local date/time, grounded entities and
    pending state sent to the model. The understanding model is not told
    the date yet.
  - The ContextualIntent references schema and the §20 confidence wording.
  - The §21 examples and §22 evaluation matrix as tests, and the story
    marked Done.

## Where the code lives

`packages/core/src/conversation/{temporal,grounding,references}.ts` (+ tests),
`engine.ts` (the `ground` seam), `clarify.ts` (grounding answers and
escalation), `repository.ts` (`recentFocus`), `executor.ts` (`resolveWhen`),
`homesend/repository.ts` (`since`/`limit`), and the conversation route
(`loadReferences`, focus persistence, timezone-aware `windowFor`).
