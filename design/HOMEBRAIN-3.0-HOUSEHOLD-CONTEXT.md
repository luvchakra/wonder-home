# WonderHome Wave 6 — HomeBrain 3.0: one warm household context, answered in one pass

**Status:** Design for the owner's review (2026-10-18). Nothing in it is built yet; §6 is the build order.
**Prerequisites:** Wave 1 (context engine), Wave 2 (HomeBrain 2.0), Wave 5 (evaluation).
**Primary outcome:** HomeTalk answers any question about the household from everything the household has told it, in about two seconds, through a model that reads the whole picture at once — without a model ever touching a table, and without loosening a single gate.

## 1. What the owner saw, and why it happened

Three reports on 2026-10-18, each traced in the code:

| What happened | Why, in today's code |
|---|---|
| "Check Asmi's birthday event, a few people are coming. Do you know?" → "no details about planned events or guests" | The facts a model may see only reach seven days ahead (`HORIZON_DAYS = 7` in `context/builders.ts`); the birthday is on 9 December. And `event_guests` is never read into the context at all — only the event's own screen reads it (`family/event-detail.ts`). The model saw the birthday *occasion* from the calendar and, honestly for what it was shown, nothing else. |
| "Upasana likes Italian food" → "Remembered" → minutes later, "I don't have any records of Upasana's food preferences" | The belief was stored (`memories`, checked on the live project). But an answer is composed from a ranked, budgeted subset of facts (`groundFacts`, `FACT_BUDGET = 80`, then `minimiseContext` with the policy's `maxItems`), and "What does Upasana like? In food." read as a different question from "What does Upasana like in food?". When no model answer is accepted, the fallback is the *agenda summary* (`answerStatus`), which contains no memories at all — so the same question was answered from two different sources and disagreed with itself. (Fixed today by a rule, `conversation/likes.ts`; the design below removes the cause.) |
| Replies take 4–16 s (`metadata.timings` on the live project) | Two or three model calls run one after the other — understand, compose, sometimes a regeneration, then translate — and the household's context is rebuilt from about twenty domain reads (each one to three queries) on every turn, kept 45 s in one server's memory (`CONTEXT_TTL_MS`). On Vercel that cache is cold nearly every time. |

The shape under all three: **the context is assembled per request, sized by caps and horizons chosen when it was built, and a question is answered by whichever path happens to run.** That is one design limit, not three bugs.

## 2. Principles

What stays true (CLAUDE.md, Wave 2):

- A model only ever sees `GroundedFact`s with opaque `F` ids, pseudonymised at the gate. It never reaches a table.
- Every model answer is validated (`homebrain/validate.ts`); nothing unsupported reaches a person.
- Consent (`minimiseContext`, the data-use policy, `REPLY_CLASSES`), RLS, permissions, entitlements and autonomy decide. The model proposes.
- Writes go through domain services; an approval binds to its fingerprint; "why?" is answered from evidence.
- Numbers are counts of things evaluated.

What is new:

1. **One context, whole.** The household's context is complete — every active record and its connections, not a horizon or a cap — built once, kept warm, and read by every answer path.
2. **The question sizes the context, not the builder.** Retrieval picks what a question needs from the whole. Nothing decided at build time keeps December out of a question asked in October.
3. **One pass.** For a question, the model understands and answers in one call over the retrieved facts. The only second call is translation, for a household not in English.
4. **Same facts, same answer.** A rule and a model answering the same question read the same facts. The agenda summary is never the answer to a specific question.
5. **Fast by not doing work on the turn.** Building the context, resolving policy and recording the turn happen off the request path.

## 3. Architecture

```
domain writes ──(invalidatesContext)──▶ jobs: context.rebuild(section)
                                              │
                                              ▼
                                   household_context (one row per household)
                                              │  one read, ~40 ms
                                              ▼
turn ──▶ filterForViewer ──▶ retrieve (question-sized, in memory) ──▶ consent gate
                                                                          │
                                   reply streams ◀── validate ◀── model, one pass, cached prefix
                                      │
                                      └──▶ after the response: record, consume, telemetry
```

### 3.1 The Household Context Store

- **Table `household_context`**, one row per household:
  - `household_id` (pk), `version bigint`;
  - `document jsonb` — the household's `HouseholdContextItem[]`, built by the same `context/builders.ts`, with **no horizon and no per-list cap**;
  - `sections jsonb` — `{ [domain]: { version, builtAt, count } }`;
  - `people jsonb`, `policy jsonb` — the member list and the resolved data-use policy and provider routing inputs, so a turn resolves neither;
  - `size_bytes`, `built_at`.
- **Service-role only**: a deny-all policy like `usda_foods`. It is read server-side after `requireMembership`, and `filterForViewer` (exists) runs in memory before anything leaves. The browser never reads it. Nothing in it is text a person did not enter — the same statements today's items carry.
- **What goes in that does not today:** event participants *and guests with their replies*; every memory and belief (not 24); every member's details (phones, school, office, hours, languages); the place book, home, schools and offices (what the HomePlaces screen will show); recipes with ingredients; every food preference; the calendar from 30 days back to 400 days ahead with recurrences expanded; school terms and items; bills, past and due; pets and their care; responsibilities, the playbook, policies and autonomy settings; open notifications; the HomeSend inbox; HomeTalk's actions of the last 30 days. Each is a section with its own freshness.
- **Size.** A household is hundreds of records, not millions: typically 100–400 KB. Cap 2 MB; past that, closed and past items collapse into counts per domain plus the last 20, in a `history` section. Measured on the live households before the cap is final.
- **Connections** are kept on the items, not rebuilt per question: an event carries its participant and guest ids; a meal its recipe id; a person their memory, preference, school and office ids. `identityKey` (exists) already dedupes.

### 3.2 Keeping it warm

- `invalidatesContext` (`context/invalidation.ts`) already wraps every domain write. It additionally enqueues `context.rebuild { householdId, domain }` into `jobs` — one pending job per household and domain, debounced 2 s, the same discipline as `homesend/retry-queue.ts`.
- A worker on the existing job runner rebuilds that section only, with the domain's adapter from `CONTEXT_ADAPTERS`, and bumps `version`. Target: p95 under 1 s per section.
- Time moves facts ("due tomorrow" becomes "due today"): dated states keep being derived at read time from `now` (`applyFreshness`, exists), and an hourly cron rebuilds the dated sections (calendar, bills, school, meals) so counts stay true.
- Safety net (phase D): triggers on the domain tables insert the same job, for a write that bypassed a service (admin SQL, a migration).
- **The first turn** with no row builds inline, as today, and stores it. After that a turn never builds; it reads what is there and the rebuild runs after. A section a few seconds stale is acceptable, and "why?" says when it was built.
- **Read path.** One `select` by primary key, plus an in-process LRU keyed by `version` for a conversation's follow-ups on the same instance.

### 3.3 Retrieval — the question sizes the facts

`homebrain/retrieve.ts`, pure, over the viewer-filtered items:

1. **Ranking** — the existing `groundFacts` (tier, mention, domain, person, date) stays the core.
2. **A lexical index**, built once per store version: names, nicknames, titles, item keys, dates, aliases. "Asmi's birthday … people coming" pulls the event, Asmi, and the guest list by name.
3. **Connected records.** A chosen item pulls what it carries: an event its guests, a meal its recipe and ingredients, a person their memories and preferences and school and office. This is what "a few people are coming" needs and what no ranking of single items gives.
4. **The time window** from the question (`timeWindow`, exists) ranks dated facts outside it lower — never out. There is no horizon.
5. **A budget in tokens, not items:** 8k tokens of facts by default (about 300 facts). A broad question gets the always-on tier (people, today, attention) plus the top of the rest.

Retrieval runs in memory in under 20 ms for 2,000 items (a test holds it there).

### 3.4 One-pass answering

- **One model call per question.** Input: a stable system prompt; the household block — the retrieved facts as `F` ids, pseudonymised, only the classes the policy allows; the last ten turns; the question.
- **Output, structured:** `{ mode: "answer" | "clarify" | "not_on_record" | "action", text, usedFacts: string[], intent?: IntentOutput }`. `intent` uses the existing `IntentOutputSchema`, so an action sentence costs no second understanding call: it goes straight into the existing ground → gate → propose path with every check unchanged.
- **Prompt caching.** The system prompt and the household block are the cached prefix, keyed by household, store version and allowed classes — Anthropic `cache_control` on the primary provider, Gemini context caching where its minimum size is met, OpenAI's automatic caching. A class the policy does not allow is never in a cached block.
- **Validation unchanged.** `validate.ts` refuses the unsupported; one regeneration with tighter context; then a deterministic answer from the same facts; then an honest "nothing on record".
- **Streaming.** The compose call streams; the composer shows the words as they come; voice speaks sentence chunks (`speechChunks`, exists).
- **Models.** Sonnet 5.5 at low effort for the one pass. Haiku 5.5 stays for HomeSend classification. Translation stays on Sonnet. All through `ai/provider-clients.ts`.
- **Rules stay** as a 2 ms pre-pass for confident action sentences and the deterministic answers (roster, likes, calendar spans, screens, places) — and every one of them reads the store, not its own queries. A live lookup (the place search) is the one exception.

### 3.5 The turn, rebuilt

Today, in order: membership → consume entitlement → rate limit → [entitled, session, autonomy, people] → [pending, history, clarifying, focus] → routing (keys, policy) → **understand (model)** → gather context (~20 reads) → **compose (model)** → validate → **translate (model)** → record.

After: membership → in parallel { the store row (document, people, policy), the session and its history tail, rate limit } → filter + retrieve, in memory → **one model call, streaming** → validate → the reply streams → after the response: record the message (idempotent key), consume the entitlement, write telemetry, enqueue a rebuild if the turn wrote.

| Target | Typed | Voice |
|---|---|---|
| First token / first audio, p95 | 2.5 s | 3 s |
| Complete reply, p95 | 4 s | — |
| Deterministic answers, p95 | 400 ms | 400 ms |

Measured from `conversation_messages.metadata.timings`, which gains `store`, `retrieve` and `firstToken`. The baseline is the live project's 4.2–15.6 s.

### 3.6 Consistency

- A specific question is never answered by the agenda summary. `answerStatus` stays only for the broad "what's going on?".
- Every deterministic answer reads the store's items.
- `evaluation/production.ts` gains **"said not on record while on record"**: an answer in mode `not_on_record` where retrieval had at least one answering fact. It is a blocking release gate at zero over the golden set, and a production count on the AI quality page.

### 3.7 Privacy and consent

- The store holds the whole household; the viewer filter runs before anything leaves the server; the consent gate decides, per content class, what reaches a provider. Nothing changes in which classes a child, a bill or a health record are.
- Gemini Live tool calls run the same one-pass turn under the same in-app limits (`channelAllowsAction`, `inApp`).
- One row per household, overwritten on rebuild, deleted with the household.

### 3.8 Out of scope

Vector embeddings and a separate search service — a household's record is small enough that a lexical index plus connected records answers in memory. Agents running on their own (`proactive_agents` stays off). A change to approvals or autonomy.

## 4. Data model

```sql
create table public.household_context (
  household_id uuid primary key references public.households(id) on delete cascade,
  version bigint not null default 1,
  document jsonb not null default '[]'::jsonb,
  sections jsonb not null default '{}'::jsonb,
  people jsonb not null default '[]'::jsonb,
  policy jsonb not null default '{}'::jsonb,
  size_bytes integer not null default 0 check (size_bytes <= 2097152),
  built_at timestamptz not null default now()
);
-- deny-all RLS; service role only; comment says why.
-- jobs.kind 'context.rebuild', payload { domain }, unique while pending per (household_id, domain).
```

`conversation_messages.metadata.timings` adds `store`, `retrieve`, `firstToken`.

## 5. Acceptance — the owner's three reports as tests

1. **The birthday.** Golden household A gets Asmi's birthday party in two months with two members and two named guests. "Check Asmi's birthday event, a few people are coming. Do you know?" answers with the date and every name, through the model (`--provider configured`) and deterministically. A live check does the same on the owner's household.
2. **The likes.** "Upasana likes Italian food" then, in the same conversation and in a new one, "What does Upasana like? In food." and "What does Upasana like in food?" both answer with it. Production count of "not on record while on record" is zero over the golden set.
3. **The speed.** Over a day of live turns after Phase B, typed p95 to first token ≤ 2.5 s and voice first audio ≤ 3 s, read from `metadata.timings`. Before/after is in the progress note.
4. **Nothing loosened.** `npm run eval` passes every case, the Unsafe Action Rate stays 0, the security suite passes, and the tenant-isolation and RLS tests cover the new table.

## 6. Build order — four PRs, each shippable

| Phase | What | Fixes | Size |
|---|---|---|---|
| **A — The store** | `household_context` + deny-all RLS; builders without caps or horizons; guests, every memory, places, member details added; `invalidatesContext` enqueues `context.rebuild`; the worker; the turn reads one row; first-turn inline build; `verify:live` probes; DB tests; eval cases for the birthday and an event two months out | The birthday report | medium |
| **B — Retrieval and one pass** | `retrieve.ts` (index, connected records, token budget); the structured one-pass call with a cached prefix; streaming; the understand call dropped for questions; timings; a latency test on synthetic households | The speed | large |
| **C — Consistency** | Deterministic answers read the store; the agenda fallback kept to broad questions; the "not on record while on record" gate and count; the likes golden case | The likes report, for good | small |
| **D — Keep-warm hardening** | DB-trigger safety net; hourly cron for dated sections; size cap and the `history` section; the store's lag on the AI quality page | — | small |

A before B before C; D any time after A. A alone makes the birthday answerable; B is where the speed comes from.

## 7. Decisions for the owner

1. **The fact budget.** 8k tokens of facts per question (about 300 facts) is the proposed default. Larger answers more but costs more per uncached turn.
2. **Cost.** Prompts grow but the household block is cached; the real per-turn cost is measured from the provider's usage after Phase B and put in the progress note, not estimated here.
3. **Provider.** Caching is strongest on Anthropic, the primary provider. A household on Gemini or OpenAI gets the same correctness; speed depends on that provider's caching.
4. **Staleness.** A section a few seconds behind a write is accepted; a turn never waits for a rebuild. "Why?" says when the section was built.

## 8. Where it lives (when built)

- `packages/core/src/context/store.ts` — read, write, rebuild a section.
- `packages/core/src/context/rebuild-queue.ts` — the job.
- `packages/core/src/homebrain/retrieve.ts` — index, connected records, budget.
- `packages/core/src/homebrain/one-pass.ts` — the structured call and its prompt; `ai/model-client.ts` gains the cached prefix.
- `apps/web/app/_lib/hometalk-turn.ts` — the turn in §3.5's order.
- `supabase/migrations/…_household_context.sql`.
- Tests: `context/store.test.ts`, `homebrain/retrieve.test.ts`, `scripts/test-household-context-rls.mjs`, eval cases HT-89 onward.
