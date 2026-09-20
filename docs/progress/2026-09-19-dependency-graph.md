# Connecting outcomes to their real dependency graph (story 03-006)

**Date:** 2026-09-19
**Scope:** `packages/core/src/household/outcomes.ts`
**Status:** Done

## What this is

Story 03-006 from `backlogs/03-Outcome-and-Routine-Engine.md`: "Connect
upstream and downstream outcomes." Picked immediately after module 02
closed, per `tracking/IMPLEMENTATION-ORDER.md`'s phase order.

Investigated first, the way every story in this session has been. What was
found changes the shape of the story: `Outcome.dependencies`,
`evaluateOutcome`'s dependency checks, `detectException`'s
`dependency_failed` case, and `planReplan`'s transitive reachability
algorithm were **all already built and tested** (stories 03-001, 03-003,
03-004, 03-005). The graph traversal itself was never the gap.

The actual gap: nothing in the codebase ever *populates*
`outcome.dependencies`. Grepping for every caller of `evaluateOutcome`,
`planReplan` and `detectException` outside their own test file returns
nothing — this whole outcome engine has no repository, no database table,
no route, no screen. It exists today as pure, well-tested domain logic that
nothing has wired real data into yet. Every existing test hand-builds
`dependencies` directly on a fixture. That's the real "connect upstream and
downstream outcomes": turning a household's *actual* dependency edges into
the field the engine already knows how to use.

## What was built

`attachDependencies(outcomes, edges)` in
`packages/core/src/household/outcomes.ts` — pure, and deliberately built on
the exact edge shape `configuration.ts`'s own dependency graph already
uses: `{ itemKey, dependsOnKey }`, the same pair `canDependOn` validates
(and refuses a cycle for) when a household links one playbook item to
another. Given a flat list of outcomes and that same edge list, it returns
each outcome with its `dependencies` populated — the upstream outcome's
key *and its current status*, since that's what `evaluateOutcome` and
`planReplan` actually need to decide anything, not just the key.

Three things this deliberately does not do, and why:

- **No cycle detection.** A cycle is already refused at the moment an edge
  is created (`canDependOn`, in the playbook). Re-checking it here would be
  validating an invariant a different layer already guarantees, for data
  that — by the time it reaches this function — cannot violate it.
- **No new persistence.** This is the assembly step, not the repository
  that would read `playbook_items`/`playbook_dependencies` and real outcome
  instances from Supabase and call it. That repository doesn't exist yet
  for *any* part of this engine (03-001 through 03-005 included) — building
  it is bigger, separate work belonging to whichever story first needs the
  outcome engine to run against real household data, not a quiet expansion
  of this one story's scope.
- **A missing upstream instance is `"pending"`, not `"met"` or an error.**
  An outcome with no live instance this cycle (its routine hasn't fired
  yet) has had nothing observed about it — "pending" is the only honest
  reading, and it's already a first-class status the engine understands.

## What was verified

- `npm run typecheck` — clean
- `npx vitest run --root packages/core` — 1066 unit tests passing (was
  1060; +6: an outcome with no edges gets an empty list rather than
  nothing, a single dependency carries the target's live status, a missing
  upstream instance resolves to pending, an outcome waiting on more than
  one thing gets every edge, an edge never leaks onto the wrong outcome,
  and the assembled result feeds straight into `evaluateOutcome` and
  produces exactly the `"blocked"` result a hand-built dependency list
  already did)
- `npm run lint`, `npm run lint:boundaries`, `npm run lint:secrets` — clean
- `npm run security` — 9/9 P0 areas passing (unaffected; no new
  authorization surface — this module still has no repository or route)
- `npm run build` — succeeds
- `npx playwright test --project=desktop` — 126/126 unaffected
- `npm run tracker -- --check` — current (148/170)

## What is explicitly still open

- **The outcome engine still has no repository.** `attachDependencies` is
  ready for real data the moment something reads `playbook_items` and
  `playbook_dependencies` and calls it — but nothing does yet, for this
  story or any of 03-001 through 03-005. This is worth flagging plainly: it
  is a real, load-bearing gap in a module marked mostly Done, and closing
  it is its own piece of work, not something to fold quietly into a single
  P1 story's scope.
- Next in phase order: `03-007` Pattern learning (P1).

## Where

`packages/core/src/household/outcomes.ts` (`DependencyEdge`,
`attachDependencies`), `outcomes.test.ts`,
`backlogs/03-Outcome-and-Routine-Engine.md`, `tracking/PROGRESS.md`,
`docs/PROGRESS.md` (regenerated).
