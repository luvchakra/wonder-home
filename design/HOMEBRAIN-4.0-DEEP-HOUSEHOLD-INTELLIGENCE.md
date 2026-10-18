# WonderHome Wave 7 — HomeBrain 4.0: knows the whole household, looks deeper when it doesn't, and does what was asked

**Status:** Proposed on 2026-10-18 for the owner's approval. Builds on HomeBrain 3.0 (`design/HOMEBRAIN-3.0-HOUSEHOLD-CONTEXT.md`, phase A live) and **replaces its unbuilt phases B–D** (14-021 to 14-023), which are folded in below.
**Stories:** 14-024 to 14-031 in `backlogs/14-AI-Orchestration-and-Learning.md`. Each phase is one PR, written so it can be built without re-deriving this design.
**Prerequisites:** Wave 1 (context engine), Wave 2 (HomeBrain 2.0), Wave 4 (HomeTalk 2.0), Wave 5 (evaluation), Wave 6 phase A (the Household Context Store).

---

## 1. What the owner saw on 2026-10-18, and why

Two Gemini Live conversations in the app, 22:29 and 22:35 IST. Each was traced to the code.

### 1.1 "Who are the family members in this household?" → "I couldn't find the specific list"

Gemini called `ask_household` with the person's own words: *"Okay, so. Okay, who are the family members in this household?"*.

| Step | What happened | Where |
|---|---|---|
| The roster rule | Did not match. `ROSTER_QUESTION` is anchored (`^…$`) and accepts "who are the family members?" but not a spoken lead-in ("Okay, so. Okay,"), and not "…members **in this household**". Checked: `isRosterQuestion` is false for both the spoken sentence and the same sentence without the lead-in. | `conversation/roster.ts:22` |
| HomeBrain | Got the question as an ordinary one. The `people` facts are tier 1 and ranked, **but `people` is in `BACKGROUND`**, so the deterministic answer never uses them (`relevantAnswers` drops them). The model got the facts pseudonymised. A child's fact is class `child`, and Gemini only hears the classes the household lets reach a provider, so the children can be held back. The model said, correctly for what it was shown, that it had no list. | `homebrain/answer.ts:79,119`, `voicelink/scopes.ts` `narrowToChannel` |
| "Can you check the WonderHome database?" | Nothing in HomeBrain can "look again". The second turn ran the same path over the same facts and got the same answer. | `homebrain/turn.ts` |

So the answer existed (the roster, by rules, in `apps/web/app/_lib/hometalk-turn.ts:805`). It was not reached because:
1. the words were not normalised before the rules read them;
2. a question's answer depends on which path happens to run;
3. there is no deeper read when the fast path misses.

### 1.2 "I am planning a movie night on Friday this week" → "That needs your OK on the screen, please type it"

| Step | What happened | Where |
|---|---|---|
| Understanding | Read correctly as `plan_event`. | rules / model |
| The channel gate | `plan_event` is in the capability `planning_changes`, whose policy is `gemini_voice: "app_only"`. It has no entry in `ACTION_SCOPE`, so `channelAllowsAction` is false. The refusal is `IN_APP_VOICE_NOT_ALLOWED`: "That needs your OK on screen … Type it here." | `voicelink/capabilities.ts:213`, `voicelink/scopes.ts:80,172` |
| "You can shut it off" | Passed through `answer_pending_question`, but nothing was pending: the refusal had not created a proposal. Same refusal again. | `voicelink/gemini-live.ts` |
| Typed instead | Typed, the same sentence becomes a **proposal waiting for a yes**: `plan_event` is `kind: "schedule"`, and an unconfigured outcome resolves to `observe`/`approve`, never `execute`. The footer says so: "WonderHome proposes and, only with your OK, acts." | `conversation/proposal.ts:59`, `household/autonomy.ts` |

So the person said exactly what they wanted, twice, and was sent to a keyboard. The rule behind it ("voice may not change plans") was written for a speaker in another room (Alexa), and it was applied to the person holding the phone inside HomeTalk.

### 1.3 The shape under both

**HomeBrain answers from a fixed slice and never knows it missed. HomeTalk treats a clear request as a suggestion that needs a second yes.** Both are design limits, not bugs. They are what 4.0 changes.

