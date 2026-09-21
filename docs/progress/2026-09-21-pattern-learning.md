# Pattern learning: normal timing, without touching confirmed rules (03-007)

**Date:** 2026-09-21
**Area:** `packages/core/src/household/pattern-learning.ts`

## What was done

Story 03-007 ("Pattern learning — learn normal timing without overriding
confirmed rules") was the last untouched P1 in module 03 (Outcome & Routine
Engine); 03-001 through 03-006 were already `Done`. The story's acceptance
criteria are mostly the module's standard boilerplate (an outcome has a
desired state/owner/window/verification, replanning only touches affected
outcomes, exceptions are actionable, transitions are idempotent) — all
already satisfied by 03-001 through 03-005. The one criterion unique to this
story is in its own goal line: learn normal timing, without overriding a
confirmed rule.

`pattern-learning.ts` adds exactly that, as a small module built directly on
existing types rather than a new subsystem:

- `findTimingPattern(outcomes, outcomeKey)` looks at an outcome key's history
  of outcomes actually `met` (verified, not merely due — a missed or
  cancelled outcome says nothing about when this household normally
  finishes something) and measures, for each, how many minutes into its
  window it was verified. It calls a pattern only when there are at least 4
  such completions and they cluster tightly enough (consistency ≥ 0.6,
  computed from the standard deviation relative to the mean) — scattered
  history is refused rather than reported as a weak pattern, because a
  pattern claimed from noise would be worse than no pattern at all.
- `proposeTimingPattern(pattern, alreadyConfirmed)` turns a found pattern
  into the same `LearningProposal` shape module 14's `orchestrator.ts`
  already defines and every other learning path already uses: `sourceType:
  "observed"`, `status: "learned"`, confidence capped at 0.8. Confidence
  rises with both sample size and consistency together, not either alone —
  four identical readings and forty scattered ones should not earn the same
  trust. And when `alreadyConfirmed` is true, it returns `null` and proposes
  nothing at all — the story's own goal, made a caller-supplied fact so it is
  a tested behavior rather than something merely true by construction of the
  type system.

This is deliberately a pure domain function with no caller wired up yet, on
the same precedent 14-001 through 14-007 already established for this
codebase: `proposeLearning`'s output has always been a value a caller
decides what to do with (write a certification item as `learned`, surface
it in a review queue), never something this module writes itself. Wiring
"which job calls `findTimingPattern` on which schedule" is a separate
question — most naturally an orchestrator specialist's job, once the
orchestrator itself is wired into a live path (still open, per
`2026-09-21-multi-agent-coordination.md`) — and doing that here would have
meant guessing at scheduling infrastructure that doesn't exist rather than
building the one well-defined piece this story actually asks for.

## Where the code lives

- `packages/core/src/household/pattern-learning.ts` (new) — `findTimingPattern`, `proposeTimingPattern`.
- `packages/core/src/household/pattern-learning.test.ts` (new) — 11 tests.
- `backlogs/03-Outcome-and-Routine-Engine.md`, `tracking/PROGRESS.md`, `docs/PROGRESS.md` — 03-007 marked Done.

## Verified

- `npm run typecheck`, `npm run lint`, `npm run lint:boundaries`, `npm run lint:embeds`, `npm run lint:migrations` — all clean (no migration needed; this story adds no storage).
- `npm run test` — 1281 unit tests across 94 files (11 new).
- `npm run test:db` — 220 database tests, unaffected by this change.
- `npm run build` — clean.
- `npm run test:e2e` — 256 passing.
- `npm run brand -- --check` / `npm run tracker -- --check` — current.
- No UI or storage surface exists for this yet (nothing calls `findTimingPattern`), so there was nothing to verify in a browser or against RLS for this story.

## Still open

- Nothing calls `findTimingPattern`/`proposeTimingPattern` yet. The natural caller is a scheduled job or an orchestrator specialist that reads recent outcome history per household and turns any pattern it finds into a `certification_items` row with `status: 'learned'`, `source_type: 'observed'` — but that depends on the orchestrator's live-wiring gap noted in 14-007's progress note, so it was left for whoever picks that up.
- `03-008` (Optimization) is the module's other remaining story, P2, not started.
- `05-008` (Certification health) and `14-008` (Predictive intelligence) remain the other open P2 stories from prior activity.
