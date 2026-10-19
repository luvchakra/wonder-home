# HomeBrain Sleep (HomeBrain 5.0) and household understanding that counts the household

**Date:** 2026-10-19 · **Asked by:** the owner. The request was to research how the brain works (prefrontal cortex, limbic system, hypothalamus, memory, sleep) and build the same for HomeBrain:
- automatic, with review only for contradictions;
- kept to a minimum on screen;
- fast for HomeTalk;
- using the model where it is best;
- connecting people, relationships, responsibilities and the calendar.

The owner decided the four open questions:
- apply automatically, shown under Learned;
- use the model wherever it is best;
- use pgvector embeddings;
- let unused notes fade to resting.

A second report from the owner came mid-build: a screenshot of "Household understanding" showing 0/0 for every category but Lifestyle.

## The brain, mapped

| Brain | HomeBrain | Where |
|---|---|---|
| Hippocampus: records the day fast | `memories`, written by `remember()` | unchanged |
| Amygdala: tags what matters | `memories.salience` (0–3), set on write and again each night | `sleep/salience.ts` |
| Sleep, slow-wave: replay, merge, consolidate | the nightly plan (`planSleep`) | `sleep/consolidate.ts`, `sleep/run.ts` |
| Synaptic downscaling: what is unused fades | `tier = resting` after 90 days unused. Never for salience 3 | `consolidate.ts` |
| Neocortex schemas | a person at a glance, built per turn | `sleep/profiles.ts` |
| REM: links distant memories | `homebrain_links`, followed by the graph as `associated` | `sleep/links.ts`, `graph.ts` |
| Recall strengthens | `homebrain_recall`, counted after each answer | `sleep/recall.ts` |
| Meaning, not just words | pgvector embeddings | `sleep/embeddings.ts` |
| Prefrontal cortex: goal, inhibition | unchanged: `goal.ts`, the retrieval budget, `validate.ts` | — |
| Hypothalamus: the body clock | 2–5 am on each household's own clock, on the delivery tick | `sleepDueHouseholds` |
| Reconsolidation | a contradiction goes to Needs review, and every change has Undo | `undo.ts` |

## What was built

### The night (`homebrain/sleep/run.ts`)

Each household sleeps once per local day, between 2 and 5 am on its own clock. The five-minute delivery tick runs it after its response (`dispatch/route.ts`, `after()`).

One night does the following, in order:
1. Rebuilds the store.
2. Refreshes embeddings.
3. Plans (`planSleep`, pure).
4. Lets the model judge the close pairs and read the sentences the rules could not, then plans again.
5. Applies each change with what it was before (`homebrain_consolidations.detail`).
6. Links records across the home: rules first, then the model's proposals, checked.
7. Records the run.

What the plan does:
- **Lets go** of a note that says nothing, and of one whose time has passed ("this week", "tomorrow").
- **Merges** the same person–stance–thing kept twice into the best-kept note.
- **Splits** a sentence about several people. "Kunal likes North Indian food; Upasna likes Italian and French food" is three facts, and only the new ones are written. "Upasna" resolves to Upasana; a name two members could fit is left alone.
- **Keeps "mac and cheese" whole.** A thing joined by "and" is split only when every part is already known on its own.
- **Files** a household note under the family member it names.
- **Sends contradictions to a person.** The same thing liked and disliked goes to Needs review. This is the only thing that asks anyone.
- **Merges by meaning only when near-identical** (cosine 0.985). A real night scored "sushi" and "sushi rolls" above 0.95, so anything short of near-identical is the model's call.
- **Rests** an everyday note unused for 90 days. It wakes when it is used. Salience 3 never rests or expires.

### Model and meaning (`sleep-model.ts`, `embeddings.ts`)

- The model's answers are checked before use:
  - a verdict must name a pair it was shown;
  - a reading must name a person it was shown and use the sentence's own words;
  - a link must join two records it was shown, of a known kind, across parts of the home.
- Names never leave: every family name becomes "someone". Model links get the person's name back for display.
- Embeddings use the household's own Google or OpenAI key, else its Gemini key, else the platform key. They cover only the content classes the data-use policy allows.
- The vectors are 768-dimensional and compared exactly per household by `match_homebrain_embeddings` (service role).

### On a turn

- **Meaning.** `meaningForTurn` starts alongside the context read. It gets at most 900 ms, and is awaited only when grounding needs it. A record close in meaning is lifted ("close in meaning to the question"), and is never allowed to override the person or the part of the home the question named.
- **Profiles.** A person at a glance is offered beside the facts. It leads when the question is about the person, and then the facts it already says step back.
- **New rule.** "What do you know about Asmi?" was read as unknown before. It now reaches HomeBrain, profile first (golden HT-117).
- **Recall.** The memories an answer used are counted after the response. They are kept apart from `memories`, so a turn never marks the store stale.
- **Spoken lists fit.** `speechFrom` now reads a heading and its bullets as one sentence: "Asmi likes Indian food, pasta, pink pasta, pizza and garlic bread; doesn't like Assamese food." This was the root of the earlier "only Asmi's preferences" report: voice used to run out after the first person.
- **Wording.** Memory summaries say "(registered)", and "checked 1 thing" is singular.

### Kept small on screen