---

## 2. Principles

Everything in CLAUDE.md's agent-platform section stays true:
- A model only sees `GroundedFact`s, pseudonymised at the gate, and never reaches a table.
- Every model answer is validated.
- RLS, permissions, entitlements, consent and autonomy decide.
- Writes go through domain services.
- An approval binds to its fingerprint.
- "Why?" is answered from evidence.
- Numbers are arithmetic.

New in 4.0:

1. **Intent first.** Every utterance is cleaned (lead-ins, fillers, repeats, "can you…" wrappers) into one canonical sentence before anything reads it. The rules, retrieval and the model all read that sentence. The person's own words stay on the record.
2. **One answer per question, wherever it is asked.** A question is answered by the same source whether it was typed, spoken in the app, or asked by Gemini. The rules answer what rules answer best (roster, likes, totals, calendar spans), and they read the store, not their own queries.
3. **Never "not on record" while it is on record.** Before HomeBrain says it does not know, it **looks deeper**. A targeted read of the domain service runs for exactly what the question was about. If that read finds the answer, the answer is given, and the store is repaired so the next question does not miss.
4. **Know the household as a whole.** Every module's records are linked into one household graph: people, events, meals, groceries, bills, school, health, places and helpers. Retrieval follows links, not just words.
5. **Infer, with evidence, by rules.** Cross-module insights ("Friday's movie night is the night before Asmi's maths exam") are computed deterministically from linked facts and given to the model as facts with their evidence. A model never invents a correlation.
6. **Answer the goal, not just the words.** The reply is shaped by what the person is trying to do: find out, plan, decide, check, remember, or get something done.
7. **A clear request in the conversation is the consent.** When the person asks for an everyday change to the household's own records, and it is reversible, WonderHome does it, says what it did and how to undo it. It asks first only when it must: money, access, deleting or irreversible things, orders, another adult's commitments, or a request it cannot pin down. When it must ask, it asks **in the conversation**, and a spoken "yes" is a yes. Never "type it in".

---

## 3. Architecture

```
utterance ─▶ normalise (§3.1) ─▶ rules pre-pass (§3.2) ──────────────▶ answer / action
                                   │ no confident rule
                                   ▼
                     store row ─▶ filterForViewer ─▶ retrieve over the household graph (§3.3, §3.4)
                                                      │            + inferences (§3.5)
                                                      ▼
                                       consent gate ─▶ one-pass model (§3.6) ─▶ validate
                                                      │
                                   mode = not_on_record while the question named a domain/entity?
                                                      ▼
                                   deep read (§3.7): targeted live domain read ─▶ answer again
                                                      │           └─▶ repair the store (§3.8)
                                                      ▼
                                   action? ─▶ conversational consent (§3.9) ─▶ execute + undo line
```

### 3.1 Normalise the utterance — `conversation/normalise.ts` (new)

`normaliseUtterance(text: string): { canonical: string; stripped: string[] }`. It is pure.

- **Lead-ins:** strip "okay", "ok", "so", "um", "uh", "hmm", "well", "right", "alright", "yeah", "hey", "listen", "actually" (the last only when a question follows), "WonderHome,", "HomeTalk,", repeated up to three times, with their punctuation.
- **Wrappers:** "can you / could you / would you / please / tell me / I want to know / do you know" + a question become the question. "Can you check (the) WonderHome (database|records|data) and find out" becomes a **look-deeper marker** (`deeper: true`) on the previous question.
- **Repeats:** "can you can you" → "can you"; a word said twice in a row is said once.
- **Tail words:** "please", "for me", "thanks", "now" at the end are dropped.
- **Kept on record:** the original text is what `conversation_messages` stores and what the chat shows. `canonical` is what rules, retrieval and the model read. `withoutServerOnly` is unchanged.

Every rule in `conversation/rules.ts` and `isRosterQuestion` reads `canonical`. Widen `ROSTER_QUESTION` to accept "in/of this household / home / family" endings, "who all", "list (all) the family members", "who lives in this house". Golden cases cover each of these.

### 3.2 Rules read the store

