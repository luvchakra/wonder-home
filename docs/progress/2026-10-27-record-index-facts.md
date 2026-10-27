# Record index Phase 2, first part: facts written when records are written (14-037)

**Date:** 2026-10-27 · **Spec:** `design/HOUSEHOLD-RECORD-INDEX.md` §4 · **Follow-up:** 14-058

## What was done and why

The owner asked (2026-10-23) that HomeTalk know everything added to WonderHome. Phase 1 named every table. Phase 2 makes a record a fact the moment it is saved, instead of waiting for a whole-snapshot rebuild of `household_context`.

The story was too big for one PR, so it is split:
- **14-037 (this PR):** the 14 `registry` tables in stored domains.
- **14-058 (Not Started):** builder tables, retiring the snapshot, and "look deeper" and the evaluation on facts.

What 14-037 built:
- **Migration `20261027120000_household_facts`:**
  - `household_facts`: one fact per record, with its people, day, privacy, window end and a `tsvector`. Deny-all RLS.
  - `knowledge_outbox`: deny-all. It has no foreign key to `households`, so a household's cascading delete is never refused by its own queue.
  - `wh.queue_knowledge` on the 14 tables. A record written many times is queued once.
  - `claim_knowledge_outbox` / `finish_knowledge_outbox`, service role only. A claim lasts a minute. A record written again while held goes back to the queue. A failure is tried five times.
  - Every existing record is queued, so the first drains backfill.
- **`packages/core/src/knowledge/facts.ts`:** the worker. It reads each claimed record once with the service role and runs the registry's own describer. It upserts the fact, or deletes it when the record is gone, inactive or out of its window.
- **When it runs:**
  - after the response that wrote (`after()`, through the context write listener);
  - on the delivery clock, 300 per tick (`/api/v1/notifications/dispatch`);
  - before a turn, for its own household only (at most 100), in parallel with the stored-row read.
- **Store (`homebrain/context-store.ts`):**
  - Once `household_facts` exists, the rebuild skips the registry adapters.
  - The turn and the nightly sleep get the facts in their place (`withFacts`), through the same `storedItemsForViewer` and `filterForViewer`.
  - Without the table, everything reads as before, so the migration and the code are safe in either order.
  - The store's read interface is unchanged (14-027 reads it).
- **`npm run lint:knowledge`** now also fails when a registry table in a stored domain lacks the `wh.queue_knowledge` trigger.

People and health registry tables (helper profiles, availability, work places, readings, routines, workouts) stay read live for the person asking, so they have no stored facts.

## Verified

- Unit tests (`knowledge/facts.test.ts`, 13 tests):
  - a write yields a fact before the next turn;
  - an edit replaces it, and a delete or deactivation removes it;
  - a turn drains only its own household's queue;
  - the clock drains everyone;
  - a missing index is "unavailable", never an error;
  - facts keep the viewer's gates.
- The lint rule has its own test.
- `knowledge`, `homebrain` and `context` suites: 329 passing.
- `npm run test:db`: 772 pass, 0 fail. The new `scripts/test-household-facts-rls.mjs` checks:
  - a session write queues once;
  - no session (Admin included) reads, writes or claims either table;
  - claim and finish semantics, and five tries at most;
  - a delete queues the record;
  - a household delete is not refused, and its facts go with it.
- Other checks:
  - `lint:knowledge`, `lint:migrations` and the typecheck are clean.
  - `npm run build -w apps/web` passes, and so does `check:bundle`.
  - Deterministic evaluation: 208/208, 0 unsafe.
  - The full provider evaluation was not run: this container has no provider key.

## Performance

Measured locally (PostgreSQL 16, a household with 1,500 facts, 2,000 rows queued for other households):
- Facts read: 1.3 ms execution.
- Claim on an empty household queue: 1.1 ms.

The turn's extra work runs in parallel with the stored-row read, so it adds one round trip at most when the queue is empty. Rebuilds drop 14 table reads per household (the registry adapters). Live numbers after the deploy are below.

## Open / needs a person

- **14-058** covers:
  - builder tables as facts;
  - retiring the snapshot;
  - "look deeper" and the evaluation on facts;
  - re-describing facts when a member's or a parent row's name changes. Today such a fact keeps the old name until its own record is written again.
- `backup_services.covers` is a `text[]`, and the Phase 1 describer reads it as text, so "covers" is left out of that fact. This predates this PR.
- QA data: none was created on the live project.
