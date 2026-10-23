# The household record index, Phase 1 (14-036)

## Why
The owner added Asmi's classes, asked HomeTalk about them, and it didn't know. The classes were one table; the real cause was the design. A table reached HomeBrain only if someone hand-wrote an adapter and a builder for it, and nothing made that happen when a feature shipped.

Measured against the live database:
- 22 of the 75 tables holding household records were never read by HomeBrain.
- 41 tables HomeBrain did read had no stale trigger, so a write could go unnoticed by the stored context.

The owner approved the redesign: one registry first, written-at-save facts and one projection later.

## What was done
- **`packages/core/src/knowledge/registry.ts`** names every one of the 168 household tables:
  - 55 are read by a hand-written builder, naming their `ContextRecords` list, checked by the compiler;
  - 20 are read by the new generic describer;
  - 93 are excluded with a reason: credentials, settings, telemetry, change logs and FamilyChat, which is private between members.
- **`packages/core/src/knowledge/describe.ts`** reads each registry table bounded, through the viewer's own session. It turns every row into a fact through the same `buildContextItems`, keeping privacy class, health scope and people.
  - One adapter per domain is gated like that domain's own (`CONTEXT_ADAPTERS`).
  - The store reads them too.
  - `mergeRecords` keeps every adapter's tables.
- **Newly known (the 20 registry tables):**
  - kids: child goals and check-ins, study sessions, school documents, teachers;
  - people: weekly availability, offices, helper profiles;
  - food and money: weekly meal templates, budgets, order lines, purchases;
  - home: gift plans, appliance services, backup services, routines;
  - calendar: a repeating event's moved or cancelled day;
  - health: report readings, measurement routines, workouts.
- **`npm run lint:knowledge`** (`scripts/lint-knowledge-registry.mjs`, now a CI step) fails when:
  - a migration's household table is not in the registry;
  - an entry names no real table;
  - a table read as knowledge lacks `wh.mark_context_stale`.
- **Triggers:** `20261023180000_knowledge_registry_stale.sql` adds the trigger to the last 16 tables, after `20261023160000` added 25. Both are applied live, with their versions recorded.
- **Spec:** `design/HOUSEHOLD-RECORD-INDEX.md`. CLAUDE.md now carries the rule. Phases 2–4 are queued as 14-037 to 14-039 in `backlogs/14-AI-Orchestration-and-Learning.md`.

## Verified
- `tsc` for core and web: clean.
- `knowledge/registry.test.ts`: 69 tests, generated from each registry entry's example row, plus the lint and the merge.
- Context, homebrain, knowledge, evaluation, conversation and calendar suites: 1150 tests pass.
- `npm run eval`: 159/159 (new HT-141, "Who is Asmi's class teacher?", from a table no builder reads); unsafe actions 0/19.
- `lint:knowledge`, `lint:migrations` and `lint:boundaries` pass.
- Every one of the 20 registry selects ran against the live database without error (counts only; no data printed). Two embeds that named the wrong columns were caught and fixed this way.

## Still open
- Phase 2 (14-037): `household_facts` and an outbox, so facts are written at save time rather than by rebuilding the whole snapshot.
- Phase 3 (14-038): the Calendar and HomeTalk reading one projection.
- Phase 4 (14-039): structure-first retrieval and coverage-miss telemetry.
- Per-row child privacy is still the domain's existing rule: RLS on live reads, `school.manage` for stored school items.

## Where
- `packages/core/src/knowledge/`
- `packages/core/src/context/repository.ts` (registry adapters, `mergeRecords`)
- `packages/core/src/context/builders.ts`
- `packages/core/src/homebrain/context-store.ts`
- `scripts/lint-knowledge-registry.mjs`
- `.github/workflows/ci.yml`
- `supabase/migrations/20261023180000_knowledge_registry_stale.sql`