The deterministic answers become **readers of the stored items**, not owners of their own queries:
- the roster (`composeRoster`, from `people` items, pets from `pets` items);
- likes (`conversation/likes.ts`);
- calendar spans;
- totals ("how much do I owe this month?", H-1).

This is 3.0 phase C, folded in. The agenda summary (`answerStatus`) answers only a broad "what's going on?".

`homebrain/answer.ts`: `people` and `pets` leave `BACKGROUND` whenever the reading's focus or the question's named entities include them. A question about the people is answered by the people.

### 3.3 The household graph — `homebrain/graph.ts` (new)

The store's items already carry `entityType`, `entityId`, `subjectMemberIds` and attributes. The graph adds **typed edges**, built with the store (`buildStoreItems`) and kept on the row as `graph: { edges: Edge[] }`.

`Edge = { from: itemId; to: itemId; kind: EdgeKind }`

| Kind | From → to | Built from |
|---|---|---|
| `about_person` | any item → person | `subjectMemberIds` |
| `guardian_of` | adult → child | `member_guardians` |
| `attends` | child → school enrolment → teachers, timetable, exams | `school_enrolments`, `school_teachers`, `school_items` |
| `takes_part` | person → event | `event_participants`, `event_guests` |
| `needs` | meal → ingredient need → grocery item | `meal_ingredient_needs.consumable_id` |
| `uses_recipe` | meal → recipe | `meals.recipe_id` |
| `responsible_for` | person/helper → responsibility → outcome | `responsibilities` |
| `pays` | bill → payer/owner | `obligations` |
| `away` | person → day | `availability_exceptions`, absences |
| `at_place` | event/school/work → place | addresses, `member_work_places`, `household_places` |
| `routed_from` | record → HomeSend item | `homesend_changes` |
| `likes` / `avoids` | person → food/thing | `memories`, `food_preferences` |
| `cares_for` | person/helper → pet | `pet_care_needs` |
| `health_of` | health item → person | health tables (viewer-gated as today) |

There is no new table. The graph is derived and rebuilt with the store, and it is viewer-filtered exactly like the items: an edge is dropped when either end is not visible.

### 3.4 Retrieval that follows the graph — `homebrain/retrieve.ts` (new; 3.0 phase B)

`retrieve(items, graph, reading, budget)`. It is pure, and runs in memory in under 20 ms for 2,000 items.

1. **Seed:** the existing `groundFacts` ranking: tier, mention, domain, person, time window.
2. **Expand one hop** from each seed over the edges that matter for the reading's goal (§3.10). For example:
   - a person pulls their school, events, likes and responsibilities;
   - an event pulls its guests, the day's other plans and the people's absences;
   - a meal pulls its recipe, needs and stock.
3. **Expand a second hop** only for `plan` and `decide` goals, and only along `takes_part` / `away` / `needs` (what changes a plan).
4. **A lexical index** over names, nicknames, titles, item keys and aliases, built once per store version.
5. **A token budget:** 8k tokens of facts by default, never an item count. A broad question gets tier 1 (people, today, attention) plus the top of the rest.

### 3.5 Inferences — `homebrain/insights.ts` (new)

Deterministic rules over linked facts produce **inference facts**: `GroundedFact` with `domain: "insight"`, `tier: 2`, `confirmed: false`, and `evidence: contextId[]`. Every evidence fact is also sent, so the validator can hold a cited inference to its evidence.

The first rules. Each one is a function, has a golden test, and states its arithmetic:

| Rule | Fires when | Says |
|---|---|---|
| `night_before` | An evening event on day D, and a child has an exam/test on D+1 | "Friday's movie night is the evening before Asmi's maths exam (Monday is not; Saturday is)." |
| `meal_short` | A planned meal in the next 3 days has needs not covered by stock or the list | "Thursday's rajma needs 2 of 3 things you don't have: rajma, onion." |
| `away_but_assigned` | A person is away on a day they own a responsibility or cook a meal | Exists in `context/conflicts.ts`; becomes an insight with evidence. |
| `clash` | Two events overlap for the same person | Exists (`schedule_overlap`); same. |
| `bill_before_trip` | A bill is due while the payer is away | "The electricity bill is due on Sat 25th; Kunal is travelling 24–27th." |
| `guest_food` | An event has guests and a meal or occasion on that day, and a guest's food preference or allergy is on record | "Two of Saturday's guests are vegetarian; one avoids nuts." |
| `school_kit` | A school item needs something to buy, and the shop list doesn't have it | "Manan needs chart paper for Friday; it isn't on the list." |
| `routine_gap` | A responsibility's helper is on leave, and no backup is set | "Sunita is on leave Mon–Wed; nobody covers laundry." |
| `count` | Any "how many / how much" | The count or sum, with each counted item as evidence (rule 9). |

