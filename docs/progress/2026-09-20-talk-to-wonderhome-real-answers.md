# Talk to WonderHome: real answers, real actions, and the truth when there aren't any

**Date:** 2026-09-20 · **Kind:** product-direction P0 (v4 §6 "Real AI reasoning", §7 "Conversation as a primary control surface", §8 "Action preview")

## Why

The assistant in production answered "I did not follow that — what would you
like me to do?" to "okay tell me what's going on in my home" and to "add a
grocery item of milk", while the canned suggestion "Add coriander to the
grocery list" worked and then said "Done — I have your go-ahead and it is on
its way" without adding anything anywhere. Three things were true at once:

1. **Understanding was an exact-match lookup.** `resolveFixtureIntent` answers
   the twelve sentences it was taught and returns `unknown` for everything
   else — right for a regression suite, wrong for a person. A model
   (`ai/model-client.ts`) was wired behind the `understand` seam, but only
   answers once `WONDERHOME_AI_KEY` (or a household key) is configured, and
   production's provider code could not be checked from this session (the
   production database, `kqxndableyysxqhxiorz`, is not among the projects the
   connected Supabase account can see; same blind spot as the Vercel logs).
2. **A model failure was indistinguishable from a misunderstanding.** Every
   error in the provider call was swallowed into the same `unknown` intent
   with no log line and no distinct reply, so nobody — person or operator —
   could tell an outage from a bad sentence.
3. **Nothing executed.** The route never passed `executable` to the engine,
   so every "executed" proposal was downgraded to "prepared"; and an approved
   proposal was answered "it is on its way" while no governed write ran.

## What changed

**A rule-based understanding layer** — `conversation/rules.ts`. Reads the
ordinary ways people ask (status questions, adding to the groceries in many
phrasings, "X is away tomorrow", "pay the electricity bill", "plan a picnic
this weekend", "move karate to Thursday", "Priya handles the school run",
"we prefer dinner at 8", greetings and "what can you do"). It sits after the
fixtures and under any model: the default understanding is fixtures → rules,
and when a model answers `unknown` for something the rules plainly read, the
rules win. Confidence is set the way a careful person would: "pay it" stays
below the consequential threshold so the engine still asks. Every rule is a
request, never an authorization — the same gates run on it as on a fixture
or a model's output.

**Honesty about the model** — `conversation/intent.ts`, `ai/model-client.ts`.
`HouseholdIntent` carries an `understanding` trace (`fixture` / `rules` /
`model`, provider, and a `failure` when a model was asked and did not answer
usably). A provider failure is now logged server-side with the error class
and HTTP status (never the household's words) and the reply says "I could
not reach my model just now" rather than "I did not follow that". The
genuine did-not-follow reply now says what the assistant can be asked. The
Anthropic call keeps the SDK's structured-output shape (`messages.parse` +
`output_config.format`, verified against the SDK reference) and runs at low
effort — translating one sentence into a small JSON object is routine work.

**Conversation context** — the model now receives up to six earlier turns
of the same session, each passed through the same data-use policy and
pseudonymisation as the utterance (15-005), so "actually make it 7" can be
understood. A placeholder the model answers about ("child a") is mapped back
to the member on this server (`unpseudonymise`), before any gate sees it.

**Real answers to "what's going on?"** — `conversation/status.ts`. Composed
deterministically from the same domain engines the Home screen reads
(`householdAgenda`): what needs a person with each domain's own reason, what
was checked and handled quietly, which domains could not be read, and the
day's calendar when a day was asked about. Nothing about the household
leaves the server to produce it. Every number is a count somebody can
explain (design principle 9).

**Real execution** — `conversation/executor.ts`. "Add milk to the groceries"
adds a `grocery` consumable through `createConsumable` under the member's own
RLS ("already on the list" when it is). "Sunita is away tomorrow" records an
`availability_exceptions` row for the right day in the household's timezone.
A stated preference is remembered (as before) and now confirmed in those
words. The route passes `canExecute` to the engine, so "executed" is claimed
only when something did it, and an **approved** proposal is carried out on
approval — or, when WonderHome cannot do it yet (a payment, an order, a
reassignment, a reschedule), the reply says exactly that and where the
person can do it. "It is on its way" is gone.

**UI**: nothing changed in the assistant screen; every new sentence flows
through the existing reply text. The `.env.example` documents
`WONDERHOME_AI_KEY` / `WONDERHOME_AI_PROVIDER` / `WONDERHOME_AI_MODEL`.

## Verified

- `npm run verify` — typecheck, lint, migration/embed/boundary/secrets lint,
  tracker and brand checks, security, unit (1,122, about 60 of them new: rules,
  status composer, execution date arithmetic, pseudonym mapping, engine
  fallback and failure wording), DB tests, build, 252 e2e — all passing.
- Not verified live: a real provider round-trip, for the same reason as
  before — no key is available in this session and none is claimed
  (CLAUDE.md: a provider is live only once credentials and contract behaviour
  are configured). What is guaranteed without a key: the sentences in the
  screenshot now work, and a key, once set, adds understanding on top rather
  than replacing what works.

## Still open / needs a person

- **Set `WONDERHOME_AI_KEY` on the production deployment** (Vercel project
  `wonderhome`, team `wonder-team4`) for model understanding beyond the
  rules; `WONDERHOME_AI_PROVIDER` defaults to `anthropic`. Settings → shows
  which key source is in use.
- Execution for payments, orders, reassignment and rescheduling waits on
  their providers/flows; the assistant now says so instead of pretending.
- Composing status answers with a model (for warmer phrasing) would send
  household state to a provider; deliberately not done — the deterministic
  composition sends nothing.

## Where

`packages/core/src/conversation/{rules,status,executor}.ts` (new),
`intent.ts`, `engine.ts`, `proposal.ts`, `repository.ts`,
`packages/core/src/ai/{model-client,privacy}.ts`,
`apps/web/app/api/v1/households/[householdId]/conversation/route.ts`,
`.env.example`.
