# The household record index

**Status:** Phase 1 shipped (story 14-036, 2026-10-23). Phases 2–4 are stories 14-037 to 14-039.
**Owner's ask (2026-10-23):** "HomeTalk must know each and everything being added to WonderHome. But it seems that it doesn't know most of it. How can we ensure that this is better designed?"

## 1. The problem

HomeTalk only knew what a developer remembered to teach it. For a kind of record to reach HomeBrain, someone had to write two pieces of code by hand:
- a context adapter that reads the table (`context/repository.ts`);
- a builder that turns its rows into sentences (`context/builders.ts`).

Nothing made that happen when a feature shipped, so every new table started out invisible.

Measured on 2026-10-23 against the live database: of 75 tables holding household records, 22 had never been read by HomeTalk. They included:
- a child's goals and check-ins, study sessions, school documents and teachers;
- who is available when, office locations and helper profiles;
- weekly meal templates, budgets and what was in an order;
- moved or cancelled single occurrences of a repeating event;
- report readings, measurement routines and workouts.

Three more things made it worse:
- Each row became one hand-written sentence, so any field the sentence left out could never be asked about.
- Four places each kept their own list of what exists: the Calendar, HomeBrain's live reads, the stored context and "look deeper". They drifted apart.
- The stale trigger that keeps the stored context honest was only on the tables listed when it was first laid. Writes to 41 other tables HomeBrain read went unnoticed unless a service remembered to mark the context stale.

## 2. The principle

A record is part of WonderHome's knowledge the moment it is saved. Being invisible is a decision someone writes down, with a reason, and never the default.

## 3. Phase 1: the registry (shipped)

`packages/core/src/knowledge/registry.ts` names every household table exactly once, in one of three ways:

| Covered by | Meaning | Today |
|---|---|---|
| `builder` | A hand-written builder already reads it; `records` names the `ContextRecords` list, checked by the compiler. `live: true` means it is read fresh on every turn and never stored. | 55 tables |
| `registry` | No builder of its own. The generic describer (`knowledge/describe.ts`) reads it through the viewer's own session and says every field as a fact. | 20 tables |
| `excluded` | Not knowledge about the household (credentials, settings, telemetry, a change log, FamilyChat), with the reason. | 93 tables |

A `registry` entry carries everything needed to know a table:
- **Domain.** The read is gated exactly as that domain's own adapter is (`permitted`, `storedItemsForViewer`).
- **Privacy class**, plus a health row's own scope, which `filterForViewer` enforces.
- **A bounded select**: columns plus embeds, `activeOnly`, `since`, an order and a `limit`.
- **The people a row is about.**
- **A `describe` function**: title, summary, local day and aliases.
- **An `example` row.**

The generic adapters (one per domain, in `CONTEXT_ADAPTERS`) feed `records.registry`. The store reads them too, including the calendar and meals domains it otherwise reads specially. `mergeRecords` keeps every adapter's tables instead of overwriting them. The same `buildContextItems` turns them into facts, so retrieval, the consent gate, the validator and the evaluation treat them like any other fact.

### Enforcement

`npm run lint:knowledge` (`scripts/lint-knowledge-registry.mjs`) runs in CI. It fails when:
1. A migration creates a table with a `household_id` that the registry does not name.
2. The registry names a table no migration creates.
3. A table read as knowledge (`builder` or `registry`, not `live`) has no `wh.mark_context_stale` trigger.

Migrations `20261023160000_context_stale_everywhere` (25 tables) and `20261023180000_knowledge_registry_stale` (16 tables) close the trigger gap. Both are applied live.

### Tests that write themselves

`knowledge/registry.test.ts` runs every `registry` entry's `example` row through the describer and checks four things:
- it becomes a fact in the right domain, with its source;
- the summary has no `null`, `undefined`, doubled spaces or stray punctuation showing through;
- privacy and health scope are kept;
- every person it is about is named.

A new table is tested the moment it is registered.

The golden evaluation (`npm run eval`) has HT-141: "Who is Asmi's class teacher?" is answered from `school_teachers`, a table no builder reads.

## 4. Phase 2: facts written when records are written (14-037)

- A `household_facts` table holds one row per record, plus one per occurrence for repeating things. Each row carries:
  - the record's own fields, people, start and end times and privacy;
  - a search vector.
- It has deny-all RLS, like `household_context`.
- A generic trigger on every registered table queues `(table, id)` in a `knowledge_outbox`. A worker runs the registry's describer and upserts the fact within seconds, after the response.
- Before answering, a turn drains anything still queued for its household, so it never answers from data older than the last save.
- This replaces whole-snapshot rebuilds of `household_context`. The nightly sleep, "look deeper" and the evaluation move to it behind the 158-case evaluation gate.

## 5. Phase 3: one projection for the Calendar and HomeTalk (14-038)

- "What's on tomorrow / Saturday / next week" and "when is the next piano class" become one query: facts whose time overlaps the range, for people the asker may see.
- The Calendar screen reads the same facts. `calendar/modules.ts`' adapters become registry describers.
- `CALENDAR_SOURCE_RECORDS` and the separate source lists go away, because there is only one list.

## 6. Phase 4: structure first, and a signal from real use (14-039)

- A question is read into filters by deterministic code: a time range, people, a kind of thing. Facts are fetched by those filters before words and meaning rank them.
- List questions get the whole matching set, never the top 12.
- When an answer says "nothing on record", the index is searched by words. A hit is a coverage miss, logged with the table name and nothing else.

## 7. What a new feature does now

1. **Add the table's migration** with the `wh.mark_context_stale` trigger.
2. **Add the table to `knowledge/registry.ts`:**
   - as `registry`, with a domain, privacy, a bounded select, `describe` and an example row;
   - or as `builder`, naming the records list a builder already reads;
   - or as `excluded`, with the reason.
3. **Run `npm run lint:knowledge` and the registry tests.** CI runs both.