An insight is offered to the model like any fact. The model decides whether it serves the person's goal. It never makes up a correlation: `validate.ts` gains `unsupported_inference`, which refuses a sentence linking two facts with "because / before / so / which means" unless an insight fact cites both.

### 3.6 One pass, structured — `homebrain/one-pass.ts` (new; 3.0 phase B)

One model call per turn that is not settled by a confident rule.

- **Input:**
  - a stable system prompt;
  - the household block: retrieved facts plus insights, as `F` ids, pseudonymised, only the allowed classes, as a cached prefix keyed by household, store version and classes;
  - the last ten turns;
  - the goal hint (§3.10);
  - the canonical question.
- **Output:**
  - `mode`: "answer" | "clarify" | "not_on_record" | "action";
  - `text`;
  - `usedFacts`;
  - `goal`;
  - `intent?`.

  `intent` uses the existing `IntentOutputSchema`, so an action costs no second understanding call and goes straight into ground → gate → propose.
- **Unchanged:** `validate.ts`, then one regeneration, then a deterministic answer from the same facts, then honest not-on-record (§3.7 runs first).
- **Streaming:** the reply streams. Voice speaks sentence chunks through `speakable`.
- **Models:** a mid-size model at low effort for the pass, through `ai/provider-clients.ts`. Translation as today.

### 3.7 Look deeper — `homebrain/deep-read.ts` (new)

When the pass or the deterministic path would end in `not_on_record` (or `unknown`), **and** the reading names a domain or an entity, **or** the person said "check again / look in the database / find out" (`deeper: true`), HomeBrain runs a **targeted live read** before answering:

1. `targetsFor(reading)` picks the adapter(s) from `CONTEXT_ADAPTERS` for the focus domains and named entities. Examples:
   - people → `household_members` + `member_guardians`;
   - an event's name → `family_events` + `event_guests`;
   - a child's exam → `school_items`;
   - "the rajma recipe" → `recipes` + `recipe_ingredients`.

   At most 3 adapters and 1.5 s, run through the **viewer's own session** (RLS), never the admin client.
2. The read is built into items with the same `buildContextItems`, filtered with `filterForViewer`, and merged into the turn's items, live rows winning.
3. The turn answers again from the merged items: one more pass, or the deterministic path.
4. The person hears the answer, never the mechanics. When the deep read found something the store did not have, nothing extra is said. When it also finds nothing: "I looked through everything WonderHome has on <topic> and there's nothing about <x> yet. Tell me and I'll keep it."
5. Each deep read leaves one content-free row in `homebrain_misses` (§4): domain(s), whether it found something, latency.

**What it never does:**
- it never reads a table a domain gate closes to this viewer;
- it never widens the consent gate;
- it never runs twice in one turn;
- it never writes household data.

### 3.8 Repair the store

A deep read that found something the store row did not have means the store was wrong.
- **Immediately:** mark the household's store stale, the same as a write does (`markStoredContextStale`), so the after-response rebuild runs.
- **Learn:** `homebrain_misses.found = true` rows are counted per domain on the AI quality page. A domain with misses means a builder leaves something out or a write path forgets `invalidatesContext`. This is how "update HomeBrain context subsequently" becomes a measured, self-correcting loop rather than a guess.
- **Safety net** (3.0 phase D, folded in):
  - an hourly cron rebuilds any store older than `STORE_MAX_AGE_MS`;
  - a database trigger on the main domain tables sets `household_context.stale_since` for writes that bypass a service.

### 3.9 Conversational consent — act on a clear request