There is one new section, inside the Learned tab and for Admins only:
- **While you slept:** the night's line, then each change with an Undo icon (accessible label).
- **Resting:** each note with Bring back.
- **Connections:** a count and a few examples.

Words are in all eight languages. Help ¶5 of HomeBrain is in all eight languages, with new keywords.

### Household understanding (05-011)

The panel counted only what was said in HomeTalk, so a household with every member, relationship, bill and enrolment on record read 0/0. It now adds each category's own records. One wave through the viewer's own access (`loadUnderstandingRecords`) counts:
- members, relationships and responsibilities;
- playbook items and policies;
- school enrolments;
- bills;
- food preferences and pets;
- allergies and medical restrictions, as Safety.

The ring and the count line use the same arithmetic (`withRecords`).

## Data

Migration `20261019160000_homebrain_sleep.sql` is additive and applied live:
- **`memories` columns:** `salience`, `tier`, `valid_until`, `merged_into`, plus indexes.
- **Admin-read tables:** `homebrain_runs`, `homebrain_consolidations` and `homebrain_links` (set-based RLS, Admin read only).
- **Deny-all tables:** `homebrain_recall` and `homebrain_embeddings`.
- **Functions:** `homebrain_recalled` and `match_homebrain_embeddings` (service role only).
- **Trigger:** a new link marks the store stale.
- **pgvector:** the vector parts apply only where pgvector exists. CI now installs it, so that path is tested.

## Verified

- **Unit:** the sleep suite has 27 tests (consolidation on the owner's real pattern, splitting, resolving, conflicts, meaning thresholds, time, rest and wake, salience, links, the graph, profiles, names, speech). Certification record counts are tested too. `npm test` passes 3644+.
- **Database:** `test-homebrain-sleep-rls.mjs` passes 7/7, including the pgvector match and household isolation. `test:db` passes 681/681.
- **Eval:** 134/134, with HT-117 new. Unsafe actions are 0/18 and the voice gate passes.
- **Live:** applied through the Supabase MCP. `verify:live` passes 317/317, including 12 new checks.
- **Two real nights on a QA household** against the live project, with the QA Google key:
  - **First night:** 16 records embedded. The model judged 10 pairs. Two merges were made, the two-person sentence was split (all parts already known, nothing rewritten), the empty note was let go, an old note was rested, and two model links were made.
  - **Rules tightened after the first night:** this is where the "sushi" pair showed the merge bar had to rise, the rule link was missed, and the model's links read "Someone".
  - **Second night:** nothing new was changed. The sushi pair went to the model, which kept it apart. The rule link read "Kunal likes dal makhani; Dal makhani is planned for 2026-10-21", and the model link had Kunal's name back.
  - **Embeddings:** the vectors for retired notes were removed.
- **Browser, at 360px:**
  - Learned → While you slept listed four changes, Resting and Connections.
  - Undo on the sushi merge put both notes back.
  - Household understanding read Family & roles 3/3 for a QA family with two members and a relationship.
  - There was no sideways scroll and no page errors.
- **HomeTalk on a production build:** "What do you know about Kunal?" answered with his likes and "husband of Upasana". "Is there anything Kunal would enjoy this week?" connected his liking with the planned dal makhani. "What does the family like to eat?" listed everyone.
- **Turn times on that build:** about 4 s, including a Gemini call; 12 s for the first turn, which also rebuilt the store.

## Notes and what is open

- **Stale wording until deploy:** until this deploys, the live app's keep-warm rebuilds stores with the old builders, so "(confirmed)" can still appear in a stored context. It goes away with the deploy.
- **The owner's household:** it sleeps for the first time on the first night after deploy, between 2 and 5 am IST. Its assistant key is Anthropic, which has no embeddings, so meaning uses its Gemini key. A child's notes (Asmi's) stay out of the model and embeddings unless the household's data-use settings allow the child class; the rules still tidy them.
- **Turn speed:** turn speed with the model is the provider's. The HomeBrain parts added here are bounded (900 ms for meaning) or run after the response.

## Where the code lives

- `packages/core/src/homebrain/sleep/`: `salience`, `similarity`, `consolidate` (+test), `links`, `profiles` (+`links-profiles.test`), `embeddings`, `sleep-model`, `run`, `undo`, `recall`.
- `homebrain/{grounding,graph,turn,context-store,answer}.ts`, `context/{builders,repository}.ts`, `conversation/{repository,rules}.ts`, `hometalk/contract.ts`.
- `household/{certification,setup-repository}.ts`.
- `apps/web/app/certification/{page,sleep-section,sleep-undo}.tsx`, `(auth)/homebrain-sleep-actions.ts`, `_lib/hometalk-turn.ts`, `api/v1/notifications/dispatch/route.ts`.
- `supabase/migrations/20261019160000_homebrain_sleep.sql`, `scripts/test-homebrain-sleep-rls.mjs`, `scripts/verify-live-project.mjs`, `.github/workflows/ci.yml`.

## QA cleanup

Recorded after the merge. This build created:
- QA account `0da5a27b-e4b5-47a3-97d1-d3523b2557e5`;
- household `ecf0cb6f-c620-42ac-8705-605fb2131411` ("QA Sleep Home"), with its memories, links, runs, consolidations, embeddings and AI key row;
