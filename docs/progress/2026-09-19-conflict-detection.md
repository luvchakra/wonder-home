# Conflict detection (story 02-007) — module 02 done bar one story

**Date:** 2026-09-19
**Scope:** `packages/core/src/household/configuration.ts`, `configuration-repository.ts`, `apps/web/app/household/responsibilities/page.tsx`
**Status:** Done

## What this is

Story 02-007 from `backlogs/02-Household-Configuration-and-Playbook.md`:
"Detect contradictory rules and responsibilities... Conflicts identify the
two or more records/rules in conflict and provide a direct resolution
action." Picked as the next dependency-ready story per
`tracking/IMPLEMENTATION-ORDER.md`'s phase order (Phase 2, household
operating model) — every P0 story across every module is done; this is the
first P1 in phase order.

`validateResponsibility`'s own doc comment already drew the line this story
lives on: "The database already refuses a backup who is also the primary.
These are the contradictions it cannot see." That sentence is about what a
*new write* refuses. What it cannot see is a household that changes shape
*underneath* an assignment that was fine when it was made — a member leaves
and the outcome they owned still points at them, or an outcome that was not
adult-only when assigned later becomes one. Nothing re-validates an existing
row when the world around it changes; nobody notices until they happen to
resave that exact outcome. That gap is what this closes.

## What was built

`detectConflicts(responsibilities, members)` in
`packages/core/src/household/configuration.ts` — pure, and run over the
household's *current* state exactly as `validateResponsibility` runs over a
*proposed* one, checking for:

- **`orphaned_owner` / `orphaned_backup`** — the primary or backup member on
  a responsibility is no longer among the household's active members.
- **`same_backup_as_owner`** — a responsibility's backup is the same person
  as its owner. `validateResponsibility` refuses this at write time; this
  catches it regardless of how the row came to be that way, rather than
  assuming the write path is the only way data reaches this table.
- **`child_owns_adult_only`** — a child is primary or backup on an outcome
  under `ADULT_ONLY_PREFIXES` (finance, bills, payments, security,
  household admin).

Each conflict names the outcome, the member(s) involved, a plain-language
`message`, and one `resolution` — never a diagnosis to work out. A stable
`id` (outcome key + kind) lets a screen key a list on it without an index.

`listConfigurationConflicts` in `configuration-repository.ts` reads the
same two things `saveResponsibility` already validates a new write against
— `listResponsibilities` and the household's currently *active* members
(`listMembers` filtered to `status === "active"`, since a removed member is
a status flip, not a row deletion) — and calls `detectConflicts` on them.

Surfaced on `/household/responsibilities`: a banner above the existing
"unowned" gaps banner, styled the same way (`--wh-attention-soft`), listing
each conflict's message and resolution, each row linking an admin straight
to the setup wizard's responsibilities step — the one place the ownership
that needs fixing actually gets reassigned. A non-admin sees the same list
without the link, since the fix itself is admin-only (the setup wizard
already gates on `household.manage` and shows its own explanation if a
non-admin somehow lands there).

## What was verified

- `npm run typecheck` — clean
- `npx vitest run --root packages/core` — 1045 unit tests passing (was
  1036; +9 for `detectConflicts`: a clean assignment reports nothing, each
  of the four conflict kinds is caught individually, conflicts across
  multiple outcomes are all reported independently, a child correctly
  raises nothing on an outcome that *is* a child's to carry, and every
  conflict this function can produce carries a non-empty resolution)
- `npm run lint`, `npm run lint:boundaries`, `npm run lint:secrets` — clean
- `npm run security` — 9/9 P0 areas passing (unaffected; this is a read-only
  detection surface, no new write path, no new authorization boundary)
- `npm run build` — succeeds
- `npx playwright test --project=desktop` — 126/126 unaffected
- `npm run tracker -- --check` — current after reconciling
  `tracking/PROGRESS.md`'s summary table against the actual backlog state
  (see below)

## A tracker correction, found along the way

`tracking/PROGRESS.md`'s top-line summary (132/170, 77.6%) had drifted well
behind `docs/PROGRESS.md`'s generated count (145/170, 85.3%, as of the same
date) — several sessions' worth of story completions had updated their
backlog file correctly but not this hand-maintained summary table. Reconciled
it against the generated ground truth plus this story's own completion
(146/170 now); `docs/PROGRESS.md` remains the one to trust if the two numbers
ever disagree again, since it is regenerated from the backlogs rather than
hand-kept.

## What is explicitly still open

- **02-008 — Advanced rule builder** (P2, conditional household policies) is
  the last story in this module.
- Everything else in `tracking/PROGRESS.md`'s "What is left" list is
  unaffected by this change — this closed exactly one P1 story in module 02.

## Where

`packages/core/src/household/configuration.ts` (`detectConflicts`),
`configuration.test.ts`, `configuration-repository.ts`
(`listConfigurationConflicts`),
`apps/web/app/household/responsibilities/page.tsx`,
`backlogs/02-Household-Configuration-and-Playbook.md`,
`tracking/PROGRESS.md`, `docs/PROGRESS.md` (regenerated).
