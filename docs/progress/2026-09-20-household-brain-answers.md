# The Household Brain: a question answered from everything the home holds

**Date:** 2026-09-20 · **Kind:** product-direction P0 (v4 §5 "Household Brain", §6 "context assembly, cross-domain reasoning, result interpretation") · **Stories:** 14-001 Household orchestrator, 14-003 Plan/execute/monitor loop (both already Done; notes updated), building on 04-003 and 15-005

## Why

With the consent gate fixed (previous note), the model was finally being
asked — and every question came back with the same line: "All quiet. I
checked 14 things across groceries, meals, bills, family time and nothing
needs you right now." "Tell me about my family members", "where do you need
my attention" and "what is the current situation" all became `ask_status`,
and `ask_status` had exactly one answer: the deterministic agenda summary.
The model understood the question and was never allowed to answer it.

## What changed

**`packages/core/src/conversation/brain.ts`** — the Household Brain's working
memory. Two halves:

- `factsFrom(snapshot)` is pure: every domain record becomes one
  plain-language fact — who is in the household and who is asking; who is
  responsible for what and how much WonderHome may do; what needs
  attention and what was checked; the next seven days of the calendar;
  meals from today with cook, time and missing ingredients; groceries and
  supplies tracked; open orders; unpaid bills with amount, due date and
  owner; open school work and what the school asked for; who is away;
  what the household has said it prefers. Each fact carries the consent
  class the gate decides on: a bill is `financial`, anything about a
  child is `child`, an absence is `location`, the rest `general`. Empty
  domains say so ("No bills are on record yet") rather than vanish.
- `householdContext(supabase, input)` is the read, through the member's own
  client so RLS decides, each domain isolated so one that cannot be read
  costs the answer that domain only. A child's view never reads meals,
  groceries or orders; bills need `finance.view`; school needs
  `school.manage` or `school.view_own`. Gathered once per viewer and kept
  45 seconds — a conversation is a burst of questions about the same home —
  and forgotten the moment the conversation changes something
  (`forgetHouseholdContext` after every executed or approved write).

**`packages/core/src/ai/model-client.ts`** — `createAnswerComposer(provider,
key)` for Anthropic, Google and OpenAI, sharing one prompt and one
structured output `{ answer, grounded }`. The model is told the facts are
the whole world: never invent a person, bill, event or plan; never claim to
have done anything; say plainly when the facts do not cover the question;
answer *this* question for *this* person, never the same summary twice.
Placeholders ("Adult A", "Child B") are used exactly as given.

**`packages/core/src/ai/privacy.ts`** — `restoreNames`: the way back for
prose. The gate still replaces names with roles on the way out; the
composed answer comes back about placeholders and the names go back in
here, on this server, before anybody sees it.

**The route** — `decideProviderRouting` now also returns `answer()`, bound
to the same gate and the same key: the facts are minimised by the
household's consent classes (with a fact budget of 80 rather than the
utterance's 12), names swapped, the model composes, names restored. It is
used for every `ask_status` turn, and for a turn the engine could not
classify (no model failure, no specific question to ask) before saying "I
did not follow that" — but only when the model says the facts actually
answered it (`grounded`). Every fallback keeps the deterministic line:
policy lets nothing go, no provider, model error, or the brain itself
failing to read. The reply metadata records `brain: model | deterministic |
none` and the facts count; the privacy disclosure names how many facts went.

## What the household now gets

"Tell me about my family members" lists who lives there, who helps, who is
away and what each has on. "Where do you need my attention" names the bill,
the homework and the missing ingredient rather than counting them. "What's
for dinner" answers with the dish, the time and the cook. And a question the
home cannot answer gets "I don't know that yet — tell me X and I will" in
place of a summary that was never about the question.

## Verified

- `brain.test.ts` (6 cases): every domain rendered in words and household
  dates; class labels per fact; the default consent holding back child,
  financial and location facts while names never leave; empty domains
  spoken. `privacy.test.ts` +2 for `restoreNames`.
- `packages/core` vitest, `npm run typecheck`, `npm run lint`, `npm run
  test`, `npm run build`, `npm run test:e2e`, `npm run tracker -- --check` —
  see the PR for counts.
- Not verifiable here: a live composed answer (no key in this session, none
  invented). Production's next question is the test; its reply metadata
  (`brain`, `providerItemsSent`) says whether the model composed it.

## Still open

- Per-domain deep questions ("how much did we spend on groceries last
  month") need history the facts do not yet carry (purchases, past
  orders); the snapshot is the present and the next seven days.
- "Why didn't you order it?" (v4 §17, explainable non-action) needs the
  agent-run record in the facts; not yet included.
- The 45-second memory is per warm server instance; a second instance
  re-reads. Fine for a chat burst, not a shared cache.