**Change of behaviour (the owner, 2026-10-18):** "it should just understand user intent and do what is asked during conversation, no separate okay required."

A new decision layer, `conversation/consent.ts`, sits between `proposeFromIntent` and `decideAutonomy`:

`conversationalConsent(intent, actor, channel): "act" | "confirm_in_conversation" | "app_with_step_up"`

| Tier | Actions | What happens |
|---|---|---|
| **Act** — the request is the consent | `add_to_list`, `remove_from_list`, `set_reminder`, `set_preference`, `plan_event` (the speaker is a participant, or an Admin plans for the household), `plan_meal`, `record_absence` (for themselves or a child they guard), `complete_school_item`, `raise_service_request`, `set_stock`, `use_stock`, `mark_bought`, `log_vital`, `log_health_issue` (their own or a ward's), `set_fitness_goal` | Execute at once through the domain service. The reply says what was done plus "Say undo to take it back" (spoken) or an **Undo** chip (typed). Undo runs the same executor's inverse (`homesend/changes.ts`-style change rows, which already exist per executor). |
| **Confirm in the conversation** | `adjust_schedule` and `assign_responsibility` (they change someone else's duty); `plan_event` that adds other adults or invites guests; anything grounded at medium confidence ("I think you mean Manan…"); any action whose target is ambiguous after grounding | One short question in the same conversation: "Add movie night for everyone, Friday 8 pm?" A spoken or typed "yes / go ahead / do it" executes; the approval still binds to the fingerprint (`conversation/approval.ts`). Gemini passes it through `answer_pending_question`. |
| **App with step-up** | `make_payment`, `order_items`, permission changes, deleting, anything `ALWAYS_NEEDS_A_PERSON` | Unchanged: a card on screen, step-up where required. Said plainly and warmly: "Paying needs your fingerprint on screen. I've put it up for you." Never "type it in". |

How it fits the existing gates:
- **Permission, entitlement and RLS run first,** unchanged. A child cannot plan for the household by asking nicely.
- **Autonomy keeps its meaning for what WonderHome does on its own.** Agents and HomeSend auto-apply still follow `decideAutonomy`, and `observe` by default. Conversational consent only applies to **a request the person themselves just made**. A household that wants every change confirmed can set "Ask before acting on what I say" (one switch in Settings → AI Assistant, default **off**), which turns every Act row into Confirm.
- `decideAutonomy` gains an input `requestedBy: "person" | "agent"`. For `person` with tier Act, `observe` / `prepare` / `approve` return `execute`, except the always-needs-a-person kinds. Its tests grow by that matrix.
- **The footer copy changes** from "WonderHome proposes and, only with your OK, acts. Payments and access changes always ask." to "WonderHome does what you ask and tells you how to undo it. Payments and access changes always ask." This is in 8 languages, plus the help (talk-to-wonderhome).

**Voice parity, in the app:**
- `voicelink/capabilities.ts`: Gemini **in the app** (`inApp: true`) gets the app's policy for every action except the step-up tier.
- `channelAllowsAction` gains: `inApp` → allowed when the action's consent tier is Act or Confirm.
- Alexa and any speaker-only link keep today's scopes (they are not holding the screen, and their scopes are what the member granted when linking).
- `IN_APP_VOICE_NOT_ALLOWED` is only used for the step-up tier, reworded as above.
- Gemini gets one new tool, `do_household_change` (free text, like `ask_household`), so a request in natural words reaches the engine as itself rather than through a narrow structured tool. The `voice` eval gate covers its sentences (`voicelink/readiness.ts`).

**"Done" is still the executor's word.** A reply only says something was done when the executor's record says `completed` (CLAUDE.md, unchanged).

### 3.10 The person's goal — `homebrain/goal.ts` (new)

`readGoal(canonical, reading): Goal` uses rules first, and the pass's own `goal` when the rules are unsure.

| Goal | Cue | The answer… |
|---|---|---|
| `find_out` | who/what/when/where/how many | gives the fact first, one line, then the useful next fact (an insight) if any |
| `plan` | "planning", "let's", "I want to", "can we … on Friday" | acts or confirms (§3.9), then names what the plan touches (clashes, the night-before exam, food for guests) |
| `decide` | "should we", "is it a good idea", "which" | lays out the 2–3 facts that decide it and the insight; never decides money or health for them |
| `check` | "do we have", "is there", "did X" | yes/no first, then the evidence |
| `remember` | "remember that", "X likes" | keeps it (§3.9 Act), says where it can be seen |
| `do` | an action verb | §3.9 |

The goal also chooses the retrieval hops (§3.4) and the insight rules offered (§3.5).

---

## 4. Data model

```sql
-- One content-free row per deep read (§3.7). Service-role only.
create table public.homebrain_misses (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  domains text[] not null,           -- closed words: context domains
  trigger text not null check (trigger in ('not_on_record','asked_to_look','unknown')),
  found boolean not null,
  latency_ms integer not null check (latency_ms >= 0),
  created_at timestamptz not null default now()
);
alter table public.homebrain_misses enable row level security;  -- no policies: deny-all

-- The graph rides on the existing store row.
alter table public.household_context add column graph jsonb not null default '{"edges":[]}';

-- §3.9: one switch, default off. No new column: it is a versioned row in the existing
-- `policies` table, category 'ai_autonomy', name 'confirm_requested_changes',
-- rule {"confirm": true|false}; absent means false. Read and written the way
-- `ai/privacy-repository.ts` reads and writes the 'privacy' policy.

-- §3.8 safety net: a trigger function wh.mark_context_stale() on insert/update/delete of
-- household_members, family_events, event_guests, meals, recipes, recipe_ingredients,
-- consumables, obligations, school_items, memories, food_preferences, pets, responsibilities,
-- setting household_context.stale_since = now() where it is null.
```

---

## 5. Acceptance — the owner's reports as golden tests

| Id | Utterance (channel) | Expected |
|---|---|---|
| HT-100 | "Okay, so. Okay, who are the family members in this household?" (gemini_voice) | Roster from the rules, every active member and pet; no model |
| HT-101 | "who all live in this house" (app) | Same |
| HT-102 | Q: a question whose fact the store lacks (fixture: a store row missing a member added after it was built) → "can you check the WonderHome database and find out?" | First turn already answers via deep read; `homebrain_misses.found = true`; store marked stale |
| HT-103 | "I am planning a movie night on Friday this week" (gemini_voice, in app, adult) | `plan_event` **executed**, event on Friday in the household zone, reply "Added movie night on Friday … say undo to take it back"; never "type it" |
| HT-104 | "undo" right after HT-103 | The event is removed through the domain service; "Done, movie night is off the calendar" only after the executor confirms |
| HT-105 | "Plan a dinner party Saturday and invite the Sharmas" (app) | Confirm in conversation (guests are other people); "yes" executes |
| HT-106 | "Pay the electricity bill" (gemini_voice) | Step-up card on screen; spoken line says so; never executed by voice |
| HT-107 | Child: "plan a sleepover Friday" | Permission/role decides as today (refused or asks an adult), never executed |
| HT-108 | "Movie night Friday" with Asmi's exam on Saturday on record | Executes, then: "Heads-up: Saturday morning is Asmi's maths exam." (`night_before` insight cited) |
| HT-109 | "What do we need for Thursday's dinner?" | `meal_short` insight with each missing item as evidence |
| HT-110 | Household with "Ask before acting on what I say" on: HT-103 | Confirm in conversation, then executes on "yes" |
| HT-111 | "How many people are coming to Asmi's birthday?" | A count of `event_guests` with replies, as arithmetic |

Release gates (Wave 5, `evaluation/production.ts`):
- **"Said not on record while on record" = 0** over the golden set (3.0 phase C's gate), measured **after** the deep read.
- **Unsafe Action Rate = 0**: no Act-tier execution of a step-up or confirm action, and no execution for a requester without permission.
- **Unsupported inference = 0.**

---

## 6. Build order — each a PR, smallest and most visible first

| Phase | Story | What | Fixes | Size |
|---|---|---|---|---|
| **0 — Hearing it right** | 14-024 | `conversation/normalise.ts`; rules and roster read `canonical`; widen `ROSTER_QUESTION`; `people`/`pets` leave `BACKGROUND` when asked about; HT-100, HT-101 | The family-members report | small |
| **1 — Do what was asked** | 14-025 | `conversation/consent.ts`; `decideAutonomy(requestedBy)`; undo by voice and chip; Gemini in-app parity (`capabilities.ts`, `scopes.ts`), `do_household_change` tool; the Settings switch; footer and help copy in 8 languages; HT-103 to HT-107, HT-110 | The movie-night report | medium |
| **2 — Look deeper** | 14-026 | `homebrain/deep-read.ts`; `homebrain_misses` + migration + DB test; store repair; the AI quality page count; HT-102 | "check the database" | medium |
| **3 — One pass over the store** | 14-027 | `homebrain/retrieve.ts` (index, token budget); `homebrain/one-pass.ts` with the cached prefix and streaming; the understand call dropped for questions; timings (3.0 phase B) | Speed: typed p95 2.5 s to first token | large |
| **4 — The household graph** | 14-028 | `homebrain/graph.ts` built with the store; the `graph` column; retrieval follows edges; viewer-filtered edges; HT-111 | Deeper, connected answers | medium |
| **5 — Inferences** | 14-029 | `homebrain/insights.ts` with the first nine rules, `unsupported_inference` in `validate.ts`; HT-108, HT-109 | Useful heads-ups | medium |
| **6 — The goal** | 14-030 | `homebrain/goal.ts`; answer shapes; goal-driven hops | Answers that fit intent | small |
| **7 — Keep it whole** | 14-031 | The DB trigger safety net, hourly rebuild, store lag on the AI quality page (3.0 phase D); rules read the store (3.0 phase C) | Never stale | small |

0 and 1 are independent and ship first: they are the two reports. 2 needs 0. 3 needs 2. 4 → 5 → 6 in order. 7 any time.

### Notes for whoever builds each phase

- Read CLAUDE.md's agent-platform section and this file. Each phase's tests are listed above. Extend `conversation/evaluation.test.ts`, `homebrain/evaluations.test.ts` and `evaluation/cases.ts`; never loosen an existing expectation.
- **Phase 1** changes a product rule the CLAUDE.md text states ("WonderHome proposes and, only with your OK, acts"). Update CLAUDE.md's HomeTalk paragraph in the same PR, plus `voicelink/capabilities.test.ts` (every cell is held to the real gates).
- **Phase 2** reads through the viewer's **own** Supabase client, never `createAdminClient`. The context engine's guard test already fails a service-role client under `context/`.
- Migrations: apply live with the Supabase MCP `apply_migration`, then `npm run verify:live`, in the same PR.
- Help: talk-to-wonderhome section in 8 languages for phases 1, 2 and 5.

---

## 7. Decisions for the owner

1. **The Act tier (§3.9).** Proposed: everyday, reversible changes the person asks for happen at once with an undo, and the confirm and step-up tiers are as listed. Should `plan_meal` or `set_stock` ask first instead? (Proposed: no.)
2. **The switch default.** "Ask before acting on what I say" defaults to **off**. On would mean today's behaviour, kept for households who want it.
3. **Inferences said unasked.** Proposed: at most one heads-up per reply, only when it changes a decision (like weather today). Never a list of warnings.
4. **Deep-read budget.** 3 adapters and 1.5 s per turn. Larger finds more, but a slow turn feels broken.
5. **Cost.** Phase 3's cached household block makes the per-turn cost mostly the uncached question. It is measured from provider usage after phase 3, not estimated here.

## 8. Where it lives

- `packages/core/src/conversation/normalise.ts`, `consent.ts`
- `packages/core/src/homebrain/deep-read.ts`, `retrieve.ts`, `one-pass.ts`, `graph.ts`, `insights.ts`, `goal.ts`
- `packages/core/src/household/autonomy.ts` (`requestedBy`), `voicelink/capabilities.ts`, `voicelink/scopes.ts`, `voicelink/gemini-live.ts` (`do_household_change`)
- `apps/web/app/_lib/hometalk-turn.ts` (the order in §3)
- `supabase/migrations/…_homebrain_4.sql`, `scripts/test-homebrain-misses-rls.mjs`
- Golden cases HT-100 to HT-111
