# Multi-agent coordination: specialists that collaborate through contracts (14-007)

**Date:** 2026-09-21
**Area:** `packages/core/src/ai/specialists.ts`, `orchestrator.ts`, `multi-agent-evaluations.ts`

## What was done

Story 14-007 ("Multi-agent coordination — allow specialist agents to
collaborate through contracts") was the last P1 story in module 14 (AI
Orchestration & Learning); everything else in the module was already `Done`.
Before writing anything, I surveyed what module 14 had actually built
(14-001 through 14-006): a pure, well-tested `orchestrator.ts`
(observe→understand→plan→act→monitor→learn state machine,
`executeStep`/`advance`), a governed tool registry (`tools.ts`,
`authorizeToolCall`) that independently re-checks scope/entitlement/
permission/autonomy on every call, and an `agent_runs`/`agent_tool_calls`/
`approvals` schema built to hold a safe summary and plan, never raw prompts.
There was no "specialist" concept anywhere, and no code that decomposed one
goal into several domain-specific tool calls.

`specialists.ts` adds that layer on top of the existing registry rather than
inventing a new one. Five named specialists — `meals`, `pets`, `home`
(assets), `bills`, `groceries` — each take the household's current assessed
state (the same `HomeAssessment[]` shape module 13's `assessMeal`,
`assessAsset` and `assessPetCare` already produce, keyed by `subjectKey`
prefix) and propose `PlannedStep`s for `tools.ts`'s existing tools. A
specialist never calls a tool itself — `authorizeToolCall` stays the one
place a step is allowed to happen.

The collaboration is real, not decorative: a meal missing an ingredient and
a pet low on food both resolve to "put it on the shopping list", so `meals`
and `pets` don't act on that themselves — each hands a `grocery_list`
contract to `groceries`, which is the only specialist that reads its own
domain's `HomeAssessment`s not at all and instead consolidates every
contract it received into one deduplicated set of `list.add_item` steps.
`coordinate()` runs the five specialists in a fixed order (producers before
the one consumer) and returns one ordered plan plus every contract produced,
whether or not any step goes on to execute — this is the "orchestrator
decomposes household goals into governed domain actions and records the
plan" half of the acceptance criteria, expressed as multiple specialists
rather than one monolithic planner.

`AgentRun` (in `orchestrator.ts`) gained a `contracts: Contract[]` field,
and a new migration adds the matching `agent_runs.contracts` column,
mirroring the existing `plan jsonb` column so the persistence shape is ready
alongside it. `Contract` and `ContractType` live in `orchestrator.ts` (not
`specialists.ts`) specifically to avoid a circular import, since `AgentRun`
needs the type and `specialists.ts` needs `PlannedStep` from `orchestrator.ts`.

New `multi-agent-evaluations.ts` fixtures (mirroring the existing
`evaluations.ts` golden-scenario pattern) cover the acceptance criterion's
named cases against the real `coordinate()`/`authorizeToolCall()` functions,
never a model: a cross-domain handoff (a meal and a pet both feeding
groceries), an ambiguous request touching three domains at once, a routine
day where every assessment is on-track (an empty plan, matching the product
rule that normal routines are silent), and two unsafe-action attempts — a
specialist proposing a payment and a specialist proposing a service booking
the actor has no permission for — where the fixture checks that the gate,
not the specialist, is what refuses or holds the step for approval.

## What was found and deliberately left out of scope

The survey turned up a real gap: `orchestrator.ts`/`tools.ts`/the
`agent_runs` tables are not wired into the live conversation path today.
`apps/web/app/api/.../conversation/route.ts` goes through
`conversation/proposal.ts` and `executor.ts`, which re-implement their own
authorization check (`decideAutonomy` + `can()` directly) rather than
calling `authorizeToolCall`, and nothing on that path ever writes an
`agent_run` or `agent_tool_call` row. So 14-001–14-006 are "Done" as
isolated, tested modules and schema — the same status this story's work
now shares — not as integrated live behavior.

I did not fold that wiring into this story. It is a materially larger,
riskier change (replacing a working, tested authorization path in the live
conversation flow) than a P1 coordination-layer story warrants on its own,
and 14-001 through 14-006 already established the precedent that this
module's stories can be "Done" as tested, correct modules ahead of live
integration. It is recorded here so the gap is visible rather than
rediscovered from scratch later.

## Where the code lives

- `packages/core/src/ai/orchestrator.ts` — `Contract`, `ContractType`, `AgentRun.contracts`.
- `packages/core/src/ai/specialists.ts` (new) — the five specialists, `handoff()`, `coordinate()`.
- `packages/core/src/ai/specialists.test.ts` (new) — per-specialist and full-coordination tests.
- `packages/core/src/ai/multi-agent-evaluations.ts` / `.test.ts` (new) — the four required scenario categories.
- `supabase/migrations/20260921050000_agent_run_contracts.sql` (new) — `agent_runs.contracts` column.
- `backlogs/14-AI-Orchestration-and-Learning.md`, `tracking/PROGRESS.md`, `docs/PROGRESS.md` — 14-007 marked Done.

## Verified

- `npm run typecheck`, `npm run lint`, `npm run lint:boundaries`, `npm run lint:embeds`, `npm run lint:migrations` — all clean.
- `npm run test` — 1270 unit tests across 93 files (39 new: 12 orchestrator, 15 specialists, 12 multi-agent evaluations).
- `npm run test:db` — 220 database tests, including the new migration applying cleanly alongside the existing 32.
- `npm run build` — clean.
- `npm run test:e2e` — 256 passing.
- `npm run brand -- --check` / `npm run tracker -- --check` — current.
- No UI surface exists for agent runs today (module 16's `ai-operations` endpoints are API-only, matching the same precedent), so there was nothing to verify in a browser for this story.

## Still open

- The live-wiring gap above: `orchestrator.ts`/`tools.ts` are not called from the live conversation path, and nothing today writes to `agent_runs`/`agent_tool_calls`/the new `contracts` column. Whoever picks this up next should treat it as its own piece of work, not a small addition — it touches a live, tested feature.
- `14-008` (Predictive intelligence) is the module's other remaining story, P2, not started.
- `05-008` (Certification health) remains the other open P2 story from the previous activity.
