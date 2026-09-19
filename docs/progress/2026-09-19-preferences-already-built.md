# 01-007 was already built, under a different story number

**Date:** 2026-09-19
**Scope:** `backlogs/01-Identity-and-Family-Accounts.md` — bookkeeping only, no code
**Status:** Done

## What this note is

Not a build. Module 01's own tracker still listed story 01-007
("Preferences — capture member and household preferences") as Not Started.
It isn't: module 04 built the exact mechanism this story asks for, under
its own story numbers (04-007 "Memory extraction", 04-008 "Conversation
corrections", both already Done), and nobody had cross-referenced it back to
close 01-007's row. Picking it as "the next dependency-ready story" and
starting to rebuild it would have produced a second, competing preferences
system next to a working one.

## Why this is the same thing, not a coincidence

01-007's one specific acceptance criterion (the rest of the row is module-01
boilerplate about ownership and cross-household isolation, already covered
by 01-001 through 01-006) is:

> Preferences retain source and scope so household preferences are not
> confused with an individual member preference.

`packages/core/src/conversation/memory.ts` defines exactly that: a `Memory`
has a `scope` (`household` | `member`), a `source_type` (`setup` |
`conversation` | `integration` | `observed`) and a `status` (`learned` |
`confirmed` | `rejected` | `superseded`). `reconcileMemory` is the rule that
makes the distinction matter — an inference can never quietly overwrite
something a person confirmed, only a person correcting themselves can. The
`memories` table (migration `20260917021114`) enforces the pairing with a
constraint (`scope = 'member'` iff `member_id is not null`) and one live
belief per key.

The capture path is the assistant, not a form: `extractMemory` turns a
`set_preference` conversation intent into a `Memory`, and
`conversation/repository.ts`'s `remember()` writes it. That is consistent
with the product's own rule that talk and text share one conversation
engine rather than preferences having their own settings screen. The read
and correction path is Certification (module 05) — "what WonderHome
believes" is precisely a preference's scope, source and confidence, shown
back to the household to confirm or reject.

## What was verified (that this already works, not that it now does)

- `packages/core/src/conversation/memory.test.ts` — 14 cases, including
  "scopes a memory to one member when asked to" and "never lets an
  inference overwrite a confirmed fact"
- `scripts/test-conversation-rls.mjs` — "one live memory per key, with
  history preserved", "a member-scoped memory needs a member, and a
  household one must not have it", against real Postgres

Nothing was run again for this note; both suites are already part of the
standing `npm run test` / `npm run test:db` gates and were green before and
after this change (only backlog text and `docs/PROGRESS.md` changed).

## Where

`backlogs/01-Identity-and-Family-Accounts.md` (row + story detail),
`docs/PROGRESS.md` (regenerated). No source file touched.
